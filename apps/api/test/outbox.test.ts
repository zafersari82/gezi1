import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

describe("İşlemsel olay ve tekrar koruması temeli", () => {
  test("olayla iş kaydı birlikte geri alınır", async () => {
    const f = await createTenantFixture(app);
    const eventId = randomUUID();
    await expect(
      scoped(app.db, f.businessId, async (tx) => {
        await tx.execute(
          sql`update branches set address = 'Geri alınacak adres' where id = ${f.branchId}`,
        );
        await tx.execute(sql`
        insert into outbox_events(id, business_id, aggregate_id, sequence, type, payload)
        values (${eventId}, ${f.businessId}, ${f.branchId}, 1, 'branch.changed', '{}'::jsonb)
      `);
        throw new Error("İşlem geri alınsın");
      }),
    ).rejects.toThrow("İşlem geri alınsın");
    expect(
      await scoped(app.db, f.businessId, (tx) =>
        tx.many(sql`select * from outbox_events where id = ${eventId}`),
      ),
    ).toEqual([]);
    const branch = await scoped(app.db, f.businessId, (tx) =>
      tx.one(sql`select address from branches where id = ${f.branchId}`),
    );
    expect(branch).toMatchObject({ address: "" });
  });

  test("üç işletme tablosunda kapsamsız erişim yoktur ve FORCE zorunludur", async () => {
    expect(await app.db.many(sql`select * from outbox_events`)).toEqual([]);
    expect(await app.db.many(sql`select * from event_deliveries`)).toEqual([]);
    expect(await app.db.many(sql`select * from idempotency_keys`)).toEqual([]);
    const rows = await app.db.many(sql`
      select relrowsecurity, relforcerowsecurity from pg_class where relnamespace = 'public'::regnamespace
        and relname in ('outbox_events', 'event_deliveries', 'idempotency_keys')
    `);
    expect(rows).toHaveLength(3);
    for (const row of rows)
      expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
  });
});
