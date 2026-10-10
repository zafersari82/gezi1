import { randomUUID } from "node:crypto";

import { cartSchema, orderSchema } from "@vado/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { createCatalogFixture } from "./support/catalog-fixture";
import { createDeliveryFixture } from "./support/delivery-fixture";
import { as, createUser, startTestApp, type TestApp, type TestUser } from "./support/harness";
import { scoped } from "./support/tenant-fixture";
let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});
const record = z.looseObject({ id: z.uuid(), version: z.number() });
async function rule(
  f: { owner: TestUser; businessId: string },
  overrides: Record<string, unknown> = {},
) {
  return as(app, f.owner).ok(record, "POST", `/v1/business/${f.businessId}/incentives/rules`, {
    headers: { "idempotency-key": randomUUID() },
    body: {
      name: "Deneme kuponu",
      kind: "coupon",
      code: "VADO10",
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
      ...overrides,
    },
  });
}
async function choose(
  f: { client: ReturnType<typeof as>; root: string; cart: { id: string; version: number } },
  couponCode: string | null = "VADO10",
  pointsToSpend = 0,
) {
  return f.client.ok(cartSchema, "PUT", `${f.root}/carts/${f.cart.id}/incentives`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: f.cart.version, couponCode, pointsToSpend },
  });
}
async function checkout(
  f: { client: ReturnType<typeof as>; root: string },
  cart: z.infer<typeof cartSchema>,
  key = randomUUID(),
) {
  return f.client.request("POST", `${f.root}/carts/${cart.id}/checkout`, {
    headers: { "idempotency-key": key },
    body: { cartVersion: cart.version, seenTotalMinor: cart.totalMinor, quoteHash: cart.quoteHash },
  });
}
async function pickup() {
  const f = await createCatalogFixture(app),
    client = as(app, f.customer),
    root = `/v1/shell/${f.businessId}/${f.instanceId}`;
  const empty = await client.ok(cartSchema, "POST", `${root}/carts`, {
    body: { branchId: f.branchId },
  });
  const cart = await client.ok(cartSchema, "PUT", `${root}/carts/${empty.id}`, {
    body: {
      expectedVersion: empty.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
    },
  });
  return { ...f, client, root, cart };
}
async function complete(f: Awaited<ReturnType<typeof pickup>>, orderId: string) {
  let order = await app.services.ordering.getOrder(f.scope, orderId);
  order = await app.services.ordering.updateStatus(f.scope, orderId, {
    expectedVersion: order.version,
    status: "accepted",
  });
  await app.services.ordering.recordPayment(f.scope, orderId, {
    expectedPaymentVersion: 0,
    place: "counter",
    method: "cash",
  });
  return app.services.ordering.updateStatus(f.scope, orderId, {
    expectedVersion: order.version,
    status: "completed",
  });
}

it("restoran paketleri kapalı mağaza teslimat kuponunu indirim sonrası KDV ile kullanır", async () => {
  const f = await createDeliveryFixture(app, false, { minimumMinor: 0 });
  await rule(f);
  const cart = await choose(f);
  expect(cart.totalMinor).toBe(11000);
  expect(cart.vatMinor).toBe(818);
  expect(cart.lines[0]).toMatchObject({ discountMinor: 1000, totalMinor: 9000, vatMinor: 818 });
  const response = await checkout(f, cart);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const order = orderSchema.parse(response.body);
  expect(order.capabilities).not.toContain("ordering.kitchen@1.0.0");
  expect(order.lines[0]).toMatchObject({ discountMinor: 1000, totalMinor: 9000 });
  expect(
    await app.platformDb.many(
      sql`select id from incentive_uses where order_id=${order.id} and status='reserved'`,
    ),
  ).toHaveLength(1);
});
it("kampanya ve kupon varsayılan birleşmez; işletme ayarıyla satır bazında birleşir", async () => {
  const f = await pickup();
  await rule(f);
  await rule(f, { kind: "campaign", code: null, name: "Kampanya", perCustomerLimit: 10 });
  await f.client.fail(
    "incentive_stack_forbidden",
    "PUT",
    `${f.root}/carts/${f.cart.id}/incentives`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { expectedVersion: f.cart.version, couponCode: "VADO10", pointsToSpend: 0 },
    },
  );
  expect(
    (
      await as(app, f.owner).request("PUT", `/v1/business/${f.businessId}/incentives/settings`, {
        headers: { "idempotency-key": randomUUID() },
        body: { expectedVersion: 0, stackCampaignCoupon: true, earnBasisPoints: 0 },
      })
    ).status,
  ).toBe(200);
  const cart = await choose(f);
  expect(cart.totalMinor).toBe(8000);
  expect(cart.vatMinor).toBe(727);
  const key = randomUUID();
  const one = await checkout(f, cart, key);
  expect(one.status, JSON.stringify(one.body)).toBe(200);
  expect(await checkout(f, cart, key)).toEqual(one);
  expect(
    await app.platformDb.many(
      sql`select id from incentive_uses where order_id=${orderSchema.parse(one.body).id}`,
    ),
  ).toHaveLength(2);
});
it("yirmi eşzamanlı müşteri kuponun üç toplam kullanımını aşamaz", async () => {
  const f = await pickup();
  await rule(f, { totalLimit: 3 });
  const carts = await Promise.all(
    Array.from({ length: 20 }, async () => {
      const user = await createUser(app, "Kupon müşterisi"),
        client = as(app, user);
      const empty = await client.ok(cartSchema, "POST", `${f.root}/carts`, {
        body: { branchId: f.branchId },
      });
      const cart = await client.ok(cartSchema, "PUT", `${f.root}/carts/${empty.id}`, {
        body: {
          expectedVersion: empty.version,
          lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
        },
      });
      return { client, cart: await choose({ client, root: f.root, cart }), root: f.root };
    }),
  );
  const responses = await Promise.all(carts.map((f) => checkout(f, f.cart)));
  expect(
    responses.filter((r) => r.status === 200),
    JSON.stringify(responses.slice(0, 3)),
  ).toHaveLength(3);
  expect(responses.filter((r) => r.status === 409)).toHaveLength(17);
  expect(
    await app.platformDb.many(
      sql`select id from incentive_uses where business_id=${f.businessId} and status<>'released'`,
    ),
  ).toHaveLength(3);
});
it("kişi limiti şubeler arasında korunur ve iptal rezervasyonu bir kez çözer", async () => {
  const f = await pickup();
  await rule(f);
  let cart = await choose(f);
  const first = orderSchema.parse((await checkout(f, cart)).body);
  const branch = await app.services.businessManagement.saveBranch(f.scope, {
    name: "Başka şube",
    timezone: "Europe/Istanbul",
    address: null,
    active: true,
  });
  const empty = await f.client.ok(cartSchema, "POST", `${f.root}/carts`, {
    body: { branchId: branch.id },
  });
  cart = await f.client.ok(cartSchema, "PUT", `${f.root}/carts/${empty.id}`, {
    body: {
      expectedVersion: empty.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
    },
  });
  await f.client.fail("incentive_unavailable", "PUT", `${f.root}/carts/${cart.id}/incentives`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: cart.version, couponCode: "VADO10", pointsToSpend: 0 },
  });
  await app.services.ordering.updateStatus(f.scope, first.id, {
    expectedVersion: first.version,
    status: "cancelled",
  });
  const second = await choose({ ...f, cart });
  expect((await checkout(f, second)).status).toBe(200);
  expect(
    await app.platformDb.many(
      sql`select id from incentive_uses where business_id=${f.businessId} and status='released'`,
    ),
  ).toHaveLength(1);
});
it("indirim teslimatın asgari ürün tutarını düşürür; ücret açığı kapatamaz", async () => {
  const f = await createDeliveryFixture(app);
  await rule(f);
  const cart = await choose(f);
  const response = await checkout(f, cart);
  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({ error: { code: "cart_changed" } });
  expect(
    await app.platformDb.many(sql`select id from orders where business_id=${f.businessId}`),
  ).toEqual([]);
});
it("kupon ayarı değişince eski mali görüntü yeniden onay ister", async () => {
  const f = await pickup(),
    coupon = await rule(f),
    cart = await choose(f);
  const current = z.looseObject({ name: z.string() }).parse(coupon);
  expect(
    (
      await as(app, f.owner).request(
        "PUT",
        `/v1/business/${f.businessId}/incentives/rules/${coupon.id}`,
        {
          headers: { "idempotency-key": randomUUID() },
          body: {
            ...coupon,
            ...current,
            id: undefined,
            businessId: undefined,
            createdAt: undefined,
            updatedAt: undefined,
            version: undefined,
            expectedVersion: coupon.version,
            value: 2000,
          },
        },
      )
    ).status,
  ).toBe(200);
  expect((await checkout(f, cart)).body).toMatchObject({ error: { code: "cart_changed" } });
});
it("puan yalnız ödenmiş ve tamamlanmış siparişte tek kez kazanılır", async () => {
  const f = await pickup();
  expect(
    (
      await as(app, f.owner).request("PUT", `/v1/business/${f.businessId}/incentives/settings`, {
        headers: { "idempotency-key": randomUUID() },
        body: { expectedVersion: 0, stackCampaignCoupon: false, earnBasisPoints: 1000 },
      })
    ).status,
  ).toBe(200);
  const cart = await f.client.ok(cartSchema, "GET", `${f.root}/carts/${f.cart.id}`),
    order = orderSchema.parse((await checkout(f, cart)).body);
  const wallet = () =>
    f.client.ok(
      z.looseObject({ balance: z.number(), available: z.number() }),
      "GET",
      `${f.root}/loyalty`,
    );
  expect((await wallet()).balance).toBe(0);
  await complete(f, order.id);
  expect((await wallet()).balance).toBe(1000);
  await scoped(app.db, f.businessId, async (tx) => {
    await tx.execute(sql`select set_config('vado.user_id',${f.owner.id},true)`);
    await app.services.orderingLifecycle.run("complete", tx, {
      businessId: f.businessId,
      orderId: order.id,
      userId: f.owner.id,
    });
  });
  expect((await wallet()).balance).toBe(1000);
  expect(
    await app.platformDb.many(
      sql`select id from loyalty_ledger where order_id=${order.id} and kind='earn'`,
    ),
  ).toHaveLength(1);
  const empty = await f.client.ok(cartSchema, "POST", `${f.root}/carts`, {
    body: { branchId: f.branchId },
  });
  const filled = await f.client.ok(cartSchema, "PUT", `${f.root}/carts/${empty.id}`, {
    body: {
      expectedVersion: empty.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
    },
  });
  const spent = await choose({ ...f, cart: filled }, null, 700);
  const spending = orderSchema.parse((await checkout(f, spent)).body);
  expect((await wallet()).balance).toBe(300);
  await app.services.ordering.updateStatus(f.scope, spending.id, {
    expectedVersion: spending.version,
    status: "cancelled",
  });
  expect((await wallet()).balance).toBe(1000);
});
it("kapsamsız veya yabancı işletme SQL teşvik ve puan defterini okuyamaz", async () => {
  const f = await pickup(),
    other = await pickup();
  await rule(f);
  for (const query of [
    sql`select * from incentive_rules`,
    sql`select * from incentive_uses`,
    sql`select * from loyalty_wallets`,
    sql`select * from loyalty_ledger`,
  ]) {
    expect(await app.db.many(query)).toEqual([]);
    expect(await scoped(app.db, other.businessId, (tx) => tx.many(query))).toEqual([]);
  }
});

async function earningFixture() {
  const f = await pickup();
  await as(app, f.owner).ok(
    z.unknown(),
    "PUT",
    `/v1/business/${f.businessId}/incentives/settings`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { expectedVersion: 0, stackCampaignCoupon: false, earnBasisPoints: 1000 },
    },
  );
  const cart = await f.client.ok(cartSchema, "GET", `${f.root}/carts/${f.cart.id}`),
    response = await checkout(f, cart);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const order = orderSchema.parse(response.body);
  await complete(f, order.id);
  return { ...f, earningOrder: order };
}
async function newCart(f: Awaited<ReturnType<typeof pickup>>, branchId = f.branchId) {
  const empty = await f.client.ok(cartSchema, "POST", `${f.root}/carts`, { body: { branchId } });
  return f.client.ok(cartSchema, "PUT", `${f.root}/carts/${empty.id}`, {
    body: {
      expectedVersion: empty.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
    },
  });
}
async function receipt(
  tx: Parameters<Parameters<typeof scoped>[2]>[0],
  f: Awaited<ReturnType<typeof pickup>>,
  orderId: string,
  sequence: number,
  amount: number,
  full = false,
) {
  await tx.execute(sql`select set_config('vado.user_id',${f.owner.id},true)`);
  const member = await tx.one<{ id: string }>(
    sql`select id from business_members where business_id=${f.businessId} and user_id=${f.owner.id} and active`,
  );
  return tx.one<{ id: string }>(
    sql`insert into order_refunds(business_id,order_id,sequence,amount_minor,full_refund,method,reference,member_id) values(${f.businessId},${orderId},${sequence},${amount},${full},'cash',${`IADE-${sequence}`},${member.id}) returning id`,
  );
}
it("aynı müşteri iki şubede eşzamanlı olarak mevcut puanından fazla harcayamaz", async () => {
  const f = await earningFixture();
  const branch = await app.services.businessManagement.saveBranch(f.scope, {
    name: "İkinci şube",
    timezone: "Europe/Istanbul",
    address: null,
    active: true,
  });
  const carts = await Promise.all(
    [f.branchId, branch.id].map(async (branchId) =>
      choose({ ...f, cart: await newCart(f, branchId) }, null, 800),
    ),
  );
  const responses = await Promise.all(carts.map((cart) => checkout(f, cart)));
  expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
  expect(responses.filter((r) => r.status === 409)).toHaveLength(1);
  expect(
    await f.client.ok(z.looseObject({ balance: z.number() }), "GET", `${f.root}/loyalty`),
  ).toMatchObject({ balance: 200 });
});
it("kısmi iadeler kazanılanı ve harcananı orantılı geri alır; son kuruş tam kapanır", async () => {
  const f = await earningFixture(),
    cart = await choose({ ...f, cart: await newCart(f) }, null, 500),
    response = await checkout(f, cart);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const order = orderSchema.parse(response.body);
  await complete(f, order.id);
  const balances = [];
  for (const [index, amount] of [3166, 3167, 3167].entries()) {
    await scoped(app.db, f.businessId, (tx) =>
      receipt(tx, f, order.id, index + 1, amount, index === 2),
    );
    balances.push(
      z
        .looseObject({ balance: z.number() })
        .parse(await f.client.ok(z.unknown(), "GET", `${f.root}/loyalty`)).balance,
    );
  }
  expect(balances).toEqual([1300, 1150, 1000]);
  const rows = await app.platformDb.many(
    sql`select * from loyalty_ledger where order_id=${order.id}`,
  );
  expect(rows).toHaveLength(8);
  await scoped(app.db, f.businessId, async (tx) => {
    await tx.execute(sql`select set_config('vado.user_id',${f.owner.id},true)`);
    await app.services.orderingLifecycle.run("refund", tx, {
      businessId: f.businessId,
      orderId: order.id,
      userId: f.owner.id,
    });
  });
  expect(
    await app.platformDb.many(sql`select * from loyalty_ledger where order_id=${order.id}`),
  ).toEqual(rows);
  await expect(
    scoped(app.db, f.businessId, (tx) => receipt(tx, f, order.id, 4, 1)),
  ).rejects.toMatchObject({ code: "23514" });
  expect((await app.services.ordering.getOrder(f.scope, order.id)).lines).toEqual(order.lines);
});
it("önceden harcanmış ödül geri alınırsa borç yeni harcama yaratmaz", async () => {
  const f = await earningFixture(),
    cart = await choose({ ...f, cart: await newCart(f) }, null, 800),
    response = await checkout(f, cart);
  expect(response.status).toBe(200);
  const spending = orderSchema.parse(response.body);
  await scoped(app.db, f.businessId, (tx) => receipt(tx, f, f.earningOrder.id, 1, 10000, true));
  expect(
    await f.client.ok(
      z.looseObject({ balance: z.number(), available: z.number() }),
      "GET",
      `${f.root}/loyalty`,
    ),
  ).toMatchObject({ balance: -800, available: 0 });
  const filled = await newCart(f);
  await f.client.fail("loyalty_insufficient", "PUT", `${f.root}/carts/${filled.id}/incentives`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: filled.version, couponCode: null, pointsToSpend: 1 },
  });
  await app.services.ordering.updateStatus(f.scope, spending.id, {
    expectedVersion: spending.version,
    status: "cancelled",
  });
  expect(
    await f.client.ok(z.looseObject({ balance: z.number() }), "GET", `${f.root}/loyalty`),
  ).toMatchObject({ balance: 0 });
});
it("iade kancası başarısızsa fiziksel kayıt, puan, olay ve denetim birlikte geri alınır", async () => {
  const f = await earningFixture(),
    before = await f.client.ok(z.unknown(), "GET", `${f.root}/loyalty`),
    audit = await app.platformDb.many(
      sql`select id from audit_log where target_id=${f.earningOrder.id}`,
    ),
    events = await app.platformDb.many(
      sql`select id from outbox_events where business_id=${f.businessId}`,
    );
  const remove = app.services.orderingLifecycle.register("test.incentive-refund-error", {
    refund: () => Promise.reject(new Error("İade tüketicisi başarısız")),
  });
  try {
    await expect(
      scoped(app.db, f.businessId, async (tx) => {
        await receipt(tx, f, f.earningOrder.id, 1, 5000);
        await app.services.orderingLifecycle.run("refund", tx, {
          businessId: f.businessId,
          orderId: f.earningOrder.id,
          userId: f.owner.id,
        });
      }),
    ).rejects.toThrow("İade tüketicisi başarısız");
  } finally {
    remove();
  }
  expect(await f.client.ok(z.unknown(), "GET", `${f.root}/loyalty`)).toEqual(before);
  expect(
    await app.platformDb.many(sql`select id from order_refunds where business_id=${f.businessId}`),
  ).toEqual([]);
  expect(
    await app.platformDb.many(sql`select id from outbox_events where business_id=${f.businessId}`),
  ).toEqual(events);
  expect(
    await app.platformDb.many(sql`select id from audit_log where target_id=${f.earningOrder.id}`),
  ).toEqual(audit);
});

it("askıya alınmış müşteri doğrudan SQL üzerinden eski puan cüzdanını okuyamaz", async () => {
  const f = await earningFixture();
  const wallet = () =>
    scoped(app.db, f.businessId, async (tx) => {
      await tx.execute(sql`select set_config('vado.user_id',${f.customer.id},true)`);
      return tx.many<{ balance: number }>(
        sql`select balance from loyalty_wallets where business_id=${f.businessId}`,
      );
    });
  expect(await wallet()).toEqual([{ balance: 1000 }]);
  await app.platformDb.execute(sql`update users set status='suspended' where id=${f.customer.id}`);
  expect(await wallet()).toEqual([]);
});
it("tamamlanan ama ödenmemiş sipariş puan kazanmaz; son tahsilat yalnız bir kere kazandırır", async () => {
  const f = await pickup();
  await as(app, f.owner).ok(
    z.unknown(),
    "PUT",
    `/v1/business/${f.businessId}/incentives/settings`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { expectedVersion: 0, stackCampaignCoupon: false, earnBasisPoints: 1000 },
    },
  );
  const cart = await f.client.ok(cartSchema, "GET", `${f.root}/carts/${f.cart.id}`),
    response = await checkout(f, cart),
    order = orderSchema.parse(response.body);
  const accepted = await app.services.ordering.updateStatus(f.scope, order.id, {
    expectedVersion: 1,
    status: "accepted",
  });
  await app.services.ordering.updateStatus(f.scope, order.id, {
    expectedVersion: accepted.version,
    status: "completed",
  });
  expect(
    await f.client.ok(z.looseObject({ balance: z.number() }), "GET", `${f.root}/loyalty`),
  ).toMatchObject({ balance: 0 });
  await app.services.ordering.recordPayment(f.scope, order.id, {
    expectedPaymentVersion: 0,
    place: "counter",
    method: "card",
  });
  expect(
    await f.client.ok(z.looseObject({ balance: z.number() }), "GET", `${f.root}/loyalty`),
  ).toMatchObject({ balance: 1000 });
});
