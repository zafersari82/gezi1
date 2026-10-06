import { randomUUID } from "node:crypto";

import { catalogItemBodySchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { createCatalogFixture } from "./support/catalog-fixture";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { scoped } from "./support/tenant-fixture";

const cartView = z.object({
  id: z.uuid(),
  version: z.number(),
  status: z.string(),
  totalMinor: z.number(),
  vatMinor: z.number(),
  quoteHash: z.string(),
  lines: z.array(z.object({ itemId: z.uuid(), available: z.boolean(), priceChanged: z.boolean() })),
});
const orderView = z.object({
  id: z.uuid(),
  version: z.number(),
  status: z.string(),
  totalMinor: z.number(),
  vatMinor: z.number(),
  lines: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      unitPriceMinor: z.number(),
      options: z.array(z.object({ name: z.string(), priceDeltaMinor: z.number() })),
    }),
  ),
});
let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

async function prepare() {
  const f = await createCatalogFixture(app);
  const client = as(app, f.customer);
  const root = `/v1/shell/${f.businessId}/${f.instanceId}`;
  const opened = await client.request("POST", `${root}/carts`, {
    body: { branchId: f.branchId, fulfilment: "pickup" },
  });
  expect(opened.status).toBe(200);
  const empty = cartView.parse(opened.body);
  const filled = await client.request("PUT", `${root}/carts/${empty.id}`, {
    body: {
      expectedVersion: empty.version,
      lines: [{ itemId: f.itemId, quantity: 2, optionIds: [f.optionId] }],
    },
  });
  expect(filled.status).toBe(200);
  return { ...f, client, root, cart: cartView.parse(filled.body) };
}
const checkoutBody = (cart: z.infer<typeof cartView>) => ({
  cartVersion: cart.version,
  seenTotalMinor: cart.totalMinor,
  quoteHash: cart.quoteHash,
});

describe("Sunucuda sepet ve sipariş çekirdeği", () => {
  test.each(["cartVersion", "seenTotalMinor"] as const)(
    "doğru fiyat özetiyle bile yanlış %s checkout yapamaz",
    async (field) => {
      const f = await prepare();
      const body = checkoutBody(f.cart);
      const response = await f.client.request("POST", `${f.root}/carts/${f.cart.id}/checkout`, {
        headers: { "idempotency-key": randomUUID() },
        body: { ...body, [field]: body[field] + 1 },
      });
      expect(response).toMatchObject({ status: 409, body: { error: { code: "cart_changed" } } });
      expect(
        await scoped(app.db, f.businessId, (tx) =>
          tx.many(sql`select id from orders where cart_id=${f.cart.id}`),
        ),
      ).toEqual([]);
      const correct = await f.client.request("POST", `${f.root}/carts/${f.cart.id}/checkout`, {
        headers: { "idempotency-key": randomUUID() },
        body,
      });
      expect(correct.status).toBe(200);
    },
  );

  test("aktif ve çoklu durum süzgeçleri sayfalama öncesinde uygulanır", async () => {
    const f = await prepare();
    const first = orderView.parse(
      (
        await f.client.request("POST", `${f.root}/carts/${f.cart.id}/checkout`, {
          headers: { "idempotency-key": randomUUID() },
          body: checkoutBody(f.cart),
        })
      ).body,
    );
    const owner = as(app, f.owner);
    const root = `/v1/business/${f.businessId}/orders`;
    await owner.request("PUT", `${root}/${first.id}/status`, {
      body: { status: "accepted", expectedVersion: 1 },
    });
    const empty = cartView.parse(
      (await f.client.request("POST", `${f.root}/carts`, { body: { branchId: f.branchId } })).body,
    );
    const cart = cartView.parse(
      (
        await f.client.request("PUT", `${f.root}/carts/${empty.id}`, {
          body: {
            expectedVersion: empty.version,
            lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
          },
        })
      ).body,
    );
    const second = orderView.parse(
      (
        await f.client.request("POST", `${f.root}/carts/${cart.id}/checkout`, {
          headers: { "idempotency-key": randomUUID() },
          body: checkoutBody(cart),
        })
      ).body,
    );
    await owner.request("PUT", `${root}/${second.id}/status`, {
      body: { status: "rejected", expectedVersion: 1 },
    });
    const list = z.object({
      items: z.array(orderView.pick({ id: true, status: true })),
      nextCursor: z.string().nullable(),
    });
    for (const query of [
      "active=true",
      "statuses=accepted,preparing",
      "statuses=accepted,preparing&active=true",
    ])
      expect(
        list.parse((await owner.request("GET", `${root}?limit=1&${query}`)).body),
      ).toMatchObject({ items: [{ id: first.id, status: "accepted" }], nextCursor: null });
    expect(
      list.parse((await owner.request("GET", `${root}?limit=1&status=rejected&active=true`)).body)
        .items,
    ).toEqual([]);
    expect(
      list.parse((await owner.request("GET", `${root}?limit=1&active=false`)).body).items,
    ).toEqual([{ id: second.id, status: "rejected" }]);
  });

  test("bozuk durum ve aktiflik süzgeci SQL çalıştırmadan reddedilir", async () => {
    const f = await prepare();
    const owner = as(app, f.owner);
    for (const query of [
      "statuses=",
      "statuses=accepted,",
      "statuses=placed%3Bdelete",
      "active=maybe",
    ])
      await owner.fail("validation_failed", "GET", `/v1/business/${f.businessId}/orders?${query}`);
  });

  test("aynı müşteriye tek açık sepet; iki cihazın bir düzenlemesi çakışır", async () => {
    const f = await prepare();
    const reopened = await f.client.request("POST", `${f.root}/carts`, {
      body: { branchId: f.branchId, fulfilment: "pickup" },
    });
    expect(cartView.parse(reopened.body).id).toBe(f.cart.id);
    const responses = await Promise.all(
      [1, 3].map((quantity) =>
        f.client.request("PUT", `${f.root}/carts/${f.cart.id}`, {
          body: {
            expectedVersion: f.cart.version,
            lines: [{ itemId: f.itemId, quantity, optionIds: [] }],
          },
        }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(responses.find((r) => r.status === 409)?.body).toMatchObject({
      error: { code: "cart_version_conflict" },
    });
  });

  test("elli aynı anahtarlı checkout tek sipariş, tek olay ve ilk yanıtı verir", async () => {
    const f = await prepare();
    const key = randomUUID();
    const send = (body = checkoutBody(f.cart)) =>
      f.client.request("POST", `${f.root}/carts/${f.cart.id}/checkout`, {
        headers: { "idempotency-key": key },
        body,
      });
    const responses = await Promise.all(Array.from({ length: 50 }, () => send()));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    const first = orderView.parse(responses[0]?.body);
    for (const response of responses) expect(response.body).toEqual(responses[0]?.body);
    expect(first).toMatchObject({
      status: "placed",
      version: 1,
      totalMinor: 25000,
      vatMinor: 2273,
      lines: [
        {
          name: "Örnek ürün",
          quantity: 2,
          unitPriceMinor: 12500,
          options: [{ name: "Ek ürün", priceDeltaMinor: 2500 }],
        },
      ],
    });
    expect(
      await scoped(app.db, f.businessId, (tx) =>
        tx.many(sql`select id from orders where cart_id=${f.cart.id}`),
      ),
    ).toHaveLength(1);
    expect(
      await scoped(app.db, f.businessId, (tx) =>
        tx.many(sql`select id from outbox_events where order_id=${first.id}`),
      ),
    ).toHaveLength(1);
    expect((await send({ ...checkoutBody(f.cart), seenTotalMinor: 1 })).body).toMatchObject({
      error: { code: "idempotency_conflict" },
    });
  }, 15_000);

  test("fiyat değişimi 409 yeni sepet verir; onay ve yeni anahtar sonrası yeni fiyat sabitlenir", async () => {
    const f = await prepare();
    await app.services.catalog.saveItem(
      f.scope,
      catalogItemBodySchema.parse({
        name: "Yeni ürün adı",
        categoryId: f.categoryId,
        price: { amountMinor: 12000, vatBasisPoints: 1000 },
      }),
      f.itemId,
    );
    const changed = await f.client.request("POST", `${f.root}/carts/${f.cart.id}/checkout`, {
      headers: { "idempotency-key": randomUUID() },
      body: checkoutBody(f.cart),
    });
    expect(changed).toMatchObject({ status: 409, body: { error: { code: "cart_changed" } } });
    const fresh = cartView.parse(
      z
        .object({ error: z.object({ details: z.object({ cart: z.unknown() }) }) })
        .parse(changed.body).error.details.cart,
    );
    expect(fresh.totalMinor).toBe(29000);
    expect(fresh.lines[0]?.priceChanged).toBe(true);
    expect(
      await scoped(app.db, f.businessId, (tx) =>
        tx.many(sql`select id from orders where cart_id=${f.cart.id}`),
      ),
    ).toEqual([]);
    const placed = await f.client.request("POST", `${f.root}/carts/${f.cart.id}/checkout`, {
      headers: { "idempotency-key": randomUUID() },
      body: checkoutBody(fresh),
    });
    expect(placed.status).toBe(200);
    const order = orderView.parse(placed.body);
    await app.services.catalog.savePrice(f.scope, f.itemId, {
      branchId: null,
      amountMinor: 1,
      vatBasisPoints: 0,
    });
    const saved = await as(app, f.owner).request(
      "GET",
      `/v1/business/${f.businessId}/orders/${order.id}`,
    );
    expect(orderView.parse(saved.body)).toMatchObject({
      totalMinor: 29000,
      lines: [{ name: "Yeni ürün adı", unitPriceMinor: 14500 }],
    });
  });

  test("toplam aynı kalsa da KDV ve bulunurluk değişimi siparişi durdurur", async () => {
    const f = await prepare();
    await app.services.catalog.savePrice(f.scope, f.itemId, {
      branchId: null,
      amountMinor: 10000,
      vatBasisPoints: 2000,
    });
    const response = await f.client.request("POST", `${f.root}/carts/${f.cart.id}/checkout`, {
      headers: { "idempotency-key": randomUUID() },
      body: checkoutBody(f.cart),
    });
    expect(response).toMatchObject({ status: 409, body: { error: { code: "cart_changed" } } });
    await app.services.catalog.saveItem(
      f.scope,
      catalogItemBodySchema.parse({
        name: "Örnek ürün",
        available: false,
        price: { amountMinor: 10000, vatBasisPoints: 1000 },
      }),
      f.itemId,
    );
    const unavailable = await f.client.request("GET", `${f.root}/carts/${f.cart.id}`);
    expect(cartView.parse(unavailable.body).lines[0]?.available).toBe(false);
  });

  test("eş zamanlı durumlarda bir kazanan olur; bitmiş sipariş, fiyat ve geçmiş değişmez", async () => {
    const f = await prepare();
    const placed = await f.client.request("POST", `${f.root}/carts/${f.cart.id}/checkout`, {
      headers: { "idempotency-key": randomUUID() },
      body: checkoutBody(f.cart),
    });
    const order = orderView.parse(placed.body);
    const client = as(app, f.owner);
    const root = `/v1/business/${f.businessId}/orders/${order.id}/status`;
    const responses = await Promise.all(
      ["accepted", "rejected"].map((status) =>
        client.request("PUT", root, { body: { expectedVersion: 1, status } }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(responses.find((r) => r.status === 409)?.body).toMatchObject({
      error: { code: "order_version_conflict" },
    });
    let terminal = orderView.parse(responses.find((r) => r.status === 200)?.body);
    if (terminal.status === "accepted")
      terminal = orderView.parse(
        (
          await client.request("PUT", root, {
            body: { expectedVersion: terminal.version, status: "completed" },
          })
        ).body,
      );
    await client.fail("order_state_invalid", "PUT", root, {
      body: { expectedVersion: terminal.version, status: "accepted" },
    });
    for (const query of [
      sql`update orders set total_minor=1 where id=${order.id}`,
      sql`update orders set status='placed',version=version+1 where id=${order.id}`,
      sql`update order_lines set name='Değişen ad' where order_id=${order.id}`,
      sql`delete from order_status_history where order_id=${order.id}`,
    ]) {
      await expect(scoped(app.db, f.businessId, (tx) => tx.execute(query))).rejects.toMatchObject({
        code: "23514",
      });
    }
    const events = await scoped(app.db, f.businessId, (tx) =>
      tx.many<{ sequence: number }>(
        sql`select sequence from outbox_events where order_id=${order.id} order by sequence`,
      ),
    );
    expect(events.map((e) => e.sequence)).toEqual(
      Array.from({ length: terminal.version }, (_, i) => i + 1),
    );
  });

  test("aynı işletmedeki başka müşteri sepeti veya siparişi alamaz", async () => {
    const f = await prepare();
    const other = as(app, await createUser(app, "Başka müşteri"));
    await other.fail("not_found", "GET", `${f.root}/carts/${f.cart.id}`);
    await other.fail("not_found", "PUT", `${f.root}/carts/${f.cart.id}`, {
      body: { expectedVersion: f.cart.version, lines: [] },
    });
    const placed = await f.client.request("POST", `${f.root}/carts/${f.cart.id}/checkout`, {
      headers: { "idempotency-key": randomUUID() },
      body: checkoutBody(f.cart),
    });
    const order = orderView.parse(placed.body);
    await other.fail("not_found", "GET", `${f.root}/orders/${order.id}`);
  });
});
