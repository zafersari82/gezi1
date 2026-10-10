import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { TenantScope } from "../../core/tenant-scope";

/** Centralised staff access. A region never expands into business-wide manager rights. */
export async function availableBranchIds(tx: Database, scope: TenantScope): Promise<string[]> {
  const branches = await tx.many<{ id: string }>(sql`
    select b.id from branches b where b.business_id=${scope.businessId} and b.active
      and (${scope.role !== "staff"} or exists (
        select 1 from branch_availability_grants g
        where g.business_id=b.business_id and g.branch_id=b.id and g.user_id=${scope.userId}
      ) or exists (
        select 1 from business_region_branches rb
        join business_region_operators ro
          on ro.business_id=rb.business_id and ro.region_id=rb.region_id
        where rb.business_id=b.business_id and rb.branch_id=b.id and ro.user_id=${scope.userId}
      ))
    order by b.name,b.id
  `);
  return branches.map((branch) => branch.id);
}
/** Reads are scoped too; staff must not inspect unrelated branch schedules or operations. */
export async function requireBranchOperator(tx: Database, scope: TenantScope, branchId: string): Promise<void> {
  if (scope.role === "owner" || scope.role === "manager") return;
  if (scope.role !== "staff") throw new AppError("forbidden");
  const direct = await tx.maybeOne(sql`
    select 1 from branch_availability_grants g
    join business_members m on m.business_id=g.business_id and m.user_id=g.user_id
    where g.business_id=${scope.businessId} and g.branch_id=${branchId}
      and g.user_id=${scope.userId} and m.active and m.role='staff' for share of g,m
  `);
  if (direct !== null) return;
  const regional = await tx.maybeOne(sql`
    select 1 from business_region_branches rb
    join business_region_operators ro
      on ro.business_id=rb.business_id and ro.region_id=rb.region_id
    join business_members m on m.business_id=ro.business_id and m.user_id=ro.user_id
    where rb.business_id=${scope.businessId} and rb.branch_id=${branchId}
      and ro.user_id=${scope.userId} and m.active and m.role='staff'
    for share of rb,ro,m
  `);
  if (regional === null) throw new AppError("forbidden");
}
