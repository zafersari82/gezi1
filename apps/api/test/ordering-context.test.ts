import { randomUUID } from "node:crypto";

import { liveReplaySchema, orderSchema, tableSessionSchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { as, startTestApp, type TestApp } from "./support/harness";
import { createRestaurantFixture } from "./support/restaurant-fixture";
import { scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

/** Restoran örneğinde bir masa açar ve müşteriyi oturuma katar. */
async function seated(f: Awaited<ReturnType<typeof createRestaurantFixture>>, label: string) {
  const owner = as(app, f.owner);
  const root = `/v1/business/${f.businessId}`;
  const table = await owner.ok(z.object({ id: z.uuid() }), "POST", `${root}/tables`, {
    body: { branchId: f.branchId, appInstanceId: f.instanceId, label, active: true },
  });
  const qr = await owner.ok(
    z.object({ value: z.string() }),
    "POST",
    `${root}/tables/${table.id}/qr`,
    { body: {} },
  );
  return as(app, f.customer).ok(
    tableSessionSchema,
    "POST",
    `/v1/shell/${f.businessId}/${f.instanceId}/table-sessions`,
    { body: { qr: qr.value } },
  );
}

describe("sipariş bağlamı", () => {
  it("masa siparişi bağlamı sepetten alır, adını paketten gösterir; canlı olaylar bağlamı taşır", async () => {
    const f = await createRestaurantFixture(app);
    const session = await seated(f, "Bahçe 5");
    const context = { kind: "table_session" as const, id: session.id };
    const opened = await app.services.ordering.openCart(f.customerScope, f.branchId, {
      fulfilment: "dine_in",
      context,
      scheduledAt: null,
    });
    expect(opened.context).toEqual(context);
    const cart = await app.services.ordering.replaceCart(f.customerScope, opened.id, {
      expectedVersion: opened.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
    });
    const created = await app.services.ordering.checkout(f.customerScope, cart.id, randomUUID(), {
      cartVersion: cart.version,
      seenTotalMinor: cart.totalMinor,
      quoteHash: cart.quoteHash,
    });
    const order = orderSchema.parse(created.body);
    expect(order).toMatchObject({ fulfilment: "dine_in", context, contextLabel: "Bahçe 5" });

    const shell = `/v1/shell/${f.businessId}/${f.instanceId}`;
    await as(app, f.customer).ok(
      z.object({ id: z.uuid() }),
      "POST",
      `${shell}/table-sessions/${session.id}/requests`,
      { body: { kind: "waiter" }, headers: { "idempotency-key": randomUUID() } },
    );
    const live = await as(app, f.owner).ok(
      liveReplaySchema,
      "GET",
      `/v1/business/${f.businessId}/live-events?cursor=0`,
    );
    expect(live.items.find((e) => e.orderId === order.id)?.context).toEqual(context);
    expect(live.items.find((e) => e.type === "table.requested")).toMatchObject({
      context,
      orderId: null,
      branchId: f.branchId,
    });

    // Bağlam ve teslim saati sonradan değiştirilemez.
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`update orders set context_id = ${randomUUID()}, version = version + 1
          where business_id = ${f.businessId} and id = ${order.id}`),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("bağlam başka şubenin masa oturumunu gösteremez; biçimin istemediği bağlam reddedilir", async () => {
    const f = await createRestaurantFixture(app);
    const g = await createRestaurantFixture(app);
    const foreign = await seated(g, "Yabancı masa");
    await expect(
      app.services.ordering.openCart(f.customerScope, f.branchId, {
        fulfilment: "dine_in",
        context: { kind: "table_session", id: foreign.id },
        scheduledAt: null,
      }),
    ).rejects.toMatchObject({ code: "fulfilment_unavailable" });
    const own = await seated(f, "Kendi masası");
    await expect(
      app.services.ordering.openCart(f.customerScope, f.branchId, {
        fulfilment: "pickup",
        context: { kind: "table_session", id: own.id },
        scheduledAt: null,
      }),
    ).rejects.toMatchObject({ code: "fulfilment_unavailable" });
    // Doğrudan SQL ile başka işletmenin oturumu bağlam yapılamaz.
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`update carts set context_kind = 'table_session', context_id = ${foreign.id},
            fulfilment = 'dine_in', version = version + 1
          where business_id = ${f.businessId} and id = ${f.cart.id}`),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("tahsilat yeri teslim biçiminin kaydından gelir: gel-al siparişi masada ödenmez", async () => {
    const f = await createRestaurantFixture(app);
    const owner = as(app, f.owner);
    const root = `/v1/business/${f.businessId}`;
    await owner.ok(orderSchema, "POST", `${root}/orders/${f.order.id}/accept`, {
      body: { expectedVersion: 1, preparationMinutes: 15 },
    });
    await owner.fail("order_state_invalid", "POST", `${root}/orders/${f.order.id}/payment`, {
      body: { expectedPaymentVersion: 0, place: "table", method: "cash" },
    });
    await expect(
      scoped(app.db, f.businessId, async (tx) => {
        const member = await tx.one<{ id: string }>(
          sql`select id from business_members where business_id = ${f.businessId} and role = 'owner'`,
        );
        await tx.execute(sql`insert into order_payments (business_id, order_id, amount_minor, place, method, member_id)
          values (${f.businessId}, ${f.order.id}, ${f.order.totalMinor}, 'table', 'cash', ${member.id})`);
      }),
    ).rejects.toMatchObject({ code: "23514" });
    await owner.ok(orderSchema, "POST", `${root}/orders/${f.order.id}/payment`, {
      body: { expectedPaymentVersion: 0, place: "counter", method: "card" },
    });
  });
});
