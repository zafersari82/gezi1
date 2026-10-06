import { cartSchema } from "@vado/contracts";
import { afterAll, beforeAll, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { createCatalogFixture } from "./support/catalog-fixture";
import { as, startTestApp, type TestApp } from "./support/harness";
import { createOrderingFixture } from "./support/ordering-fixture";
import { scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

test("süresi dolmuş terk edilmiş sepet temizlenir; sipariş sepeti ve görüntüsü kalır", async () => {
  const f = await createOrderingFixture(app);
  const expired = await scoped(app.db, f.businessId, (tx) =>
    tx.one<{
      id: string;
    }>(sql`insert into carts(business_id,branch_id,app_instance_id,business_customer_id,created_at,expires_at)
    values(${f.businessId},${f.branchId},${f.instanceId},${f.customerScope.businessCustomerId},now()-interval '10 days',now()-interval '9 days') returning id`),
  );
  expect(await app.services.tenantMaintenance.purgeCarts()).toEqual({ expired: 1, deleted: 1 });
  expect(
    await scoped(app.db, f.businessId, (tx) =>
      tx.many(sql`select id from carts where id=${expired.id}`),
    ),
  ).toEqual([]);
  expect((await app.services.ordering.getOrder(f.customerScope, f.order.id)).lines).toHaveLength(1);
});

test("seçilmiş mini uygulamadan farklı işletme örneği doğrulanmaz", async () => {
  const f = await createCatalogFixture(app);
  await as(app, f.customer).fail("business_not_found", "POST", "/v1/shell/business-context", {
    body: { businessId: f.businessId, appInstanceId: f.instanceId, miniAppId: "baska-uygulama" },
  });
});

test("outbox yazımı reddedilirse sepet kapanışı, sipariş ve tekrar kaydı geri alınır", async () => {
  const f = await createCatalogFixture(app);
  const open = await app.services.ordering.openCart(f.customerScope, f.branchId);
  const cart = await app.services.ordering.replaceCart(f.customerScope, open.id, {
    expectedVersion: open.version,
    lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
  });
  await app.migrationDb.execute(
    sql`create table order_test_rejection(business_id uuid primary key)`,
  );
  await app.migrationDb.execute(sql`insert into order_test_rejection values(${f.businessId})`);
  await app.migrationDb.execute(sql`grant select on order_test_rejection to vado_app`);
  await app.migrationDb.execute(
    sql`create function reject_order_test_event() returns trigger language plpgsql as $$begin if new.type='order.placed' and exists(select 1 from order_test_rejection where business_id=new.business_id) then raise exception 'Sınama kesintisi'; end if; return new; end$$`,
  );
  await app.migrationDb.execute(
    sql`create trigger reject_order_test_event before insert on outbox_events for each row execute function reject_order_test_event()`,
  );
  try {
    await expect(
      app.services.ordering.checkout(f.customerScope, cart.id, "kesinti", {
        cartVersion: cart.version,
        seenTotalMinor: cart.totalMinor,
        quoteHash: cart.quoteHash,
      }),
    ).rejects.toThrow("Sınama kesintisi");
  } finally {
    await app.migrationDb.execute(sql`drop trigger reject_order_test_event on outbox_events`);
    await app.migrationDb.execute(sql`drop function reject_order_test_event()`);
    await app.migrationDb.execute(sql`drop table order_test_rejection`);
  }
  expect(
    cartSchema.parse(await app.services.ordering.getCart(f.customerScope, cart.id)),
  ).toMatchObject({ version: cart.version, status: "open" });
  expect(await scoped(app.db, f.businessId, (tx) => tx.many(sql`select * from orders`))).toEqual(
    [],
  );
  expect(
    await scoped(app.db, f.businessId, (tx) =>
      tx.many(sql`select * from idempotency_keys where key='kesinti'`),
    ),
  ).toEqual([]);
});

test("sipariş denetim tüketicisi etkisini ve teslim kaydını bir kez yazar", async () => {
  const f = await createOrderingFixture(app);
  const events = await scoped(app.db, f.businessId, (tx) =>
    tx.many<{ id: string }>(sql`select id from outbox_events where order_id=${f.order.id}`),
  );
  await app.services.events.drain({ eventIds: events.map((e) => e.id) });
  await app.services.events.drain({ eventIds: events.map((e) => e.id) });
  expect(
    await app.db.many(
      sql`select id from audit_log where action='order.placed' and target_id=${f.order.id}`,
    ),
  ).toHaveLength(1);
  expect(
    await scoped(app.db, f.businessId, (tx) =>
      tx.many(
        sql`select * from event_deliveries where event_id=${events[0]?.id} and consumer='ordering.audit'`,
      ),
    ),
  ).toHaveLength(1);
});
