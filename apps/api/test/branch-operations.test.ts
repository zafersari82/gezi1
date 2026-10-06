import { branchOrderingSettingsSchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { as, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

describe("Şube operasyonunun kalıcı saat ve hazırlık ayarları", () => {
  it("hazırlık ayarını beklenen sürümle kaydeder ve eski sürümü reddeder", async () => {
    const f = await createTenantFixture(app);
    const path = `/v1/business/${f.businessId}/branches/${f.branchId}/ordering-settings`;
    const client = as(app, f.owner);
    const initial = await client.ok(branchOrderingSettingsSchema, "GET", path);
    expect(initial).toMatchObject({ preparationMinutes: 20, version: 0 });
    const saved = await client.ok(branchOrderingSettingsSchema, "PUT", path, {
      body: { expectedVersion: 0, preparationMinutes: 30, slotMinutes: 15, advanceDays: 7 },
    });
    expect(saved).toMatchObject({ preparationMinutes: 30, version: 1 });
    const old = await client.request("PUT", path, {
      body: { expectedVersion: 0, preparationMinutes: 1 },
    });
    expect(old).toMatchObject({
      status: 409,
      body: { error: { code: "settings_version_conflict" } },
    });
  });
  it("tarihli kapanış önceki günün geceye taşan saatinden bağımsızdır", async () => {
    const f = await createTenantFixture(app);
    await app.services.businessManagement.setHours(f.scope, f.branchId, {
      hours: [
        { weekday: 2, opensAt: 1320, closesAt: 1560 },
        { weekday: 3, opensAt: 600, closesAt: 1200 },
      ],
    });
    const client = as(app, f.owner);
    const path = `/v1/business/${f.businessId}/branches/${f.branchId}/hours-exceptions`;
    expect(
      await client.request("PUT", path, {
        body: { expectedVersion: 0, date: "2026-10-07", hours: [] },
      }),
    ).toMatchObject({ status: 200 });
    const rows = await scoped(app.db, f.businessId, async (tx) => {
      return tx.many<{ open: boolean }>(
        sql`select branch_is_open(${f.businessId},${f.branchId},instant) as open from unnest(array['2026-10-06T23:30:00+03:00','2026-10-07T01:00:00+03:00','2026-10-07T11:00:00+03:00']::timestamptz[]) instant`,
      );
    });
    expect(rows.map((row) => row.open)).toEqual([true, true, false]);
  });
  it("doğrudan SQL sıfır hazırlık süresini ve işletmeler arası şube bağını reddeder", async () => {
    const a = await createTenantFixture(app);
    const b = await createTenantFixture(app);
    await expect(
      scoped(app.db, a.businessId, (tx) =>
        tx.execute(
          sql`insert into branch_ordering_settings(business_id,branch_id,preparation_minutes) values(${a.businessId},${a.branchId},0)`,
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      scoped(app.db, a.businessId, (tx) =>
        tx.execute(
          sql`insert into branch_ordering_settings(business_id,branch_id,preparation_minutes) values(${a.businessId},${b.branchId},20)`,
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("yeni işletme tabloları kapsamsız okuma ve yabancı erişime kapalıdır", async () => {
    const f = await createTenantFixture(app);
    await as(app, f.owner).request(
      "PUT",
      `/v1/business/${f.businessId}/branches/${f.branchId}/ordering-settings`,
      { body: { expectedVersion: 0, preparationMinutes: 20 } },
    );
    expect(await app.db.many(sql`select * from branch_ordering_settings`)).toEqual([]);
    const foreign = await createTenantFixture(app);
    expect(
      await scoped(app.db, foreign.businessId, (tx) =>
        tx.many(sql`select * from branch_ordering_settings where business_id=${f.businessId}`),
      ),
    ).toEqual([]);
    const flags = await app.migrationDb.many<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      sql`select relrowsecurity,relforcerowsecurity from pg_class where relname in ('branch_ordering_settings','branch_hours_exceptions','catalog_branch_availability','catalog_menu_windows')`,
    );
    expect(flags).toHaveLength(4);
    expect(flags.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });
});
