import { randomUUID } from "node:crypto";

import { cartSchema, orderSchema } from "@vado/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createOrderingFixture } from "./support/ordering-fixture";
import { scoped } from "./support/tenant-fixture";
let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(() => app.stop());
const row = z.looseObject({ id: z.uuid(), version: z.number(), status: z.string() });
async function fixture(completed = false, paid = false) {
  const f = await createOrderingFixture(app),
    owner = as(app, f.owner),
    client = as(app, f.customer),
    root = `/v1/shell/${f.businessId}/${f.instanceId}`;
  for (const capabilityId of ["ordering.returns", "ordering.reorder"])
    expect(
      (
        await owner.request(
          "PUT",
          `/v1/business/${f.businessId}/app-instances/${f.instanceId}/capabilities/${capabilityId}`,
          { body: { version: "1.0.0", enabled: true, config: {} } },
        )
      ).status,
    ).toBe(200);
  let order = f.order;
  if (completed || paid)
    order = await app.services.ordering.updateStatus(f.scope, order.id, {
      expectedVersion: order.version,
      status: "accepted",
    });
  if (paid)
    await app.services.ordering.recordPayment(f.scope, order.id, {
      expectedPaymentVersion: 0,
      place: "counter",
      method: "cash",
    });
  if (completed)
    order = await app.services.ordering.updateStatus(f.scope, order.id, {
      expectedVersion: order.version,
      status: "completed",
    });
  return { ...f, order, owner, client, root };
}
it("müşteri kabul öncesinde siparişini bir kere iptal eder, yabancı siparişe erişemez", async () => {
  const f = await fixture(),
    key = randomUUID(),
    body = {
      kind: "cancel",
      expectedOrderVersion: f.order.version,
      reason: "Yanlış ürün seçtim",
      amountMinor: null,
    };
  const replies = await Promise.all(
    Array.from({ length: 12 }, () =>
      f.client.request("POST", `${f.root}/orders/${f.order.id}/returns`, {
        headers: { "idempotency-key": key },
        body,
      }),
    ),
  );
  expect(
    replies.every((r) => r.status === 200),
    JSON.stringify(replies[0]?.body),
  ).toBe(true);
  expect(row.parse(replies[0]?.body).status).toBe("approved");
  expect((await app.services.ordering.getOrder(f.customerScope, f.order.id)).status).toBe(
    "cancelled",
  );
  expect(
    await app.platformDb.many(
      sql`select id from order_return_requests where order_id=${f.order.id}`,
    ),
  ).toHaveLength(1);
  const other = await fixture();
  await other.client.fail("not_found", "POST", `${other.root}/orders/${f.order.id}/returns`, {
    headers: { "idempotency-key": randomUUID() },
    body,
  });
});
it("kabulden sonra müşteri talep açar; gerekçeli kararı yalnız sahip veya yönetici verir", async () => {
  const f = await fixture(false, true),
    request = await f.client.ok(row, "POST", `${f.root}/orders/${f.order.id}/returns`, {
      headers: { "idempotency-key": randomUUID() },
      body: {
        kind: "cancel",
        expectedOrderVersion: f.order.version,
        reason: "Teslim adresi yanlış",
        amountMinor: null,
      },
    });
  expect(request.status).toBe("pending");
  const endpoint = `/v1/business/${f.businessId}/returns/${request.id}/decision`,
    body = {
      expectedVersion: request.version,
      expectedOrderVersion: f.order.version,
      decision: "approve",
      reason: "Müşteri talebi",
      physicalRefund: null,
    };
  expect(
    (await f.owner.request("PUT", endpoint, { headers: { "idempotency-key": randomUUID() }, body }))
      .status,
  ).toBe(409);
  const staff = await createUser(app, "Personel");
  await scoped(app.db, f.businessId, (tx) =>
    tx.execute(
      sql`insert into business_members(business_id,user_id,role,active) values(${f.businessId},${staff.id},'staff',true)`,
    ),
  );
  await as(app, staff).fail("forbidden", "PUT", endpoint, {
    headers: { "idempotency-key": randomUUID() },
    body,
  });
  await as(app, staff).fail("forbidden", "GET", `/v1/business/${f.businessId}/returns`);
  const listing = await f.owner.ok(
    z.object({ items: z.array(row), nextCursor: z.string().nullable() }),
    "GET",
    `/v1/business/${f.businessId}/returns?status=pending`,
  );
  expect(listing.items.some((item) => item.id === request.id)).toBe(true);

  const approved = await f.owner.ok(row, "PUT", endpoint, {
    headers: { "idempotency-key": randomUUID() },
    body: { ...body, physicalRefund: { method: "cash", reference: "NAKIT-IADE-1" } },
  });
  expect(approved.status).toBe("approved");
  expect((await app.services.ordering.getOrder(f.customerScope, f.order.id)).status).toBe(
    "cancelled",
  );
  expect(
    await app.platformDb.many(
      sql`select amount_minor from order_refunds where order_id=${f.order.id}`,
    ),
  ).toEqual([{ amount_minor: f.order.totalMinor }]);
});
it("tamamlanmış sipariş yeniden açılmaz; kısmi iade eşzamanlı kararda tek ödeme kaydıdır", async () => {
  const f = await fixture(true, true),
    request = await f.client.ok(row, "POST", `${f.root}/orders/${f.order.id}/returns`, {
      headers: { "idempotency-key": randomUUID() },
      body: {
        kind: "refund",
        expectedOrderVersion: f.order.version,
        reason: "Eksik teslim",
        amountMinor: 10000,
      },
    });
  const body = {
    expectedVersion: request.version,
    expectedOrderVersion: f.order.version,
    decision: "approve",
    reason: "Eksik ürün doğrulandı",
    physicalRefund: { method: "card", reference: "POS-IADE-1" },
  };
  const replies = await Promise.all(
    Array.from({ length: 15 }, () =>
      f.owner.request("PUT", `/v1/business/${f.businessId}/returns/${request.id}/decision`, {
        headers: { "idempotency-key": randomUUID() },
        body,
      }),
    ),
  );
  expect(replies.filter((r) => r.status === 200)).toHaveLength(1);
  expect(replies.filter((r) => r.status === 409)).toHaveLength(14);
  expect(
    await app.platformDb.many(
      sql`select amount_minor from order_refunds where order_id=${f.order.id}`,
    ),
  ).toEqual([{ amount_minor: 10000 }]);
  expect((await app.services.ordering.getOrder(f.customerScope, f.order.id)).status).toBe(
    "completed",
  );
  expect(
    (
      await f.client.request("POST", `${f.root}/orders/${f.order.id}/returns`, {
        headers: { "idempotency-key": randomUUID() },
        body: {
          kind: "refund",
          expectedOrderVersion: f.order.version,
          reason: "Aşan talep",
          amountMinor: f.order.totalMinor,
        },
      })
    ).status,
  ).toBe(409);
});
it("iade tüketicisinin hatası talep, fiziksel kayıt, olay ve tekrar kaydını birlikte geri alır", async () => {
  const f = await fixture(true, true),
    request = await f.client.ok(row, "POST", `${f.root}/orders/${f.order.id}/returns`, {
      headers: { "idempotency-key": randomUUID() },
      body: {
        kind: "refund",
        expectedOrderVersion: f.order.version,
        reason: "Ürün kusurlu",
        amountMinor: 5000,
      },
    }),
    key = randomUUID();
  const body = {
      expectedVersion: request.version,
      expectedOrderVersion: f.order.version,
      decision: "approve",
      reason: "İade onaylandı",
      physicalRefund: { method: "cash", reference: "IADE-2" },
    },
    path = `/v1/business/${f.businessId}/returns/${request.id}/decision`;
  const events = await app.platformDb.many(
    sql`select id from outbox_events where business_id=${f.businessId}`,
  );
  const remove = app.services.orderingLifecycle.register("test.returns.failure", {
    refund: () => Promise.reject(new Error("Tüketici başarısız")),
  });
  try {
    expect(
      (await f.owner.request("PUT", path, { headers: { "idempotency-key": key }, body })).status,
    ).toBe(500);
  } finally {
    remove();
  }
  expect(
    await app.platformDb.many(sql`select id from order_refunds where order_id=${f.order.id}`),
  ).toEqual([]);
  expect(
    await app.platformDb.many(sql`select id from outbox_events where business_id=${f.businessId}`),
  ).toEqual(events);
  expect(
    (
      await f.client.ok(
        z.looseObject({ items: z.array(row) }),
        "GET",
        `${f.root}/orders/${f.order.id}/returns`,
      )
    ).items,
  ).toMatchObject([{ status: "pending", version: 1 }]);
  expect(
    (await f.owner.ok(row, "PUT", path, { headers: { "idempotency-key": key }, body })).status,
  ).toBe("approved");
});
it("işletme iade listesi tarih + kimlik imleciyle ikinci sayfaya geçer", async () => {
  const f = await fixture(false, true);
  const requestBody = {
    kind: "cancel",
    expectedOrderVersion: f.order.version,
    reason: "Siparişi değiştirmek istiyorum",
    amountMinor: null,
  };
  const firstRequest = await f.client.ok(
    row,
    "POST",
    `${f.root}/orders/${f.order.id}/returns`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: requestBody,
    },
  );
  await f.client.ok(row, "POST", `${f.root}/returns/${firstRequest.id}/withdraw`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: firstRequest.version },
  });
  const secondRequest = await f.client.ok(
    row,
    "POST",
    `${f.root}/orders/${f.order.id}/returns`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: requestBody,
    },
  );

  const pageSchema = z.looseObject({
    items: z.array(row),
    nextCursor: z.string().nullable(),
  });
  const url = `/v1/business/${f.businessId}/returns`;
  const firstPage = await f.owner.ok(pageSchema, "GET", `${url}?limit=1`);
  expect(firstPage.items.map((item) => item.id)).toEqual([secondRequest.id]);
  expect(firstPage.nextCursor).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\|[0-9a-f-]{36}$/,
  );
  const nextPage = await f.owner.ok(
    pageSchema,
    "GET",
    `${url}?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
  );
  expect(nextPage.items.map((item) => item.id)).toEqual([firstRequest.id]);
  expect(nextPage.nextCursor).toBeNull();
  expect((await f.owner.request("GET", `${url}?limit=1&cursor=123`)).status).toBe(400);
});
it("müşterinin farklı mini uygulama oturumu başka oturumdaki iadeleri göremez", async () => {
  const f = await fixture(false, true);
  const request = await f.client.ok(row, "POST", `${f.root}/orders/${f.order.id}/returns`, {
    headers: { "idempotency-key": randomUUID() },
    body: {
      kind: "cancel",
      expectedOrderVersion: f.order.version,
      reason: "Başka ürün tercih ediyorum",
      amountMinor: null,
    },
  });
  expect(request.status).toBe("pending");

  const merchantId = randomUUID();
  await app.db.execute(sql`
    insert into mini_app_merchants(mini_app_id,merchant_id,business_id,display_name)
    values(${f.miniAppId},${merchantId},${f.businessId},'İkinci uygulama mağazası')
  `);
  const instance = await app.services.businessManagement.createInstance(f.scope, {
    miniAppId: f.miniAppId,
    merchantId,
    engine: "ordering",
    active: true,
  });
  const otherRoot = `/v1/shell/${f.businessId}/${instance.id}`;
  const list = await f.client.ok(
    z.looseObject({ items: z.array(row) }),
    "GET",
    `${otherRoot}/orders/${f.order.id}/returns`,
  );
  expect(list.items).toEqual([]);
  await f.client.fail("not_found", "POST", `${otherRoot}/returns/${request.id}/withdraw`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: request.version },
  });
  const original = await f.client.ok(
    z.looseObject({ items: z.array(row) }),
    "GET",
    `${f.root}/orders/${f.order.id}/returns`,
  );
  expect(original.items.map((item) => item.id)).toEqual([request.id]);
});

it("tekrar sipariş güncel fiyatı kullanır ve dolu sepeti onaysız değiştirmez", async () => {
  const f = await fixture(true, true);
  await app.services.catalog.savePrice(f.scope, f.itemId, {
    branchId: null,
    amountMinor: 15000,
    vatBasisPoints: 1000,
  });
  const key = randomUUID(),
    body = { branchId: f.branchId, cartId: null, expectedVersion: 0, replace: false };
  const result = await f.client.ok(
    z.looseObject({
      cart: cartSchema,
      omitted: z.array(z.unknown()),
      requiresConfirmation: z.boolean(),
    }),
    "POST",
    `${f.root}/orders/${f.order.id}/reorder`,
    { headers: { "idempotency-key": key }, body },
  );
  expect(result.cart.totalMinor).toBe(35000);
  expect(result.requiresConfirmation).toBe(true);
  expect(
    await f.client.ok(z.unknown(), "POST", `${f.root}/orders/${f.order.id}/reorder`, {
      headers: { "idempotency-key": key },
      body,
    }),
  ).toEqual(result);
  expect(
    (
      await f.client.request("POST", `${f.root}/orders/${f.order.id}/reorder`, {
        headers: { "idempotency-key": randomUUID() },
        body,
      })
    ).status,
  ).toBe(409);
  expect((await app.services.ordering.getOrder(f.customerScope, f.order.id)).totalMinor).toBe(
    25000,
  );
});
it("tükenen ürün tekrar siparişte açıkça atlanır; eski tutarla sipariş yaratılmaz", async () => {
  const f = await fixture(true, true);
  await app.platformDb.execute(
    sql`update catalog_items set available=false,version=version+1 where business_id=${f.businessId} and id=${f.itemId}`,
  );
  const result = await f.client.ok(
    z.looseObject({
      cart: cartSchema,
      omitted: z.array(z.looseObject({ itemId: z.uuid(), reason: z.string() })),
    }),
    "POST",
    `${f.root}/orders/${f.order.id}/reorder`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { branchId: f.branchId, cartId: null, expectedVersion: 0, replace: false },
    },
  );
  expect(result.cart.lines).toEqual([]);
  expect(result.omitted).toMatchObject([{ itemId: f.itemId, reason: "unavailable" }]);
  expect(
    orderSchema.parse(await app.services.ordering.getOrder(f.customerScope, f.order.id)).status,
  ).toBe("completed");
});
