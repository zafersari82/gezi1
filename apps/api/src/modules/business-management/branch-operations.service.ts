import type {
  BranchAvailabilityBatchBody,
  BranchAvailabilityGrantBody,
  BranchHoursExceptionBody,
  BranchOrderingSettingsBody,
  ItemAvailabilityBody,
  MenuWindowsBody,
} from "@vado/contracts";

import type { TenantContext } from "../../core/context";
import { recordAudit } from "../../core/audit";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import { availableBranchIds, requireBranchOperator } from "./branch-access";

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
      await requireBranchOperator(tx, scope, branchId);
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
      await requireBranchOperator(tx, scope, branchId);
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
  function accessibleBranches(scope: TenantScope) {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => ({ items: await availableBranchIds(tx, scope) }));
  }
  function grants(scope: TenantScope, branchId: string) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      if ((await tx.maybeOne(sql`select 1 from branches where business_id=${scope.businessId} and id=${branchId}`)) === null)
        throw new AppError("not_found");
      return { items: await tx.many(sql`
        select m.user_id as "userId",coalesce(nullif(u.display_name,''),nullif(u.username,''),'Personel') as "displayName",
          (g.user_id is not null) as allowed
        from business_members m join users u on u.id=m.user_id
        left join branch_availability_grants g on g.business_id=m.business_id
          and g.branch_id=${branchId} and g.user_id=m.user_id
        where m.business_id=${scope.businessId} and m.role='staff' and m.active and u.status='active'
        order by "displayName",m.user_id
      `) };
    });
  }
  function saveGrant(scope: TenantScope, branchId: string, body: BranchAvailabilityGrantBody) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      await lockBranch(tx, scope, branchId);
      if ((await tx.maybeOne(sql`
        select 1 from business_members m join users u on u.id=m.user_id
        where m.business_id=${scope.businessId} and m.user_id=${body.userId}
          and m.role='staff' and m.active and u.status='active' for share of m,u
      `)) === null) throw new AppError("not_found");
      if (body.allowed) await tx.execute(sql`
        insert into branch_availability_grants(business_id,branch_id,user_id)
        values(${scope.businessId},${branchId},${body.userId}) on conflict do nothing
      `);
      else await tx.execute(sql`
        delete from branch_availability_grants where business_id=${scope.businessId}
          and branch_id=${branchId} and user_id=${body.userId}
      `);
      await recordAudit(tx, {
        actor: scope.userId,
        action: "branches.availability_grant_changed",
        targetType: "branch",
        targetId: branchId,
        metadata: { businessId: scope.businessId, memberUserId: body.userId, allowed: body.allowed },
      });
      return { userId: body.userId, allowed: body.allowed };
    });
  }
  function availability(scope: TenantScope, branchId: string) {
    return withTenant(db, scope, async (tx) => {
      if ((await tx.maybeOne(sql`select 1 from branches where business_id=${scope.businessId} and id=${branchId}`)) === null)
        throw new AppError("not_found");
      await requireBranchOperator(tx, scope, branchId);
      return { items: await tx.many(sql`
        select item_id as "itemId",available,version from catalog_branch_availability
        where business_id=${scope.businessId} and branch_id=${branchId} order by item_id
      `) };
    });
  }
  function saveAvailability(scope: TenantScope, itemId: string, body: ItemAvailabilityBody) {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      await lockBranch(tx, scope, body.branchId);
      await requireBranchOperator(tx, scope, body.branchId);
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
  /** Deterministic branch -> item locking; any mismatch rolls back the complete batch. */
  function saveAvailabilityBatch(scope: TenantScope, body: BranchAvailabilityBatchBody) {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      await lockBranch(tx, scope, body.branchId);
      await requireBranchOperator(tx, scope, body.branchId);
      const sorted = [...body.changes].sort((a, b) => a.itemId.localeCompare(b.itemId, "en"));
      for (const change of sorted) {
        if ((await tx.maybeOne(sql`
          select 1 from catalog_items where business_id=${scope.businessId}
            and id=${change.itemId} for update
        `)) === null) throw new AppError("not_found");
        const existing = await tx.maybeOne<{ version: number; available: boolean }>(sql`
          select version,available from catalog_branch_availability
          where business_id=${scope.businessId} and branch_id=${body.branchId}
            and item_id=${change.itemId}
        `);
        if ((existing?.version ?? 0) !== change.expectedVersion)
          throw new AppError("settings_version_conflict");
        if (existing === null) {
          await tx.execute(sql`
            insert into catalog_branch_availability(business_id,branch_id,item_id,available)
            values(${scope.businessId},${body.branchId},${change.itemId},${change.available})
          `);
        } else if (existing.available !== change.available) {
          await tx.execute(sql`
            update catalog_branch_availability set available=${change.available}
            where business_id=${scope.businessId} and branch_id=${body.branchId}
              and item_id=${change.itemId}
          `);
        }
      }
      await recordAudit(tx, {
        actor: scope.userId,
        action: "branches.availability_batch_updated",
        targetType: "branch",
        targetId: body.branchId,
        metadata: { businessId: scope.businessId, count: sorted.length },
      });
      return { updated: sorted.length };
    });
  }
  function menuWindows(
    scope: TenantScope,
    branchId: string,
    id: string,
    kind: "item" | "category",
  ) {
    return withTenant(db, scope, async (tx) => {
      await requireBranchOperator(tx, scope, branchId);
      return readWindows(tx, scope, branchId, id, kind);
    });
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
    saveAvailabilityBatch,
    accessibleBranches,
    grants,
    saveGrant,
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
