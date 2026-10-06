import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { appendEvent } from "../src/core/outbox-events";
import { withTenant } from "../src/core/tenant-scope";
import { startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

test("olay, teslim ve tekrar tabloları başka işletmeden okunamaz ve yazılamaz", async () => {
  const a = await createTenantFixture(app);
  const b = await createTenantFixture(app);
  const id = await withTenant(app.db, b.scope, (tx) =>
    appendEvent(tx, b.scope, {
      aggregateId: b.branchId,
      sequence: 1,
      type: "test.isolation",
      payload: {},
    }),
  );
  await scoped(app.db, b.businessId, async (tx) => {
    await tx.execute(
      sql`insert into event_deliveries(business_id,event_id,consumer) values (${b.businessId},${id},'test.isolation')`,
    );
    await tx.execute(sql`insert into idempotency_keys(business_id,app_instance_id,business_customer_id,operation,key,body_hash)
      values (${b.businessId},${b.instanceId},${b.customerScope.businessCustomerId},'test.isolation','ilk',${"a".repeat(64)})`);
  });
  const cases = [
    {
      read: sql`select * from outbox_events where id=${id}`,
      update: sql`update outbox_events set attempts=1 where id=${id}`,
      remove: sql`delete from outbox_events where id=${id}`,
      insert: sql`insert into outbox_events(business_id,aggregate_id,sequence,type,payload) values (${b.businessId},${randomUUID()},1,'test.foreign','{}')`,
    },
    {
      read: sql`select * from event_deliveries where event_id=${id}`,
      update: sql`update event_deliveries set consumer='test.changed' where event_id=${id}`,
      remove: sql`delete from event_deliveries where event_id=${id}`,
      insert: sql`insert into event_deliveries(business_id,event_id,consumer) values (${b.businessId},${id},'test.foreign')`,
    },
    {
      read: sql`select * from idempotency_keys where business_id=${b.businessId}`,
      update: sql`update idempotency_keys set response_status=200,response_body='{}' where business_id=${b.businessId}`,
      remove: sql`delete from idempotency_keys where business_id=${b.businessId}`,
      insert: sql`insert into idempotency_keys(business_id,app_instance_id,business_customer_id,operation,key,body_hash) values (${b.businessId},${b.instanceId},${b.customerScope.businessCustomerId},'test.isolation','ikinci',${"a".repeat(64)})`,
    },
  ];
  for (const entry of cases) {
    expect(await scoped(app.db, b.businessId, (tx) => tx.many(entry.read))).toHaveLength(1);
    expect(await app.db.many(entry.read)).toEqual([]);
    expect(await app.migrationDb.many(entry.read)).toEqual([]);
    await scoped(app.db, a.businessId, async (tx) => {
      expect(await tx.many(entry.read)).toEqual([]);
      expect(await tx.execute(entry.update)).toBe(0);
      expect(await tx.execute(entry.remove)).toBe(0);
    });
    await expect(
      scoped(app.db, a.businessId, (tx) => tx.execute(entry.insert)),
    ).rejects.toMatchObject({ code: "42501" });
  }
  for (const query of [
    sql`insert into event_deliveries(business_id,event_id,consumer) values (${a.businessId},${id},'test.foreign')`,
    sql`insert into idempotency_keys(business_id,app_instance_id,business_customer_id,operation,key,body_hash) values (${a.businessId},${b.instanceId},${a.customerScope.businessCustomerId},'test.isolation','a',${"a".repeat(64)})`,
    sql`insert into idempotency_keys(business_id,app_instance_id,business_customer_id,operation,key,body_hash) values (${a.businessId},${a.instanceId},${b.customerScope.businessCustomerId},'test.isolation','b',${"a".repeat(64)})`,
  ])
    await expect(scoped(app.db, a.businessId, (tx) => tx.execute(query))).rejects.toMatchObject({
      code: "23503",
    });
  await expect(app.db.many(sql`select * from platform_outbox_events`)).rejects.toMatchObject({
    code: "42501",
  });
  await expect(
    app.db.execute(
      sql`insert into platform_event_deliveries(event_id,consumer) values (${id},'test.forged')`,
    ),
  ).rejects.toMatchObject({ code: "42501" });
});
