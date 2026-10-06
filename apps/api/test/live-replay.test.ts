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
const stream = z.object({
  cursor: z.number(),
  reset: z.boolean(),
  items: z.array(
    z.object({
      cursor: z.number(),
      orderId: z.uuid().nullable(),
      type: z.string(),
      eventId: z.uuid(),
    }),
  ),
});
it("kalıcı akış işçi dururken bile kaydedilir; tekrar oynatma imleci yinelenmeyi önler", async () => {
  const f = await createRestaurantFixture(app);
  const path = `/v1/business/${f.businessId}/live-events?cursor=0`;
  const first = await as(app, f.owner).ok(stream, "GET", path);
  expect(first.items).toHaveLength(1);
  expect(first.items[0]).toMatchObject({ orderId: f.order.id, type: "order.placed" });
  await app.services.ordering.accept(f.scope, f.order.id, {
    expectedVersion: 1,
    preparationMinutes: 20,
  });
  const next = await as(app, f.owner).ok(
    stream,
    "GET",
    `/v1/business/${f.businessId}/live-events?cursor=${first.cursor}`,
  );
  expect(next.items).toHaveLength(1);
  expect(next.items[0]?.type).toBe("order.status_changed");
  expect(
    await as(app, f.owner).ok(
      stream,
      "GET",
      `/v1/business/${f.businessId}/live-events?cursor=${next.cursor}`,
    ),
  ).toMatchObject({ items: [], reset: false });
  const other = await createTenantFixture(app);
  expect(
    await as(app, other.customer).request(
      "GET",
      `/v1/shell/${f.businessId}/${f.instanceId}/live-events?cursor=0`,
    ),
  ).toMatchObject({ status: 200, body: { items: [] } });
  expect(await app.db.many(sql`select * from business_live_events`)).toEqual([]);
});
it("soket ve anlık bildirim müşteriye kabul süresi ve ret gerekçesini bildirir", async () => {
  const f = await createRestaurantFixture(app);
  await app.services.notifications.updateSettings(f.customer.id, { pushPreview: true });
  await as(app, f.customer).request("PUT", "/v1/me/push-token", {
    body: { token: "ExpoPushToken[restaurant-customer]" },
  });
  await app.services.ordering.accept(f.scope, f.order.id, {
    expectedVersion: 1,
    preparationMinutes: 23,
  });
  const pending = await app.platformDb.many<{ id: string }>(
    sql`select id from outbox_events where business_id=${f.businessId} and order_id=${f.order.id} order by sequence`,
  );
  await app.services.events.drain({ eventIds: pending.map((e) => e.id) });
  expect(app.sentPush).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        to: "ExpoPushToken[restaurant-customer]",
        body: expect.stringContaining("23") as unknown,
        data: expect.objectContaining({ type: "order", orderId: f.order.id }) as unknown,
      }),
    ]),
  );
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(
        sql`update business_live_events set cursor=cursor+100 where business_id=${f.businessId}`,
      ),
    ),
  ).rejects.toMatchObject({ code: "42501" });
});

it("aynı işletmenin iki müşterisi kalıcı akışta yalnız kendi sipariş olayını görür", async () => {
  const f = await createRestaurantFixture(app);
  const other = await createRestaurantFixture(app);
  const scope = await app.services.businessManagement.customerScope(
    other.customer.id,
    f.businessId,
    f.instanceId,
  );
  const opened = await app.services.ordering.openCart(scope, f.branchId);
  const cart = await app.services.ordering.replaceCart(scope, opened.id, {
    expectedVersion: opened.version,
    lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
  });
  const made = await app.services.ordering.checkout(scope, cart.id, cart.id, {
    cartVersion: cart.version,
    seenTotalMinor: cart.totalMinor,
    quoteHash: cart.quoteHash,
  });
  const order = orderSchema.parse(made.body);
  const own = await app.services.liveReplay.replay(f.customerScope, 0);
  const theirs = await app.services.liveReplay.replay(scope, 0);
  expect(own.items.filter((e) => e.orderId !== null).map((e) => e.orderId)).toEqual([f.order.id]);
  expect(theirs.items.filter((e) => e.orderId !== null).map((e) => e.orderId)).toEqual([order.id]);
});
