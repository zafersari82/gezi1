import { sql, type SqlFragment } from "../../core/database";
import type { TenantScope } from "../../core/tenant-scope";

/** Read and write permissions are resolved against current branch-to-region assignments.
 * A product-availability grant cannot reveal or modify orders. */
export function orderAccess(scope: TenantScope, branch: SqlFragment, manage = false): SqlFragment {
  if (scope.role === "owner" || scope.role === "manager") return sql.empty;
  if (scope.role !== "staff") return sql.empty; // Customers/devices use their own separate constraints.
  const mayManageDirect = manage ? sql`and bg.can_manage` : sql.empty;
  const mayManageRegion = manage ? sql`and rg.can_manage` : sql.empty;
  return sql`and (
    exists (select 1 from business_branch_order_grants bg
      join branches b on b.business_id=bg.business_id and b.id=bg.branch_id and b.active
      where bg.business_id=${scope.businessId} and bg.user_id=${scope.userId}
        and bg.branch_id=${branch} ${mayManageDirect})
    or exists (select 1 from business_region_order_grants rg
      join business_region_branches rb
        on rb.business_id=rg.business_id and rb.region_id=rg.region_id
      join branches b on b.business_id=rb.business_id and b.id=rb.branch_id and b.active
      where rg.business_id=${scope.businessId} and rg.user_id=${scope.userId}
        and rb.branch_id=${branch} ${mayManageRegion})
  )`;
}
