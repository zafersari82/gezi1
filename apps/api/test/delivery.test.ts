import { randomUUID } from "node:crypto";

import { cartSchema, orderSchema } from "@vado/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { checkoutDelivery, createDeliveryFixture } from "./support/delivery-fixture";
import { as, startTestApp, type TestApp } from "./support/harness";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});
it("restoran paketi olmayan mağaza sunucu sepetinden ücretli teslimat alır", async () => {
  const { order } = await checkoutDelivery(app);
  expect(order.fulfilment).toBe("delivery");
  expect(order.stateGraph.ready).toEqual(["in_transit", "cancelled"]);
  const stored = await app.platformDb.one<{ snapshot: unknown }>(
    sql`select snapshot from delivery_order_snapshots where order_id=${order.id}`,
  );
  expect(stored.snapshot).toMatchObject({
    feeMinor: 2000,
    minimumMinor: 10000,
    address: { recipientName: "Alıcı", phone: "+905551112233" },
  });
  expect(order.capabilities).toEqual(["ordering.delivery@1.0.0", "ordering.preparation@1.0.0"]);
  expect(z.string().parse(order.id)).toBeTruthy();
});
it("teslimatın adresi teklif ve değişmez görüntü ucundadır; tekrar yanıtı kişisel veri taşımaz", async () => {
  const f = await checkoutDelivery(app);
  expect(f.cart.delivery).not.toHaveProperty("address");
  expect(f.cart.addressId).toBe(f.address.id);
  const quote = await f.client.ok(
    z.looseObject({ address: z.looseObject({ phone: z.string() }) }),
    "POST",
    `${f.root}/delivery-quote`,
    { body: { branchId: f.branchId, addressId: f.address.id } },
  );
  expect(quote.address.phone).toBe(f.address.phone);
  const snapshot = await f.client.ok(
    z.looseObject({ address: z.looseObject({ phone: z.string() }) }),
    "GET",
    `${f.root}/orders/${f.order.id}/delivery-snapshot`,
  );
  await app.services.location.updateAddress(f.customer.id, f.address.id, randomUUID(), {
    expectedVersion: f.address.version,
    label: "Yeni ev",
    recipientName: "Yeni alıcı",
    phone: "+905559998877",
    addressLine: "Yeni Sokak 99",
    door: "2",
    note: "",
    countryId: f.address.countryId,
    provinceId: f.address.provinceId,
    districtId: f.address.districtId,
    neighborhoodId: f.address.neighborhoodId,
  });
  expect(
    await f.client.ok(z.unknown(), "GET", `${f.root}/orders/${f.order.id}/delivery-snapshot`),
  ).toEqual(snapshot);
  expect(
    JSON.stringify(
      await app.platformDb.many(
        sql`select response_body from idempotency_keys where business_id=${f.businessId}`,
      ),
    ),
  ).not.toContain(f.address.phone);
});

it("teslimat ücreti asgari ürün tutarını karşılamaz ve eski teklif yeniden onay ister", async () => {
  const f = await createDeliveryFixture(app),
    owner = as(app, f.owner);
  const settings = `/v1/business/${f.businessId}/branches/${f.branchId}/delivery-regions/${f.area.id}`;
  expect(
    (
      await owner.request("PUT", settings, {
        headers: { "idempotency-key": randomUUID() },
        body: {
          expectedVersion: 1,
          feeMinor: 2000,
          minimumMinor: 11000,
          deliveryMinutes: 30,
          active: true,
        },
      })
    ).status,
  ).toBe(200);
  const key = randomUUID();
  await f.client.fail("cart_changed", "POST", `${f.root}/carts/${f.cart.id}/checkout`, {
    headers: { "idempotency-key": key },
    body: {
      cartVersion: f.cart.version,
      seenTotalMinor: f.cart.totalMinor,
      quoteHash: f.cart.quoteHash,
    },
  });
  const current = await f.client.ok(cartSchema, "GET", `${f.root}/carts/${f.cart.id}`);
  expect(current.totalMinor).toBe(12000);
  await f.client.fail("cart_changed", "POST", `${f.root}/carts/${f.cart.id}/checkout`, {
    headers: { "idempotency-key": randomUUID() },
    body: {
      cartVersion: current.version,
      seenTotalMinor: current.totalMinor,
      quoteHash: current.quoteHash,
    },
  });
  expect(
    await app.platformDb.many(sql`select id from orders where business_id=${f.businessId}`),
  ).toEqual([]);
  expect(
    JSON.stringify(
      await app.platformDb.many(
        sql`select response_body from idempotency_keys where business_id=${f.businessId}`,
      ),
    ),
  ).not.toContain(f.address.phone);
});
it("kapalı şube, arşivli adres ve etkin olmayan bölge checkout alamaz", async () => {
  const closed = await createDeliveryFixture(app);
  await app.services.businessManagement.setHours(closed.scope, closed.branchId, { hours: [] });
  await closed.client.fail(
    "branch_closed",
    "POST",
    `${closed.root}/carts/${closed.cart.id}/checkout`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: {
        cartVersion: closed.cart.version,
        seenTotalMinor: closed.cart.totalMinor,
        quoteHash: closed.cart.quoteHash,
      },
    },
  );
  const archived = await createDeliveryFixture(app);
  await app.services.location.archiveAddress(
    archived.customer.id,
    archived.address.id,
    randomUUID(),
    { expectedVersion: archived.address.version },
  );
  await archived.client.fail("fulfilment_unavailable", "POST", `${archived.root}/delivery-quote`, {
    body: { branchId: archived.branchId, addressId: archived.address.id },
  });
  const disabled = await createDeliveryFixture(app);
  await app.services.location.disableServiceArea(
    disabled.scope,
    disabled.branchId,
    disabled.area.id,
    randomUUID(),
    { expectedVersion: disabled.area.version },
  );
  await disabled.client.fail("fulfilment_unavailable", "POST", `${disabled.root}/delivery-quote`, {
    body: { branchId: disabled.branchId, addressId: disabled.address.id },
  });
  await disabled.client.fail("not_found", "POST", `${disabled.root}/delivery-quote`, {
    body: { branchId: disabled.branchId, addressId: archived.address.id },
  });
});
it("mutfak paketli restoran aynı teslimat politikasını ve hazırlık bağımlılığını kullanır", async () => {
  const f = await checkoutDelivery(app, true);
  expect(f.order.capabilities).toEqual(["ordering.delivery@1.0.0", "ordering.kitchen@1.0.0"]);
  expect(f.order.fulfilment).toBe("delivery");
});

it("teslimat açık aynı mağazada gel-al siparişi kurye adımına zorlanmaz", async () => {
  const f = await createDeliveryFixture(app);
  expect(
    (
      await f.ownerClient.request(
        "PUT",
        `/v1/business/${f.businessId}/app-instances/${f.instanceId}/capabilities/ordering.pickup`,
        { body: { version: "1.0.0", enabled: true, config: {} } },
      )
    ).status,
  ).toBe(200);
  await f.client.ok(cartSchema, "POST", `${f.root}/carts/${f.cart.id}/reset`, {
    body: { expectedVersion: f.cart.version },
  });
  const empty = await f.client.ok(cartSchema, "POST", `${f.root}/carts`, {
    body: { branchId: f.branchId, fulfilment: "pickup" },
  });
  const cart = await f.client.ok(cartSchema, "PUT", `${f.root}/carts/${empty.id}`, {
    body: {
      expectedVersion: empty.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
    },
  });
  const key = randomUUID(),
    body = {
      cartVersion: cart.version,
      seenTotalMinor: cart.totalMinor,
      quoteHash: cart.quoteHash,
    };
  const response = await f.client.request("POST", `${f.root}/carts/${cart.id}/checkout`, {
    headers: { "idempotency-key": key },
    body,
  });
  expect(response.status).toBe(200);
  let order = orderSchema.parse(response.body);
  expect(order.stateGraph.ready).toEqual(["completed", "cancelled"]);
  expect(order.stateGraph).not.toHaveProperty("in_transit");
  for (const status of ["accepted", "preparing", "ready"]) {
    order = await f.ownerClient.ok(
      orderSchema,
      "PUT",
      `/v1/business/${f.businessId}/orders/${order.id}/status`,
      { body: { expectedVersion: order.version, status } },
    );
  }
  await f.ownerClient.fail(
    "order_state_invalid",
    "PUT",
    `/v1/business/${f.businessId}/orders/${order.id}/status`,
    { body: { expectedVersion: order.version, status: "in_transit" } },
  );
  order = await f.ownerClient.ok(
    orderSchema,
    "PUT",
    `/v1/business/${f.businessId}/orders/${order.id}/status`,
    { body: { expectedVersion: order.version, status: "completed" } },
  );
  expect(order.status).toBe("completed");
  const delivered = await checkoutDelivery(app);
  expect(delivered.order.stateGraph.ready).toEqual(["in_transit", "cancelled"]);
});

it("teslimat manifesti hazırlık bağımlılığı ve teslim biçimi koşulunu açıklar", async () => {
  const response = await app.server.inject("/v1/capabilities");
  const catalog = z
    .object({
      packages: z.array(
        z.looseObject({
          id: z.string(),
          dependsOn: z.array(z.unknown()),
          stateMachine: z.unknown(),
        }),
      ),
    })
    .parse(response.json());
  const delivery = catalog.packages.find((p) => p.id === "ordering.delivery");
  expect(delivery?.dependsOn).toContainEqual({
    id: "ordering.preparation",
    version: "1.0.0",
    alternatives: ["ordering.kitchen"],
  });
  expect(delivery?.stateMachine).toMatchObject({ insertions: [{ fulfilments: ["delivery"] }] });
});
