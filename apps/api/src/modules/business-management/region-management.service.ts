import type {
  BusinessRegion,
  BusinessRegionAssignment,
  BusinessRegionOperatorBody,
  OrderGrantBody,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { TenantContext } from "../../core/context";
import { isUniqueViolation, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";

interface RegionRow {
  id: string;
  name: string;
  version: number;
}
/** A region groups branches but never implicitly gives access to business-wide APIs. */
export function createRegionManagementService({ db }: TenantContext) {
  function regions(scope: TenantScope) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => ({
      items: await tx.many<RegionRow>(sql`
        select id,name,version from business_regions
        where business_id=${scope.businessId} order by name,id
      `),
    }));
  }
  async function createRegion(scope: TenantScope, name: string): Promise<BusinessRegion> {
    requireBusinessRole(scope, ["owner"]);
    try {
      return await withTenant(db, scope, async (tx) => {
        const row = await tx.one<RegionRow>(sql`
          insert into business_regions(business_id,name)
          values(${scope.businessId},${name}) returning id,name,version
        `);
        await recordAudit(tx, { actor: scope.userId, action: "regions.created",
          targetType: "region", targetId: row.id, metadata: { businessId: scope.businessId } });
        return row;
      });
    } catch (cause) {
      if (isUniqueViolation(cause)) throw new AppError("validation_failed");
      throw cause;
    }
  }
  async function renameRegion(scope: TenantScope, regionId: string, name: string, expectedVersion: number): Promise<BusinessRegion> {
    requireBusinessRole(scope, ["owner"]);
    try {
      return await withTenant(db, scope, async (tx) => {
        const existing = await tx.maybeOne<RegionRow>(sql`
          select id,name,version from business_regions
          where business_id=${scope.businessId} and id=${regionId} for update
        `);
        if (existing === null) throw new AppError("not_found");
        if (existing.version !== expectedVersion) throw new AppError("record_version_conflict");
        const result = await tx.one<RegionRow>(sql`
          update business_regions set name=${name},version=version+1
          where business_id=${scope.businessId} and id=${regionId}
          returning id,name,version
        `);
        await recordAudit(tx, { actor: scope.userId, action: "regions.renamed",
          targetType: "region", targetId: regionId, metadata: { businessId: scope.businessId } });
        return result;
      });
    } catch (cause) {
      if (isUniqueViolation(cause)) throw new AppError("validation_failed");
      throw cause;
    }
  }
  function assignments(scope: TenantScope) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => ({
      items: await tx.many<{ branchId: string; regionId: string | null }>(sql`
        select b.id as "branchId",a.region_id as "regionId"
        from branches b left join business_region_branches a
          on a.business_id=b.business_id and a.branch_id=b.id
        where b.business_id=${scope.businessId} order by b.name,b.id
      `),
    }));
  }
  function assignBranch(scope: TenantScope, branchId: string, body: BusinessRegionAssignment) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      // The branch lock serializes conflicting assignments from separate devices.
      if ((await tx.maybeOne(sql`
        select id from branches where business_id=${scope.businessId} and id=${branchId} for update
      `)) === null) throw new AppError("not_found");
      const existing = await tx.maybeOne<{ region_id: string }>(sql`
        select region_id from business_region_branches
        where business_id=${scope.businessId} and branch_id=${branchId}
      `);
      const previous = existing?.region_id ?? null;
      if (previous !== body.expectedRegionId) throw new AppError("record_version_conflict");
      if (body.regionId !== null) {
        if ((await tx.maybeOne(sql`
          select id from business_regions
          where business_id=${scope.businessId} and id=${body.regionId} for key share
        `)) === null) throw new AppError("not_found");
        await tx.execute(sql`
          insert into business_region_branches(business_id,branch_id,region_id)
          values(${scope.businessId},${branchId},${body.regionId})
          on conflict(business_id,branch_id) do update set region_id=excluded.region_id
        `);
      } else if (previous !== null) {
        await tx.execute(sql`
          delete from business_region_branches
          where business_id=${scope.businessId} and branch_id=${branchId}
        `);
      }
      await recordAudit(tx, { actor: scope.userId, action: "regions.branch_assigned",
        targetType: "branch", targetId: branchId,
        metadata: { businessId: scope.businessId, previous, regionId: body.regionId } });
      return { branchId, regionId: body.regionId };
    });
  }
  function operators(scope: TenantScope, regionId: string) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      if ((await tx.maybeOne(sql`
        select id from business_regions where business_id=${scope.businessId} and id=${regionId}
      `)) === null) throw new AppError("not_found");
      return { items: await tx.many<{ userId: string; displayName: string; allowed: boolean }>(sql`
        select m.user_id as "userId",
          coalesce(nullif(u.display_name,''),nullif(u.username,''),'Personel') as "displayName",
          (g.user_id is not null) as allowed
        from business_members m join users u on u.id=m.user_id
        left join business_region_operators g
          on g.business_id=m.business_id and g.region_id=${regionId} and g.user_id=m.user_id
        where m.business_id=${scope.businessId} and m.role='staff'
          and m.active and u.status='active'
        order by "displayName",m.user_id
      `) };
    });
  }
  function saveOperator(scope: TenantScope, regionId: string, body: BusinessRegionOperatorBody) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      if ((await tx.maybeOne(sql`
        select id from business_regions where business_id=${scope.businessId} and id=${regionId} for update
      `)) === null) throw new AppError("not_found");
      if ((await tx.maybeOne(sql`
        select 1 from business_members m join users u on u.id=m.user_id
        where m.business_id=${scope.businessId} and m.user_id=${body.userId}
          and m.active and m.role='staff' and u.status='active' for share of m,u
      `)) === null) throw new AppError("not_found");
      if (body.allowed) await tx.execute(sql`
        insert into business_region_operators(business_id,region_id,user_id)
        values(${scope.businessId},${regionId},${body.userId}) on conflict do nothing
      `);
      else await tx.execute(sql`
        delete from business_region_operators where business_id=${scope.businessId}
          and region_id=${regionId} and user_id=${body.userId}
      `);
      await recordAudit(tx, { actor: scope.userId, action: "regions.operator_changed",
        targetType: "region", targetId: regionId,
        metadata: { businessId: scope.businessId, userId: body.userId, allowed: body.allowed } });
      return { userId: body.userId, allowed: body.allowed };
    });
  }
  /** Owner-managed order rights. A staff member is NEVER promoted to global manager. */
  function orderGrants(scope: TenantScope, kind: "branch" | "region", id: string) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      const target = kind === "branch"
        ? await tx.maybeOne(sql`select 1 from branches where business_id=${scope.businessId} and id=${id}`)
        : await tx.maybeOne(sql`select 1 from business_regions where business_id=${scope.businessId} and id=${id}`);
      if (target === null) throw new AppError("not_found");
      const rows = kind === "branch"
        ? await tx.many<{ userId: string; displayName: string; access: string }>(sql`
          select m.user_id as "userId",coalesce(nullif(u.display_name,''),nullif(u.username,''),'Personel') as "displayName",
            case when g.user_id is null then 'none' when g.can_manage then 'manage' else 'view' end as access
          from business_members m join users u on u.id=m.user_id
          left join business_branch_order_grants g on g.business_id=m.business_id
            and g.branch_id=${id} and g.user_id=m.user_id
          where m.business_id=${scope.businessId} and m.active and m.role='staff' and u.status='active'
          order by "displayName",m.user_id`)
        : await tx.many<{ userId: string; displayName: string; access: string }>(sql`
          select m.user_id as "userId",coalesce(nullif(u.display_name,''),nullif(u.username,''),'Personel') as "displayName",
            case when g.user_id is null then 'none' when g.can_manage then 'manage' else 'view' end as access
          from business_members m join users u on u.id=m.user_id
          left join business_region_order_grants g on g.business_id=m.business_id
            and g.region_id=${id} and g.user_id=m.user_id
          where m.business_id=${scope.businessId} and m.active and m.role='staff' and u.status='active'
          order by "displayName",m.user_id`);
      return { items: rows };
    });
  }
  function saveOrderGrant(scope: TenantScope, kind: "branch" | "region", id: string, body: OrderGrantBody) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      // Lock target first so branch reassignment/deletion cannot race a permission change.
      const target = kind === "branch"
        ? await tx.maybeOne(sql`select 1 from branches where business_id=${scope.businessId} and id=${id} for update`)
        : await tx.maybeOne(sql`select 1 from business_regions where business_id=${scope.businessId} and id=${id} for update`);
      if (target === null) throw new AppError("not_found");
      const member = await tx.maybeOne(sql`
        select 1 from business_members m join users u on u.id=m.user_id
        where m.business_id=${scope.businessId} and m.user_id=${body.userId}
          and m.active and m.role='staff' and u.status='active' for share of m,u`);
      if (member === null) throw new AppError("not_found");
      if (kind === "branch") {
        if (body.access === "none") await tx.execute(sql`
          delete from business_branch_order_grants
          where business_id=${scope.businessId} and branch_id=${id} and user_id=${body.userId}`);
        else await tx.execute(sql`
          insert into business_branch_order_grants(business_id,branch_id,user_id,can_manage)
          values(${scope.businessId},${id},${body.userId},${body.access === "manage"})
          on conflict (business_id,branch_id,user_id) do update set can_manage=excluded.can_manage`);
      } else {
        if (body.access === "none") await tx.execute(sql`
          delete from business_region_order_grants
          where business_id=${scope.businessId} and region_id=${id} and user_id=${body.userId}`);
        else await tx.execute(sql`
          insert into business_region_order_grants(business_id,region_id,user_id,can_manage)
          values(${scope.businessId},${id},${body.userId},${body.access === "manage"})
          on conflict (business_id,region_id,user_id) do update set can_manage=excluded.can_manage`);
      }
      await recordAudit(tx, { actor: scope.userId, action: "orders.permission_changed",
        targetType: kind, targetId: id, metadata: { businessId: scope.businessId,
          userId: body.userId, access: body.access } });
      return { userId: body.userId, access: body.access };
    });
  }
  return { regions, createRegion, renameRegion, assignments, assignBranch, operators, saveOperator,
    orderGrants, saveOrderGrant };
}
