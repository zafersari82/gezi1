import { randomUUID } from "node:crypto";

import { orderSchema } from "@vado/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { as, asAdmin, startTestApp, type TestApp } from "./support/harness";
import { createOrderingFixture } from "./support/ordering-fixture";
import { scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(() => app.stop());
const row = z.looseObject({ id: z.uuid(), version: z.number() });
async function fixture(completed = true) {
  const f = await createOrderingFixture(app);
  let order = f.order;
  if (completed) {
    order = await app.services.ordering.updateStatus(f.scope, order.id, {
      expectedVersion: order.version,
      status: "accepted",
    });
    await app.services.ordering.recordPayment(f.scope, order.id, {
      expectedPaymentVersion: 0,
      place: "counter",
      method: "cash",
    });
    order = await app.services.ordering.updateStatus(f.scope, order.id, {
      expectedVersion: order.version,
      status: "completed",
    });
  }
  return {
    ...f,
    order,
    client: as(app, f.customer),
    root: `/v1/shell/${f.businessId}/${f.instanceId}`,
  };
}
it("yalnız kendi tamamlanmış siparişine değerlendirme yazılır, eşzamanlı tekrar tek kayıttır", async () => {
  const f = await fixture(),
    key = randomUUID(),
    body = { expectedOrderVersion: f.order.version, rating: 5, comment: "Zamanında geldi" };
  const calls = await Promise.all(
    Array.from({ length: 15 }, () =>
      f.client.request("POST", `${f.root}/orders/${f.order.id}/review`, {
        headers: { "idempotency-key": key },
        body,
      }),
    ),
  );
  expect(
    calls.every((c) => c.status === 200),
    JSON.stringify(calls[0]?.body),
  ).toBe(true);
  const review = row.parse(calls[0]?.body);
  expect(new Set(calls.map((c) => row.parse(c.body).id)).size).toBe(1);
  expect(JSON.stringify(calls[0]?.body)).not.toContain(f.customer.id);
  const duplicate = await f.client.request("POST", `${f.root}/orders/${f.order.id}/review`, {
    headers: { "idempotency-key": randomUUID() },
    body,
  });
  expect(duplicate.status).toBe(409);
  const other = await fixture();
  await other.client.fail("not_found", "PUT", `${other.root}/reviews/${review.id}`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: 1, rating: 1, comment: "Yabancı" },
  });
  expect(
    orderSchema.parse((await f.client.request("GET", `${f.root}/orders/${f.order.id}`)).body)
      .status,
  ).toBe("completed");
});
it("aynı müşterinin başka mini uygulama kaydı değerlendirmeyi düzenleyemez", async () => {
  const f = await fixture();
  const review = await f.client.ok(row, "POST", `${f.root}/orders/${f.order.id}/review`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedOrderVersion: f.order.version, rating: 5, comment: "İlk yorum" },
  });
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
  await f.client.fail("not_found", "PUT", `${otherRoot}/reviews/${review.id}`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: review.version, rating: 1, comment: "Başka uygulama" },
  });
  const updated = await f.client.ok(row, "PUT", `${f.root}/reviews/${review.id}`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: review.version, rating: 4, comment: "Düzeltilmiş yorum" },
  });
  expect(updated.version).toBe(review.version + 1);
});

it("iptal edilen ve henüz tamamlanmamış siparişler değerlendirilemez", async () => {
  const f = await fixture(false),
    body = { expectedOrderVersion: 1, rating: 4, comment: "" };
  expect(
    (
      await f.client.request("POST", `${f.root}/orders/${f.order.id}/review`, {
        headers: { "idempotency-key": randomUUID() },
        body,
      })
    ).status,
  ).toBe(409);
  const cancelled = await app.services.ordering.updateStatus(f.scope, f.order.id, {
    expectedVersion: 1,
    status: "cancelled",
  });
  expect(
    (
      await f.client.request("POST", `${f.root}/orders/${f.order.id}/review`, {
        headers: { "idempotency-key": randomUUID() },
        body: { ...body, expectedOrderVersion: cancelled.version },
      })
    ).status,
  ).toBe(409);
});
it("işletme cevabı sürümlüdür, değerlendirme mevcut şikayet üzerinden denetlenir", async () => {
  const f = await fixture();
  const review = await f.client.ok(row, "POST", `${f.root}/orders/${f.order.id}/review`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedOrderVersion: f.order.version, rating: 4, comment: "Teşekkürler" },
  });
  const reply = await as(app, f.owner).ok(
    row,
    "PUT",
    `/v1/business/${f.businessId}/reviews/${review.id}/reply`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { expectedVersion: review.version, reply: "Afiyet olsun" },
    },
  );
  expect(reply.version).toBe(2);
  await f.client.done("POST", "/v1/reports", {
    body: { targetType: "review", targetId: review.id, reason: "other", note: "Denetim" },
  });
  const report = await app.platformDb.one<{ id: string }>(
    sql`select id from reports where target_type='review' and target_id=${review.id}`,
  );
  await asAdmin(app).done("PATCH", `/v1/admin/reports/${report.id}`, {
    body: { status: "resolved", reviewVisibility: "hidden" },
  });
  expect(
    await f.client.ok(z.looseObject({ items: z.array(row) }), "GET", `${f.root}/reviews`),
  ).toMatchObject({ items: [] });
  const changed = await f.client.ok(row, "PUT", `${f.root}/reviews/${review.id}`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: 3, rating: 5, comment: "Düzelttim" },
  });
  expect(changed.version).toBe(4);
  expect(
    (await f.client.ok(z.looseObject({ items: z.array(row) }), "GET", `${f.root}/reviews`)).items,
  ).toEqual([]);
});
it("favori kişiye özeldir; çift dokunma ve eski sürüm kaydı bozamaz", async () => {
  const f = await fixture(),
    key = randomUUID(),
    body = { itemId: f.itemId, value: true, expectedVersion: 0 };
  const first = await f.client.ok(row, "PUT", `${f.root}/favorites`, {
    headers: { "idempotency-key": key },
    body,
  });
  expect(
    await f.client.ok(row, "PUT", `${f.root}/favorites`, {
      headers: { "idempotency-key": key },
      body,
    }),
  ).toEqual(first);
  const other = await fixture();
  expect(
    (
      await other.client.ok(
        z.looseObject({ items: z.array(row) }),
        "GET",
        `${other.root}/favorites`,
      )
    ).items,
  ).toEqual([]);
  expect(
    (
      await f.client.request("PUT", `${f.root}/favorites`, {
        headers: { "idempotency-key": randomUUID() },
        body: { ...body, value: false },
      })
    ).status,
  ).toBe(409);
  const removed = await f.client.ok(row, "PUT", `${f.root}/favorites`, {
    headers: { "idempotency-key": randomUUID() },
    body: { ...body, expectedVersion: first.version, value: false },
  });
  expect(removed.version).toBe(2);
  expect(removed.value).toBe(false);
});
it("değerlendirme ve favori tabloları kapsamsız ve yabancı SQL erişimini kapatır", async () => {
  const f = await fixture(),
    other = await fixture();
  await f.client.ok(row, "POST", `${f.root}/orders/${f.order.id}/review`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedOrderVersion: f.order.version, rating: 5, comment: "" },
  });
  await f.client.ok(row, "PUT", `${f.root}/favorites`, {
    headers: { "idempotency-key": randomUUID() },
    body: { itemId: null, value: true, expectedVersion: 0 },
  });
  expect(await app.db.many(sql`select * from reviews`)).toEqual([]);
  expect(
    await scoped(app.db, other.businessId, (tx) =>
      tx.many(sql`select * from reviews where business_id=${f.businessId}`),
    ),
  ).toEqual([]);
  expect(await app.db.many(sql`select * from user_favorites`)).toEqual([]);
  await scoped(app.db, f.businessId, async (tx) => {
    await tx.execute(sql`select set_config('vado.user_id',${f.owner.id},true)`);
    expect(await tx.many(sql`select * from user_favorites`)).toEqual([]);
  });
});
it("favori listesi sayfalanır; tükenen ürün silinmeden available=false görünür", async () => {
  const f = await fixture(),
    put = (itemId: string | null) =>
      f.client.ok(row, "PUT", `${f.root}/favorites`, {
        headers: { "idempotency-key": randomUUID() },
        body: { itemId, value: true, expectedVersion: 0 },
      });
  await put(null);
  await put(f.itemId);
  const page = z.looseObject({
    items: z.array(z.looseObject({ itemId: z.uuid().nullable(), available: z.boolean() })),
    nextCursor: z.string().nullable(),
  });
  const first = await f.client.ok(page, "GET", `${f.root}/favorites?limit=1`);
  expect(first.items).toHaveLength(1);
  expect(first.items[0]?.itemId).toBe(f.itemId);
  expect(first.nextCursor).not.toBeNull();
  const second = await f.client.ok(
    page,
    "GET",
    `${f.root}/favorites?limit=1&cursor=${first.nextCursor}`,
  );
  expect(second.items.map((i) => i.itemId)).toEqual([null]);
  expect(second.nextCursor).toBeNull();
  await app.platformDb.execute(
    sql`update catalog_items set available=false,version=version+1 where business_id=${f.businessId} and id=${f.itemId}`,
  );
  const all = await f.client.ok(page, "GET", `${f.root}/favorites`);
  expect(all.items.map((i) => [i.itemId, i.available])).toEqual([
    [f.itemId, false],
    [null, true],
  ]);
});
it("favori sıralaması doğrudan SQL ile değiştirilemez", async () => {
  const f = await fixture();
  await f.client.ok(row, "PUT", `${f.root}/favorites`, {
    headers: { "idempotency-key": randomUUID() },
    body: { itemId: null, value: true, expectedVersion: 0 },
  });
  await expect(
    scoped(app.db, f.businessId, async (tx) => {
      await tx.execute(sql`select set_config('vado.user_id',${f.customer.id},true)`);
      await tx.execute(
        sql`update user_favorites set seq=seq+1,version=version+1 where business_id=${f.businessId} and user_id=${f.customer.id}`,
      );
    }),
    // Sıra numarası kimlik sütunudur; PostgreSQL elle değiştirilmesine izin vermez.
  ).rejects.toThrow(/can only be updated to DEFAULT/);
  await expect(
    scoped(app.db, f.businessId, async (tx) => {
      await tx.execute(sql`select set_config('vado.user_id',${f.customer.id},true)`);
      await tx.execute(
        sql`update user_favorites set item_id=null,version=version where business_id=${f.businessId} and user_id=${f.customer.id}`,
      );
    }),
  ).rejects.toThrow(/Favorinin bağlamı ve sürümü korunmalıdır/);
});
