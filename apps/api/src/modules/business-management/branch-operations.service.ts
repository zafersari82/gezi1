import type {
  BranchHoursExceptionBody,
  BranchOrderingSettingsBody,
  ItemAvailabilityBody,
  MenuWindowsBody,
} from "@vado/contracts";

import type { TenantContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";

const MANAGERS = ["owner", "manager"] as const;
interface SettingsRow {
  preparation_minutes: number;
  slot_minutes: number;
  advance_days: number;
  version: number;
}
function settingsView(scope: TenantScope, branchId: string, row: SettingsRow | null) {
  return {
    businessId: scope.businessId,
    branchId,
    preparationMinutes: row?.preparation_minutes ?? 20,
    slotMinutes: row?.slot_minutes ?? 15,
    advanceDays: row?.advance_days ?? 7,
    version: row?.version ?? 0,
  };
}
async function lockBranch(tx: Database, scope: TenantScope, branchId: string) {
  const branch = await tx.maybeOne(
    sql`select 1 from branches where business_id=${scope.businessId} and id=${branchId} for update`,
  );
  if (branch === null) throw new AppError("not_found");
}
export function createBranchOperationsService({ db }: TenantContext) {
  function settings(scope: TenantScope, branchId: string) {
    return withTenant(db, scope, async (tx) => {
      const branch = await tx.maybeOne(
        sql`select 1 from branches where business_id=${scope.businessId} and id=${branchId}`,
      );
      if (branch === null) throw new AppError("not_found");
      return settingsView(
        scope,
        branchId,
        await tx.maybeOne<SettingsRow>(
          sql`select * from branch_ordering_settings where business_id=${scope.businessId} and branch_id=${branchId}`,
        ),
      );
    });
  }
  function saveSettings(scope: TenantScope, branchId: string, body: BranchOrderingSettingsBody) {
    requireBusinessRole(scope, MANAGERS);
    return withTenant(db, scope, async (tx) => {
      await lockBranch(tx, scope, branchId);
      const previous = await tx.maybeOne<SettingsRow>(
        sql`select * from branch_ordering_settings where business_id=${scope.businessId} and branch_id=${branchId}`,
      );
      if ((previous?.version ?? 0) !== body.expectedVersion)
        throw new AppError("settings_version_conflict");
      const row =
        await tx.one<SettingsRow>(sql`insert into branch_ordering_settings(business_id,branch_id,preparation_minutes,slot_minutes,advance_days)
        values(${scope.businessId},${branchId},${body.preparationMinutes},${body.slotMinutes},${body.advanceDays})
        on conflict(business_id,branch_id) do update set preparation_minutes=excluded.preparation_minutes,slot_minutes=excluded.slot_minutes,advance_days=excluded.advance_days returning *`);
      return settingsView(scope, branchId, row);
    });
  }
  function exceptions(scope: TenantScope, branchId: string) {
    return withTenant(db, scope, async (tx) => {
      const rows = await tx.many<{
        date: Date;
        hours: BranchHoursExceptionBody["hours"];
        version: number;
      }>(sql`
        select date::text as date,hours,version from branch_hours_exceptions where business_id=${scope.businessId} and branch_id=${branchId} order by date`);
      return { items: rows };
    });
  }
  function saveException(scope: TenantScope, branchId: string, body: BranchHoursExceptionBody) {
    requireBusinessRole(scope, MANAGERS);
    return withTenant(db, scope, async (tx) => {
      await lockBranch(tx, scope, branchId);
      const previous = await tx.maybeOne<{ version: number }>(
        sql`select version from branch_hours_exceptions where business_id=${scope.businessId} and branch_id=${branchId} and date=${body.date}`,
      );
      if ((previous?.version ?? 0) !== body.expectedVersion)
        throw new AppError("settings_version_conflict");
      return tx.one(sql`insert into branch_hours_exceptions(business_id,branch_id,date,hours) values(${scope.businessId},${branchId},${body.date},${JSON.stringify(body.hours)}::jsonb)
        on conflict(business_id,branch_id,date) do update set hours=excluded.hours returning date::text,hours,version`);
    });
  }
  function availability(scope: TenantScope, branchId: string) {
    return withTenant(db, scope, async (tx) => ({
      items: await tx.many(
        sql`select item_id as "itemId",available,version from catalog_branch_availability where business_id=${scope.businessId} and branch_id=${branchId} order by item_id`,
      ),
    }));
  }
  function saveAvailability(scope: TenantScope, itemId: string, body: ItemAvailabilityBody) {
    requireBusinessRole(scope, MANAGERS);
    return withTenant(db, scope, async (tx) => {
      await lockBranch(tx, scope, body.branchId);
      if (
        (await tx.maybeOne(
          sql`select 1 from catalog_items where business_id=${scope.businessId} and id=${itemId} for update`,
        )) === null
      )
        throw new AppError("not_found");
      const previous = await tx.maybeOne<{ version: number }>(
        sql`select version from catalog_branch_availability where business_id=${scope.businessId} and branch_id=${body.branchId} and item_id=${itemId}`,
      );
      if ((previous?.version ?? 0) !== body.expectedVersion)
        throw new AppError("settings_version_conflict");
      return tx.one(sql`insert into catalog_branch_availability(business_id,branch_id,item_id,available) values(${scope.businessId},${body.branchId},${itemId},${body.available})
        on conflict(business_id,branch_id,item_id) do update set available=excluded.available returning item_id as "itemId",branch_id as "branchId",available,version`);
    });
  }
  function menuWindows(
    scope: TenantScope,
    branchId: string,
    id: string,
    kind: "item" | "category",
  ) {
    return withTenant(db, scope, (tx) => readWindows(tx, scope, branchId, id, kind));
  }
  function saveMenuWindows(
    scope: TenantScope,
    id: string,
    kind: "item" | "category",
    body: MenuWindowsBody,
  ) {
    requireBusinessRole(scope, MANAGERS);
    return withTenant(db, scope, async (tx) => {
      await lockBranch(tx, scope, body.branchId);
      const target =
        kind === "item"
          ? sql`select 1 from catalog_items where business_id=${scope.businessId} and id=${id} for update`
          : sql`select 1 from catalog_categories where business_id=${scope.businessId} and id=${id} for update`;
      if ((await tx.maybeOne(target)) === null) throw new AppError("not_found");
      const where = targetWhere(id, kind);
      const previous = await tx.maybeOne<{ id: string; version: number }>(
        sql`select id,version from catalog_menu_revisions where business_id=${scope.businessId} and branch_id=${body.branchId} and ${where}`,
      );
      if ((previous?.version ?? 0) !== body.expectedVersion)
        throw new AppError("settings_version_conflict");
      if (previous === null)
        await tx.execute(
          sql`insert into catalog_menu_revisions(business_id,branch_id,item_id,category_id) values(${scope.businessId},${body.branchId},${kind === "item" ? id : null},${kind === "category" ? id : null})`,
        );
      else
        await tx.execute(
          sql`update catalog_menu_revisions set version=version+1 where id=${previous.id} and business_id=${scope.businessId}`,
        );
      await tx.execute(
        sql`delete from catalog_menu_windows where business_id=${scope.businessId} and branch_id=${body.branchId} and ${where}`,
      );
      for (const window of body.windows)
        await tx.execute(sql`insert into catalog_menu_windows(business_id,branch_id,item_id,category_id,weekday,opens_at,closes_at)
        values(${scope.businessId},${body.branchId},${kind === "item" ? id : null},${kind === "category" ? id : null},${window.weekday},${window.opensAt},${window.closesAt})`);
      return readWindows(tx, scope, body.branchId, id, kind);
    });
  }
  return {
    settings,
    saveSettings,
    exceptions,
    saveException,
    availability,
    saveAvailability,
    menuWindows,
    saveMenuWindows,
  };
}
function targetWhere(id: string, kind: "item" | "category") {
  return kind === "item" ? sql`item_id=${id}` : sql`category_id=${id}`;
}
async function readWindows(
  tx: Database,
  scope: TenantScope,
  branchId: string,
  id: string,
  kind: "item" | "category",
) {
  const where = targetWhere(id, kind);
  const revision = await tx.maybeOne<{ version: number }>(
    sql`select version from catalog_menu_revisions where business_id=${scope.businessId} and branch_id=${branchId} and ${where}`,
  );
  const windows = await tx.many(
    sql`select weekday,opens_at as "opensAt",closes_at as "closesAt" from catalog_menu_windows where business_id=${scope.businessId} and branch_id=${branchId} and ${where} order by weekday,opens_at`,
  );
  return { branchId, version: revision?.version ?? 0, windows };
}
