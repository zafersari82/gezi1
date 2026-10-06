import { randomUUID } from "node:crypto";

import { cartSchema, orderSchema, tableSessionSchema } from "@vado/contracts";
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

it("hazırlık süresi değişip teslim saati geçersizleşen sepet sunucuda bırakılabilir", async () => {
  const f = await createRestaurantFixture(app);
  const client = as(app, f.customer);
  const root = `/v1/shell/${f.businessId}/${f.instanceId}`;
  const slots = await client.ok(
    z.object({ items: z.array(z.object({ at: z.string() })) }),
    "GET",
    `${root}/fulfilment-slots?branchId=${f.branchId}`,
  );
  const cart = await client.ok(cartSchema, "POST", `${root}/carts`, {
    body: { branchId: f.branchId, scheduledAt: slots.items[0]?.at },
  });
  await as(app, f.owner).request(
    "PUT",
    `/v1/business/${f.businessId}/branches/${f.branchId}/ordering-settings`,
    { body: { expectedVersion: 0, preparationMinutes: 240, slotMinutes: 15, advanceDays: 7 } },
  );
  const reset = await client.request("POST", `${root}/carts/${cart.id}/reset`, {
    body: { expectedVersion: cart.version },
  });
  expect(reset).toMatchObject({
    status: 200,
    body: { id: cart.id, status: "expired", version: cart.version + 1 },
  });
  expect(
    await client.request("POST", `${root}/carts/${cart.id}/reset`, {
      body: { expectedVersion: cart.version },
    }),
  ).toMatchObject({ status: 200, body: { status: "expired", version: cart.version + 1 } });
  expect(
    await client.request("POST", `${root}/carts`, { body: { branchId: f.branchId } }),
  ).toMatchObject({ status: 200, body: { status: "open", scheduledAt: null } });
});

it("sepet bırakma müşteri yalıtımını ve CAS sürümünü uygular", async () => {
  const f = await createRestaurantFixture(app);
  const other = await createRestaurantFixture(app);
  const root = `/v1/shell/${f.businessId}/${f.instanceId}`;
  const cart = await app.services.ordering.openCart(f.customerScope, f.branchId);
  const client = as(app, f.customer);
  expect(
    await as(app, other.customer).request("POST", `${root}/carts/${cart.id}/reset`, {
      body: { expectedVersion: cart.version },
    }),
  ).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });
  const changed = await app.services.ordering.replaceCart(f.customerScope, cart.id, {
    expectedVersion: cart.version,
    lines: [],
  });
  expect(
    await client.request("POST", `${root}/carts/${cart.id}/reset`, {
      body: { expectedVersion: cart.version },
    }),
  ).toMatchObject({
    status: 409,
    body: {
      error: {
        code: "cart_version_conflict",
        details: { cart: { version: changed.version, status: "open" } },
      },
    },
  });
  expect((await app.services.ordering.getCart(f.customerScope, cart.id)).status).toBe("open");
});

it("tamamlanmış checkout bırakılmaz ve aynı anahtarın sonucu korunur", async () => {
  const f = await createRestaurantFixture(app);
  const root = `/v1/shell/${f.businessId}/${f.instanceId}`;
  expect(
    await as(app, f.customer).request("POST", `${root}/carts/${f.cart.id}/reset`, {
      body: { expectedVersion: f.cart.version },
    }),
  ).toMatchObject({ status: 409, body: { error: { code: "cart_closed" } } });
  const result = await app.services.ordering.checkout(f.customerScope, f.cart.id, f.cart.id, {
    cartVersion: f.cart.version,
    seenTotalMinor: f.cart.totalMinor,
    quoteHash: f.cart.quoteHash,
  });
  expect(result).toMatchObject({ status: 200, body: { id: f.order.id } });
});

async function seated(f: Awaited<ReturnType<typeof createRestaurantFixture>>, label: string) {
  const table = z.object({ id: z.uuid() }).parse(
    await app.services.restaurant.createTable(f.scope, {
      branchId: f.branchId,
      appInstanceId: f.instanceId,
      label,
      active: true,
    }),
  );
  const qr = await app.services.restaurant.tableQr(f.scope, table.id);
  const session = await as(app, f.customer).ok(
    tableSessionSchema,
    "POST",
    `/v1/shell/${f.businessId}/${f.instanceId}/table-sessions`,
    { body: { qr: qr.value } },
  );
  const opened = await app.services.ordering.openCart(f.customerScope, f.branchId, {
    fulfilment: "dine_in",
    tableSessionId: session.id,
    scheduledAt: null,
  });
  const cart = await app.services.ordering.replaceCart(f.customerScope, opened.id, {
    expectedVersion: opened.version,
    lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
  });
  const made = await app.services.ordering.checkout(f.customerScope, cart.id, randomUUID(), {
    cartVersion: cart.version,
    seenTotalMinor: cart.totalMinor,
    quoteHash: cart.quoteHash,
  });
  return { session, order: orderSchema.parse(made.body) };
}

it("sıfır tutarlı masada sipariş tahsilat gerektirmez ve tamamlanınca masa kapanır", async () => {
  const f = await createRestaurantFixture(app);
  await as(app, f.owner).request(
    "PUT",
    `/v1/business/${f.businessId}/catalog/items/${f.itemId}/prices`,
    { body: { branchId: null, amountMinor: 0, vatBasisPoints: 1000 } },
  );
  const { session, order } = await seated(f, "İkram masası");
  expect(order).toMatchObject({ totalMinor: 0, paymentStatus: "paid", paymentVersion: 0 });
  await app.services.ordering.accept(f.scope, order.id, {
    expectedVersion: 1,
    preparationMinutes: 10,
  });
  for (const [index, status] of ["preparing", "ready", "completed"].entries())
    await app.services.ordering.updateStatus(f.scope, order.id, {
      expectedVersion: index + 2,
      status,
    });
  const bill = await as(app, f.owner).request(
    "GET",
    `/v1/business/${f.businessId}/table-sessions/${session.id}/bill`,
  );
  expect(bill).toMatchObject({
    status: 200,
    body: { dueMinor: 0, orders: [{ id: order.id, paid: true }] },
  });
  expect(
    await as(app, f.owner).request(
      "POST",
      `/v1/business/${f.businessId}/table-sessions/${session.id}/close`,
      { body: { expectedVersion: session.version } },
    ),
  ).toMatchObject({ status: 200, body: { status: "closed" } });
});

it("mutfak kuyruğu ve müşterinin siparişi sunucudan doğru masa etiketini alır", async () => {
  const f = await createRestaurantFixture(app);
  const a = await seated(f, "Teras 12");
  const b = await seated(f, "Salon 3");
  const queue = await as(app, f.owner).request(
    "GET",
    `/v1/business/${f.businessId}/kitchen-queue?active=true&appInstanceId=${f.instanceId}`,
  );
  expect(queue).toMatchObject({
    status: 200,
    body: {
      items: [
        { id: f.order.id, tableLabel: null },
        { id: a.order.id, tableLabel: "Teras 12" },
        { id: b.order.id, tableLabel: "Salon 3" },
      ],
    },
  });
  expect(
    await as(app, f.customer).request(
      "GET",
      `/v1/shell/${f.businessId}/${f.instanceId}/orders/${b.order.id}`,
    ),
  ).toMatchObject({ status: 200, body: { tableLabel: "Salon 3" } });
});
