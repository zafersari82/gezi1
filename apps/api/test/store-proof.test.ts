import { randomUUID } from "node:crypto";

import {
  cartSchema,
  catalogSchema,
  liveReplaySchema,
  orderSchema,
  storeContextSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { createDeliveryFixture } from "./support/delivery-fixture";
import { startTestApp, type TestApp } from "./support/harness";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

const record = z.looseObject({ id: z.uuid(), version: z.number() });
const walletSchema = z.looseObject({ balance: z.number(), available: z.number() });

/** Masa ve cihaz paketi olmadan aynı mağazanın müşteri/sahip işlemlerini kullanır. */
async function store(minimumMinor = 0) {
  const f = await createDeliveryFixture(app, false, { minimumMinor }, "shopping");
  for (const capability of ["ordering.pickup", "ordering.reorder", "ordering.returns"]) {
    const changed = await f.ownerClient.request(
      "PUT",
      `/v1/business/${f.businessId}/app-instances/${f.instanceId}/capabilities/${capability}`,
      { body: { version: "1.0.0", enabled: true, config: {} } },
    );
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
  }
  const configured = await f.ownerClient.request(
    "PUT",
    `/v1/business/${f.businessId}/incentives/settings`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { expectedVersion: 0, stackCampaignCoupon: false, earnBasisPoints: 1000 },
    },
  );
  expect(configured.status).toBe(200);
  // Ayarlar değişince fiyat özeti de değişir; ödeme yalnız güncel teklif ile yapılır.
  const cart = await f.client.ok(cartSchema, "GET", `${f.root}/carts/${f.cart.id}`);
  expect(cart.quoteHash).not.toBe(f.cart.quoteHash);
  return { ...f, cart };
}

async function progress(
  f: Awaited<ReturnType<typeof store>>,
  order: z.infer<typeof orderSchema>,
  states: readonly string[],
) {
  let current = order;
  for (const status of states) {
    current = await f.ownerClient.ok(
      orderSchema,
      "PUT",
      `/v1/business/${f.businessId}/orders/${order.id}/status`,
      { body: { expectedVersion: current.version, status } },
    );
    expect(current.context).toBeNull();
  }
  return current;
}

it("mağaza gel-al: katalog, kupon, puan, ödeme, değerlendirme, iade ve tekrar sipariş", async () => {
  const f = await store();
  // Şema bilinmeyen alanları silebilir; gizlilik denetimi ham HTTP yanıtını kullanır.
  // Kanıt, bir restoran örneğini değil gerçek alışveriş işletmesi ve mini uygulamasını sınar.
  const category = await app.platformDb.one<{ businessCategory: string; miniAppCategory: string }>(
    sql`select b.category as "businessCategory", m.category as "miniAppCategory"
      from businesses b
      join app_instances i on i.business_id=b.id
      join mini_apps m on m.id=i.mini_app_id
      where b.id=${f.businessId} and i.id=${f.instanceId}`,
  );
  expect(category).toEqual({ businessCategory: "shopping", miniAppCategory: "shopping" });
  const devicePackages = await app.platformDb.one<{ enabled: boolean }>(sql`
    select coalesce(bool_or(enabled), false) as enabled
    from app_instance_capabilities
    where business_id=${f.businessId} and app_instance_id=${f.instanceId}
      and capability_id in ('ordering.kitchen', 'ordering.table_service')
  `);
  expect(devicePackages.enabled).toBe(false);
  const storefrontResponse = await f.client.request("GET", `${f.root}/store`);
  const legacyResponse = await f.client.request("GET", `${f.root}/restaurant`);
  expect(storefrontResponse.status).toBe(200);
  expect(legacyResponse.status).toBe(200);
  expect(legacyResponse.body).toEqual(storefrontResponse.body);
  const context = storeContextSchema.parse(storefrontResponse.body);
  expect(context).toMatchObject({ businessId: f.businessId, appInstanceId: f.instanceId });
  const rawStorefront = JSON.stringify(storefrontResponse.body);
  for (const privateValue of [
    f.address.phone,
    f.customer.phone,
    f.customer.id,
    f.owner.phone,
  ]) {
    expect(rawStorefront).not.toContain(privateValue);
  }
  const catalog = await f.client.ok(
    catalogSchema,
    "GET",
    `${f.root}/catalog?branchId=${f.branchId}`,
  );
  expect(catalog.items.some((item) => item.id === f.itemId)).toBe(true);
  const rule = await f.ownerClient.ok(
    record,
    "POST",
    `/v1/business/${f.businessId}/incentives/rules`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: {
        name: "Mağaza kuponu",
        kind: "coupon",
        code: "MAGAZA10",
        discountType: "fixed",
        value: 1000,
        minimumMinor: 0,
        branchId: null,
        itemIds: [],
        startsAt: "2020-01-01T00:00:00.000Z",
        endsAt: "2090-01-01T00:00:00.000Z",
        totalLimit: 100,
        perCustomerLimit: 1,
        active: true,
      },
    },
  );
  expect(rule.id).toBeTruthy();
  const opened = await f.client.ok(cartSchema, "POST", `${f.root}/carts`, {
    body: { branchId: f.branchId, fulfilment: "pickup" },
  });
  expect(opened.context).toBeNull();
  const filled = await f.client.ok(cartSchema, "PUT", `${f.root}/carts/${opened.id}`, {
    body: {
      expectedVersion: opened.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
    },
  });
  const discounted = await f.client.ok(
    cartSchema,
    "PUT",
    `${f.root}/carts/${filled.id}/incentives`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { expectedVersion: filled.version, couponCode: "MAGAZA10", pointsToSpend: 0 },
    },
  );
  expect(discounted.totalMinor).toBe(filled.totalMinor - 1000);
  expect((await f.client.ok(walletSchema, "GET", `${f.root}/loyalty`)).balance).toBe(0);
  const order = await f.client.ok(
    orderSchema,
    "POST",
    `${f.root}/carts/${discounted.id}/checkout`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: {
        cartVersion: discounted.version,
        seenTotalMinor: discounted.totalMinor,
        quoteHash: discounted.quoteHash,
      },
    },
  );
  expect(order).toMatchObject({ fulfilment: "pickup", context: null, contextLabel: null });
  expect(
    order.capabilities.some((id) => id.includes("table_service") || id.includes("kitchen")),
  ).toBe(false);
  let updated = await progress(f, order, ["accepted", "preparing", "ready"]);
  await f.ownerClient.ok(
    z.unknown(),
    "POST",
    `/v1/business/${f.businessId}/orders/${order.id}/payment`,
    { body: { expectedPaymentVersion: 0, place: "counter", method: "cash" } },
  );
  updated = await progress(f, updated, ["completed"]);
  const earned = await f.client.ok(walletSchema, "GET", `${f.root}/loyalty`);
  expect(earned.balance).toBeGreaterThan(100);
  expect(earned.available).toBe(earned.balance);

  // Kazanılan puanı sonraki mağaza siparişinde kullan; iptalde geri alınmalı.
  const secondCart = await f.client.ok(cartSchema, "POST", `${f.root}/carts`, {
    body: { branchId: f.branchId, fulfilment: "pickup" },
  });
  const secondFilled = await f.client.ok(cartSchema, "PUT", `${f.root}/carts/${secondCart.id}`, {
    body: {
      expectedVersion: secondCart.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
    },
  });
  const withPoints = await f.client.ok(
    cartSchema,
    "PUT",
    `${f.root}/carts/${secondFilled.id}/incentives`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { expectedVersion: secondFilled.version, couponCode: null, pointsToSpend: 100 },
    },
  );
  expect(withPoints.totalMinor).toBe(secondFilled.totalMinor - 100);
  const spendingOrder = await f.client.ok(
    orderSchema,
    "POST",
    `${f.root}/carts/${withPoints.id}/checkout`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: {
        cartVersion: withPoints.version,
        seenTotalMinor: withPoints.totalMinor,
        quoteHash: withPoints.quoteHash,
      },
    },
  );
  expect(spendingOrder.context).toBeNull();
  expect((await f.client.ok(walletSchema, "GET", `${f.root}/loyalty`)).balance).toBe(
    earned.balance - 100,
  );
  await progress(f, spendingOrder, ["cancelled"]);
  expect((await f.client.ok(walletSchema, "GET", `${f.root}/loyalty`)).balance).toBe(
    earned.balance,
  );

  const review = await f.client.ok(record, "POST", `${f.root}/orders/${order.id}/review`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedOrderVersion: updated.version, rating: 5, comment: "Hızlı gel-al" },
  });
  expect(review.id).toBeTruthy();
  const refund = await f.client.ok(
    z.looseObject({ id: z.uuid(), version: z.number(), status: z.string() }),
    "POST",
    `${f.root}/orders/${order.id}/returns`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: {
        kind: "refund",
        expectedOrderVersion: updated.version,
        reason: "Eksik ürün",
        amountMinor: 1000,
      },
    },
  );
  expect(refund.status).toBe("pending");
  const decision = await f.ownerClient.ok(
    z.looseObject({ status: z.string() }),
    "PUT",
    `/v1/business/${f.businessId}/returns/${refund.id}/decision`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: {
        expectedVersion: refund.version,
        expectedOrderVersion: updated.version,
        decision: "approve",
        reason: "Eksik ürün doğrulandı",
        physicalRefund: { method: "cash", reference: "MAGAZA-IADE" },
      },
    },
  );
  expect(decision.status).toBe("approved");
  const reordered = await f.client.ok(
    z.looseObject({ cart: cartSchema, requiresConfirmation: z.boolean() }),
    "POST",
    `${f.root}/orders/${order.id}/reorder`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { branchId: f.branchId, cartId: null, expectedVersion: 0, replace: false },
    },
  );
  expect(reordered.cart.context).toBeNull();
  expect(reordered.requiresConfirmation).toBe(true);
  const events = await f.client.ok(liveReplaySchema, "GET", `${f.root}/live-events?cursor=0`);
  expect(events.items.filter((event) => event.orderId === order.id).length).toBeGreaterThan(0);
  expect(events.items.every((event) => event.context === null)).toBe(true);
  expect(
    await app.platformDb.one(sql`select context_kind,context_id from orders where id=${order.id}`),
  ).toMatchObject({ context_kind: null, context_id: null });
});

it("mağaza: değişen puan ayarı eski sepet teklifini geçersiz kılar", async () => {
  const f = await createDeliveryFixture(app, false, {}, "shopping");
  const configured = await f.ownerClient.request(
    "PUT",
    `/v1/business/${f.businessId}/incentives/settings`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { expectedVersion: 0, stackCampaignCoupon: false, earnBasisPoints: 1000 },
    },
  );
  expect(configured.status).toBe(200);
  const staleKey = randomUUID();
  const staleRequest = {
    headers: { "idempotency-key": staleKey },
    body: {
      cartVersion: f.cart.version,
      seenTotalMinor: f.cart.totalMinor,
      quoteHash: f.cart.quoteHash,
    },
  };
  const stale = await f.client.fail(
    "cart_changed",
    "POST",
    `${f.root}/carts/${f.cart.id}/checkout`,
    staleRequest,
  );
  expect(stale.details).toMatchObject({ cart: { id: f.cart.id } });
  const retried = await f.client.request(
    "POST",
    `${f.root}/carts/${f.cart.id}/checkout`,
    staleRequest,
  );
  expect(retried).toMatchObject({ status: 409, body: { error: { code: "cart_changed" } } });
  expect(
    await app.platformDb.many(
      sql`select id from orders where business_id=${f.businessId} and cart_id=${f.cart.id}`,
    ),
  ).toHaveLength(0);
  expect((await f.client.ok(walletSchema, "GET", `${f.root}/loyalty`)).balance).toBe(0);
  const current = await f.client.ok(cartSchema, "GET", `${f.root}/carts/${f.cart.id}`);
  expect(current).toMatchObject({ id: f.cart.id, status: "open", version: f.cart.version });
  expect(current.quoteHash).not.toBe(f.cart.quoteHash);
  const order = await f.client.ok(
    orderSchema,
    "POST",
    `${f.root}/carts/${current.id}/checkout`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: {
        cartVersion: current.version,
        seenTotalMinor: current.totalMinor,
        quoteHash: current.quoteHash,
      },
    },
  );
  expect(order).toMatchObject({ fulfilment: "delivery", context: null });
  const created = await app.platformDb.many<{ id: string }>(
    sql`select id from orders where business_id=${f.businessId} and cart_id=${f.cart.id}`,
  );
  expect(created.map((row) => row.id)).toEqual([order.id]);
});

it("mağaza teslimat: adres, bölge, ücret, minimum ve yola çıkış bağlamsız işler", async () => {
  const f = await store(10000);
  const quote = await f.client.ok(
    z.looseObject({ feeMinor: z.number(), minimumMinor: z.number(), address: z.unknown() }),
    "POST",
    `${f.root}/delivery-quote`,
    { body: { branchId: f.branchId, addressId: f.address.id } },
  );
  expect(quote.feeMinor).toBe(2000);
  expect(quote.minimumMinor).toBe(10000);
  expect(f.cart.totalMinor).toBe(12000);
  expect(f.cart.delivery?.areaId).toBe(f.area.id);
  const order = await f.client.ok(orderSchema, "POST", `${f.root}/carts/${f.cart.id}/checkout`, {
    headers: { "idempotency-key": randomUUID() },
    body: {
      cartVersion: f.cart.version,
      seenTotalMinor: f.cart.totalMinor,
      quoteHash: f.cart.quoteHash,
    },
  });
  expect(order).toMatchObject({ fulfilment: "delivery", context: null });
  const snapshot = await f.client.ok(
    z.looseObject({ address: z.looseObject({ id: z.uuid() }) }),
    "GET",
    `${f.root}/orders/${order.id}/delivery-snapshot`,
  );
  expect(snapshot.address.id).toBe(f.address.id);
  const stored = await app.platformDb.one<{ snapshot: unknown }>(
    sql`select snapshot from delivery_order_snapshots where order_id=${order.id}`,
  );
  expect(stored.snapshot).toMatchObject({ feeMinor: 2000, minimumMinor: 10000 });
  const departed = await progress(f, order, [
    "accepted",
    "preparing",
    "ready",
    "in_transit",
    "completed",
  ]);
  expect(departed.status).toBe("completed");
  const events = await f.client.ok(liveReplaySchema, "GET", `${f.root}/live-events?cursor=0`);
  expect(events.items.filter((event) => event.orderId === order.id).length).toBeGreaterThan(0);
  expect(events.items.every((event) => event.context === null)).toBe(true);
});
