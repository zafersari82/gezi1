import { randomUUID } from "node:crypto";

import {
  businessTableBillSchema,
  orderSchema,
  restaurantContextSchema,
  tableSessionSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";

import { as, startTestApp, type TestApp } from "./support/harness";
import { createRestaurantFixture } from "./support/restaurant-fixture";
let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});
it("masa hesabı kimlik ve sürüm taşır; aktif veya ödenmemiş hesabı kapatma 409 döner", async () => {
  const f = await createRestaurantFixture(app);
  const owner = as(app, f.owner);
  const customer = as(app, f.customer);
  const root = `/v1/business/${f.businessId}`;
  const shell = `/v1/shell/${f.businessId}/${f.instanceId}`;
  const table = await owner.ok(z.object({ id: z.uuid() }), "POST", `${root}/tables`, {
    body: {
      branchId: f.branchId,
      appInstanceId: f.instanceId,
      label: "Denetim masası",
      active: true,
    },
  });
  const qr = await owner.ok(
    z.object({ value: z.string() }),
    "POST",
    `${root}/tables/${table.id}/qr`,
    { body: {} },
  );
  const session = await customer.ok(tableSessionSchema, "POST", `${shell}/table-sessions`, {
    body: { qr: qr.value },
  });
  const opened = await app.services.ordering.openCart(f.customerScope, f.branchId, {
    fulfilment: "dine_in",
    context: { kind: "table_session", id: session.id },
    scheduledAt: null,
  });
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
  expect(
    await owner.request("POST", `${root}/table-sessions/${session.id}/close`, {
      body: { expectedVersion: session.version },
    }),
  ).toMatchObject({ status: 409, body: { error: { code: "table_in_use" } } });
  const bill = await owner.ok(
    businessTableBillSchema,
    "GET",
    `${root}/table-sessions/${session.id}/bill`,
  );
  expect(bill).toMatchObject({
    id: session.id,
    version: 1,
    status: "open",
    label: "Denetim masası",
    dueMinor: order.totalMinor,
  });
  await owner.fail("not_found", "GET", `${root}/table-sessions/${randomUUID()}/bill`);
  await owner.ok(orderSchema, "POST", `${root}/orders/${order.id}/accept`, {
    body: { expectedVersion: 1, preparationMinutes: 20 },
  });
  for (const [i, status] of ["preparing", "ready", "completed"].entries())
    await owner.ok(orderSchema, "PUT", `${root}/orders/${order.id}/status`, {
      body: { expectedVersion: i + 2, status },
    });
  await owner.fail("table_in_use", "POST", `${root}/table-sessions/${session.id}/close`, {
    body: { expectedVersion: 1 },
  });
  await owner.ok(orderSchema, "POST", `${root}/orders/${order.id}/payment`, {
    body: { expectedPaymentVersion: 0, place: "table", method: "cash" },
  });
  expect(
    await owner.request("POST", `${root}/table-sessions/${session.id}/close`, {
      body: { expectedVersion: 1 },
    }),
  ).toMatchObject({ status: 200, body: { status: "closed", version: 2 } });
});
it("restoran bağlamı işletmeye bağlıdır; mutfak kuyruğu gerçek seçenek ve notları getirir", async () => {
  const f = await createRestaurantFixture(app);
  const context = await as(app, f.customer).ok(
    restaurantContextSchema,
    "GET",
    `/v1/shell/${f.businessId}/${f.instanceId}/restaurant`,
  );
  expect(context).toMatchObject({ businessId: f.businessId, appInstanceId: f.instanceId });
  const queue = await as(app, f.owner).ok(
    z.object({ items: z.array(orderSchema), nextCursor: z.string().nullable() }),
    "GET",
    `/v1/business/${f.businessId}/kitchen-queue?active=true&appInstanceId=${f.instanceId}`,
  );
  expect(queue.items).toHaveLength(1);
  expect(queue.items[0]?.lines[0]?.note).toBe("Az tuzlu");
});

it("mutfak kuyruğu önce en eskiyi getirir; imleçle sonraki işi kaybetmez", async () => {
  const f = await createRestaurantFixture(app);
  const opened = await app.services.ordering.openCart(f.customerScope, f.branchId);
  const cart = await app.services.ordering.replaceCart(f.customerScope, opened.id, {
    expectedVersion: opened.version,
    lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
  });
  const made = await app.services.ordering.checkout(f.customerScope, cart.id, cart.id, {
    cartVersion: cart.version,
    seenTotalMinor: cart.totalMinor,
    quoteHash: cart.quoteHash,
  });
  const second = orderSchema.parse(made.body);
  const page = await app.services.ordering.listQueue(f.scope, {
    limit: 1,
    appInstanceId: f.instanceId,
    active: true,
  });
  expect(page.items.map((o) => o.id)).toEqual([f.order.id]);
  expect(page.nextCursor).toBe(f.order.id);
  const next = await app.services.ordering.listQueue(f.scope, {
    limit: 1,
    appInstanceId: f.instanceId,
    active: true,
    cursor: page.nextCursor ?? "",
  });
  expect(next.items.map((o) => o.id)).toEqual([second.id]);
});
