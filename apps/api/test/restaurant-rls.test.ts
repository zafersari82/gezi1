import { afterAll, beforeAll, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { startTestApp, type TestApp } from "./support/harness";
let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});
it("2.7 işletme tabloları zorunlu RLS ve hem okuma hem yazma kapsamı taşır", async () => {
  const names = [
    "branch_ordering_settings",
    "branch_hours_exceptions",
    "catalog_branch_availability",
    "catalog_menu_revisions",
    "catalog_menu_windows",
    "restaurant_tables",
    "table_sessions",
    "table_session_members",
    "table_service_requests",
    "order_payments",
    "kitchen_devices",
    "kitchen_socket_tickets",
    "business_live_offsets",
    "business_live_events",
  ];
  const rows = await app.db.many<{
    name: string;
    enabled: boolean;
    forced: boolean;
    guarded: boolean;
  }>(
    sql`select c.relname as name,c.relrowsecurity as enabled,c.relforcerowsecurity as forced,exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname and p.qual like '%vado.business_id%' and p.with_check like '%vado.business_id%') as guarded from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(${names}::text[]) order by c.relname`,
  );
  expect(rows).toHaveLength(names.length);
  for (const row of rows)
    expect(row).toEqual({ name: row.name, enabled: true, forced: true, guarded: true });
});
