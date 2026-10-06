import { orderSchema } from "@vado/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { as, startTestApp, type TestApp } from "./support/harness";
import { createRestaurantFixture } from "./support/restaurant-fixture";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});
it("başka müşteri siparişi ve masa hesabını göremez; aynı masada yalnız kendi hesabını alır", async () => {
  const f = await createRestaurantFixture(app);
  const other = await createTenantFixture(app);
  const otherScope = await app.services.businessManagement.customerScope(
    other.customer.id,
    f.businessId,
    f.instanceId,
  );
  await expect(app.services.ordering.getOrder(otherScope, f.order.id)).rejects.toMatchObject({
    code: "not_found",
  });
  const owner = as(app, f.owner);
  const root = `/v1/business/${f.businessId}`;
  const table = await owner.ok(z.object({ id: z.uuid() }), "POST", `${root}/tables`, {
    body: { branchId: f.branchId, appInstanceId: f.instanceId, label: "Masa 7", active: true },
  });
  const qr = await owner.ok(
    z.object({ value: z.string() }),
    "POST",
    `${root}/tables/${table.id}/qr`,
    { body: {} },
  );
  const shell = `/v1/shell/${f.businessId}/${f.instanceId}`;
  const session = await as(app, f.customer).ok(
    z.object({ id: z.uuid() }),
    "POST",
    `${shell}/table-sessions`,
    { body: { qr: qr.value } },
  );
  await as(app, other.customer).fail(
    "not_found",
    "GET",
    `${shell}/table-sessions/${session.id}/bill`,
  );
  await as(app, other.customer).ok(z.object({ id: z.uuid() }), "POST", `${shell}/table-sessions`, {
    body: { qr: qr.value },
  });
  const opened = await app.services.ordering.openCart(f.customerScope, f.branchId, {
    fulfilment: "dine_in",
    tableSessionId: session.id,
    scheduledAt: null,
  });
  const cart = await app.services.ordering.replaceCart(f.customerScope, opened.id, {
    expectedVersion: opened.version,
    lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
  });
  const created = await app.services.ordering.checkout(f.customerScope, cart.id, cart.id, {
    cartVersion: cart.version,
    seenTotalMinor: cart.totalMinor,
    quoteHash: cart.quoteHash,
  });
  expect(created.status).toBe(200);
  expect(
    (await as(app, other.customer).request("GET", `${shell}/table-sessions/${session.id}/bill`))
      .body,
  ).toMatchObject({ ownTotalMinor: 0 });
});
it("mutfak aktif siparişte kapatılamaz; planlama bağımlılığı ve yabancı QR reddedilir", async () => {
  const f = await createRestaurantFixture(app);
  const owner = as(app, f.owner);
  const path = `/v1/business/${f.businessId}/app-instances/${f.instanceId}/capabilities`;
  expect(
    await owner.request("PUT", `${path}/ordering.kitchen`, {
      body: { version: "1.0.0", enabled: false, config: {} },
    }),
  ).toMatchObject({ status: 409, body: { error: { code: "capability_in_use" } } });
  expect(
    await owner.request("PUT", `${path}/ordering.pickup`, {
      body: { version: "1.0.0", enabled: false, config: {} },
    }),
  ).toMatchObject({ status: 400 });
  const g = await createRestaurantFixture(app);
  const table = await as(app, g.owner).ok(
    z.object({ id: z.uuid() }),
    "POST",
    `/v1/business/${g.businessId}/tables`,
    { body: { branchId: g.branchId, appInstanceId: g.instanceId, label: "Masa 8", active: true } },
  );
  const qr = await as(app, g.owner).ok(
    z.object({ value: z.string() }),
    "POST",
    `/v1/business/${g.businessId}/tables/${table.id}/qr`,
    { body: {} },
  );
  expect(
    await as(app, f.customer).request(
      "POST",
      `/v1/shell/${f.businessId}/${f.instanceId}/table-sessions`,
      { body: { qr: qr.value } },
    ),
  ).toMatchObject({ status: 400 });
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(
        sql`update app_instance_capabilities set enabled=false where business_id=${f.businessId} and app_instance_id=${f.instanceId} and capability_id='ordering.kitchen'`,
      ),
    ),
  ).rejects.toMatchObject({ code: "23514" });
});
it("tahsil edilmiş sipariş iptal edilemez; SQL karar bilgisini bağımsız ekleyemez", async () => {
  const f = await createRestaurantFixture(app);
  const order = await app.services.ordering.accept(f.scope, f.order.id, {
    expectedVersion: 1,
    preparationMinutes: 20,
  });
  await app.services.ordering.recordPayment(f.scope, order.id, {
    expectedPaymentVersion: 0,
    place: "counter",
    method: "cash",
  });
  expect(
    await as(app, f.owner).request(
      "PUT",
      `/v1/business/${f.businessId}/orders/${order.id}/status`,
      { body: { expectedVersion: order.version, status: "cancelled" } },
    ),
  ).toMatchObject({ status: 409 });
  expect(await app.services.ordering.getOrder(f.customerScope, order.id)).toMatchObject({
    status: "accepted",
    paymentStatus: "paid",
  });
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(
        sql`update orders set status='preparing',version=version+1,rejection_reason='İlgisiz gerekçe' where business_id=${f.businessId} and id=${order.id}`,
      ),
    ),
  ).rejects.toMatchObject({ code: "23514" });
  expect(
    orderSchema.parse(await app.services.ordering.getOrder(f.customerScope, order.id)).version,
  ).toBe(2);
});
it("açık oturumlu masayı kapatamaz; etiketi beklenen sürümle değiştirir", async () => {
  const f = await createRestaurantFixture(app);
  const owner = as(app, f.owner);
  const root = `/v1/business/${f.businessId}`;
  const table = await owner.ok(
    z.object({ id: z.uuid(), version: z.number() }),
    "POST",
    `${root}/tables`,
    { body: { branchId: f.branchId, appInstanceId: f.instanceId, label: "Masa 9", active: true } },
  );
  const qr = await owner.ok(
    z.object({ value: z.string() }),
    "POST",
    `${root}/tables/${table.id}/qr`,
    { body: {} },
  );
  await as(app, f.customer).request(
    "POST",
    `/v1/shell/${f.businessId}/${f.instanceId}/table-sessions`,
    { body: { qr: qr.value } },
  );
  expect(
    await owner.request("PUT", `${root}/tables/${table.id}`, {
      body: { expectedVersion: table.version, label: "Masa 9", active: false },
    }),
  ).toMatchObject({ status: 409, body: { error: { code: "table_in_use" } } });
  expect(
    await owner.request("PUT", `${root}/tables/${table.id}`, {
      body: { expectedVersion: table.version, label: "Bahçe 9", active: true },
    }),
  ).toMatchObject({ status: 200, body: { label: "Bahçe 9", version: 2 } });
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(
        sql`update restaurant_tables set active=false where business_id=${f.businessId} and id=${table.id}`,
      ),
    ),
  ).rejects.toMatchObject({ code: "23514" });
});
