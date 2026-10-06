import { randomUUID } from "node:crypto";

import { cartSchema, orderSchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { createCatalogFixture } from "./support/catalog-fixture";
import { as, startTestApp, type TestApp } from "./support/harness";
import { scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});
async function fixture() {
  const f = await createCatalogFixture(app);
  await app.services.businessManagement.setHours(f.scope, f.branchId, {
    hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: 0, closesAt: 1440 })),
  });
  for (const capabilityId of [
    "ordering.pickup",
    "ordering.scheduling",
    "ordering.table_service",
    "ordering.kitchen",
  ]) {
    const result = await as(app, f.owner).request(
      "PUT",
      `/v1/business/${f.businessId}/app-instances/${f.instanceId}/capabilities/${capabilityId}`,
      { body: { version: "1.0.0", enabled: true, config: {} } },
    );
    expect(result.status).toBe(200);
  }
  return {
    ...f,
    client: as(app, f.customer),
    ownerClient: as(app, f.owner),
    root: `/v1/shell/${f.businessId}/${f.instanceId}`,
  };
}
async function filled(f: Awaited<ReturnType<typeof fixture>>, body: Record<string, unknown> = {}) {
  const opened = await f.client.ok(cartSchema, "POST", `${f.root}/carts`, {
    body: { branchId: f.branchId, ...body },
  });
  return f.client.ok(cartSchema, "PUT", `${f.root}/carts/${opened.id}`, {
    body: {
      expectedVersion: opened.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [], note: "Az tuzlu" }],
    },
  });
}
async function checkout(f: Awaited<ReturnType<typeof fixture>>, cart: z.infer<typeof cartSchema>) {
  return f.client.request("POST", `${f.root}/carts/${cart.id}/checkout`, {
    headers: { "idempotency-key": randomUUID() },
    body: { cartVersion: cart.version, seenTotalMinor: cart.totalMinor, quoteHash: cart.quoteHash },
  });
}
describe("Restoran siparişinin gerçek işlemleri", () => {
  it("ileri saati sunucuda seçer; hazırlık için erken ve kapalı saat reddedilir", async () => {
    const f = await fixture();
    const slots = await f.client.ok(
      z.object({ items: z.array(z.object({ at: z.iso.datetime() })) }),
      "GET",
      `${f.root}/fulfilment-slots?branchId=${f.branchId}`,
    );
    expect(slots.items.length).toBeGreaterThan(0);
    const at = slots.items[0]?.at;
    const cart = await filled(f, { scheduledAt: at });
    expect(cart).toMatchObject({ scheduledAt: at, lines: [{ note: "Az tuzlu" }] });
    const order = orderSchema.parse((await checkout(f, cart)).body);
    expect(order).toMatchObject({
      scheduledAt: at,
      paymentStatus: "pending",
      lines: [{ note: "Az tuzlu" }],
    });
    const early = await f.client.request("POST", `${f.root}/carts`, {
      body: { branchId: f.branchId, scheduledAt: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(early).toMatchObject({
      status: 409,
      body: { error: { code: "fulfilment_unavailable" } },
    });
    await app.services.businessManagement.setHours(f.scope, f.branchId, { hours: [] });
    expect(
      await f.client.request("POST", `${f.root}/carts`, {
        body: { branchId: f.branchId, scheduledAt: at },
      }),
    ).toMatchObject({ status: 409, body: { error: { code: "fulfilment_unavailable" } } });
  });
  it("sepet açıkken şube kapanırsa checkout sipariş oluşturmaz", async () => {
    const f = await fixture();
    const cart = await filled(f);
    await app.services.businessManagement.setHours(f.scope, f.branchId, { hours: [] });
    expect(await checkout(f, cart)).toMatchObject({
      status: 409,
      body: { error: { code: "branch_closed" } },
    });
    expect(
      await scoped(app.db, f.businessId, (tx) =>
        tx.many(sql`select id from orders where cart_id=${cart.id}`),
      ),
    ).toEqual([]);
  });
  it("kabul için tahmini süre ve ret için gerekçe zorunludur; müşteri aynı bilgiyi görür", async () => {
    const f = await fixture();
    const cart = await filled(f);
    const order = orderSchema.parse((await checkout(f, cart)).body);
    const path = `/v1/business/${f.businessId}/orders/${order.id}`;
    expect(
      await f.ownerClient.request("PUT", `${path}/status`, {
        body: { expectedVersion: 1, status: "accepted" },
      }),
    ).toMatchObject({ status: 409, body: { error: { code: "order_decision_required" } } });
    expect(
      await f.ownerClient.request("POST", `${path}/accept`, {
        body: { expectedVersion: 1, preparationMinutes: 25 },
      }),
    ).toMatchObject({ status: 200, body: { status: "accepted", preparationMinutes: 25 } });
    const own = await f.client.ok(orderSchema, "GET", `${f.root}/orders/${order.id}`);
    expect(Date.parse(own.estimatedReadyAt ?? "") - Date.now()).toBeGreaterThan(24 * 60_000);
    const next = orderSchema.parse((await checkout(f, await filled(f))).body);
    expect(
      await f.ownerClient.request("POST", `/v1/business/${f.businessId}/orders/${next.id}/reject`, {
        body: { expectedVersion: 1, reason: "Malzeme tükendi" },
      }),
    ).toMatchObject({
      status: 200,
      body: { status: "rejected", rejectionReason: "Malzeme tükendi" },
    });
    expect(await f.client.ok(orderSchema, "GET", `${f.root}/orders/${next.id}`)).toMatchObject({
      rejectionReason: "Malzeme tükendi",
    });
  });
  it("terminal siparişte kasadan tahsilat ayrı değişmez kayıttır; çift dokunma yeniden tahsil etmez", async () => {
    const f = await fixture();
    let order = orderSchema.parse((await checkout(f, await filled(f))).body);
    const path = `/v1/business/${f.businessId}/orders/${order.id}`;
    order = await f.ownerClient.ok(orderSchema, "POST", `${path}/accept`, {
      body: { expectedVersion: order.version, preparationMinutes: 20 },
    });
    for (const status of ["preparing", "ready", "completed"])
      order = await f.ownerClient.ok(orderSchema, "PUT", `${path}/status`, {
        body: { expectedVersion: order.version, status },
      });
    const body = { expectedPaymentVersion: 0, place: "counter", method: "cash" };
    const results = await Promise.all([
      f.ownerClient.request("POST", `${path}/payment`, { body }),
      f.ownerClient.request("POST", `${path}/payment`, { body }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await f.client.ok(orderSchema, "GET", `${f.root}/orders/${order.id}`)).toMatchObject({
      status: "completed",
      version: order.version,
      paymentStatus: "paid",
      paymentVersion: 1,
    });
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`update order_payments set amount_minor=1 where order_id=${order.id}`),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("imzalı masa QR'sı oturuma bağlanır; garson ve hesap çağrısı tekrarda çoğalmaz", async () => {
    const f = await fixture();
    const table = await f.ownerClient.ok(
      z.object({ id: z.uuid() }),
      "POST",
      `/v1/business/${f.businessId}/tables`,
      {
        body: { branchId: f.branchId, appInstanceId: f.instanceId, label: "Masa 4", active: true },
      },
    );
    const qr = await f.ownerClient.ok(
      z.object({ value: z.string() }),
      "POST",
      `/v1/business/${f.businessId}/tables/${table.id}/qr`,
      { body: {} },
    );
    const session = await f.client.ok(
      z.object({ id: z.uuid(), tableId: z.uuid() }),
      "POST",
      `${f.root}/table-sessions`,
      { body: { qr: qr.value } },
    );
    expect(session.tableId).toBe(table.id);
    const cart = await filled(f, { fulfilment: "dine_in", tableSessionId: session.id });
    const order = orderSchema.parse((await checkout(f, cart)).body);
    expect(order.fulfilment).toBe("dine_in");
    const key = randomUUID();
    const path = `${f.root}/table-sessions/${session.id}/requests`;
    const request = { body: { kind: "bill" }, headers: { "idempotency-key": key } };
    expect(await f.client.request("POST", path, request)).toMatchObject({ status: 200 });
    expect(await f.client.request("POST", path, request)).toMatchObject({ status: 200 });
    const bill = await f.client.request("GET", `${f.root}/table-sessions/${session.id}/bill`);
    expect(bill).toMatchObject({ status: 200, body: { ownTotalMinor: order.totalMinor } });
    expect(
      await scoped(app.db, f.businessId, (tx) =>
        tx.many(sql`select id from table_service_requests where table_session_id=${session.id}`),
      ),
    ).toHaveLength(1);
    const forged = qr.value.slice(0, -2) + "XX";
    expect(
      await f.client.request("POST", `${f.root}/table-sessions`, { body: { qr: forged } }),
    ).toMatchObject({ status: 400 });
  });
});
