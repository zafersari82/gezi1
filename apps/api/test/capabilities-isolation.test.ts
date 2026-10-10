import { afterAll, beforeAll, expect, test } from "vitest";

import { sql } from "../src/core/database";
import {
  compileOrderWorkflow,
  PREPARATION_MANIFEST,
} from "../src/modules/capabilities/capabilities.registry";
import { startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

test("paket ayarı zorunlu RLS/FORCE ve bileşik uygulama bağı kullanır", async () => {
  const a = await createTenantFixture(app);
  const b = await createTenantFixture(app);
  await scoped(app.db, b.businessId, (tx) =>
    tx.execute(
      sql`insert into app_instance_capabilities(business_id,app_instance_id,capability_id,version,enabled) values(${b.businessId},${b.instanceId},'ordering.preparation','1.0.0',true)`,
    ),
  );
  expect(
    await scoped(app.db, b.businessId, (tx) =>
      tx.many(sql`select * from app_instance_capabilities`),
    ),
  ).toHaveLength(1);
  expect(await app.db.many(sql`select * from app_instance_capabilities`)).toEqual([]);
  expect(await app.migrationDb.many(sql`select * from app_instance_capabilities`)).toEqual([]);
  await scoped(app.db, a.businessId, async (tx) => {
    expect(
      await tx.many(sql`select * from app_instance_capabilities where business_id=${b.businessId}`),
    ).toEqual([]);
    expect(
      await tx.execute(
        sql`update app_instance_capabilities set enabled=false where business_id=${b.businessId}`,
      ),
    ).toBe(0);
    expect(
      await tx.execute(
        sql`delete from app_instance_capabilities where business_id=${b.businessId}`,
      ),
    ).toBe(0);
  });
  await expect(
    scoped(app.db, a.businessId, (tx) =>
      tx.execute(
        sql`insert into app_instance_capabilities(business_id,app_instance_id,capability_id,version) values(${a.businessId},${b.instanceId},'ordering.preparation','1.0.0')`,
      ),
    ),
  ).rejects.toMatchObject({ code: "23503" });
  const metadata = await app.db.one(
    sql`select c.relrowsecurity,c.relforcerowsecurity,p.qual,p.with_check from pg_class c join pg_policies p on p.tablename=c.relname where c.relname='app_instance_capabilities' and p.schemaname='public'`,
  );
  expect(metadata).toMatchObject({
    relrowsecurity: true,
    relforcerowsecurity: true,
    qual: "(business_id = (NULLIF(current_setting('vado.business_id'::text, true), ''::text))::uuid)",
    with_check:
      "(business_id = (NULLIF(current_setting('vado.business_id'::text, true), ''::text))::uuid)",
  });
});

test("SQL ve manifest aynı hazırlık akışını korur; keyfi grafik reddedilir", async () => {
  const compiled = compileOrderWorkflow([PREPARATION_MANIFEST]);
  const stored = await app.db.one<{
    graph: Record<string, string[]>;
    allowed: boolean;
  }>(sql`select ordering_compile_graph('["ordering.preparation@1.0.0"]'::jsonb, null) as graph,
    ordering_graph_allowed(${JSON.stringify(compiled.graph)}::jsonb,'["ordering.preparation@1.0.0"]'::jsonb, null) as allowed`);
  expect(stored).toEqual({ graph: compiled.graph, allowed: true });
  const wrong = { ...compiled.graph, completed: ["placed"] };
  expect(
    await app.db.one(
      sql`select ordering_graph_allowed(${JSON.stringify(wrong)}::jsonb,'["ordering.preparation@1.0.0"]'::jsonb, null) as allowed`,
    ),
  ).toEqual({ allowed: false });
});

test("SQL de keyfi paket, sürüm ve çalıştırılabilir ayar kabul etmez", async () => {
  const f = await createTenantFixture(app);
  for (const [id, version, config] of [
    ["harici.kod", "1.0.0", { stationLabel: "Hazırlık" }],
    ["ordering.preparation", "9.0.0", { stationLabel: "Hazırlık" }],
    ["ordering.preparation", "1.0.0", { stationLabel: "Hazırlık", execute: "process.exit()" }],
  ]) {
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(
          sql`insert into app_instance_capabilities(business_id,app_instance_id,capability_id,version,config) values(${f.businessId},${f.instanceId},${id},${version},${JSON.stringify(config)}::jsonb)`,
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  }
});
