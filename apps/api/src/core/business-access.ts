import type { BusinessPermission } from "@vado/contracts";

import { type Database, sql, type SqlFragment } from "./database";
import { AppError } from "./errors";
import type { TenantScope } from "./tenant-scope";

/**
 * İşletme içi yetkinin tek karar noktası. Kuralın kendisi veritabanındaki `tenant_member_can`
 * işlevindedir; TypeScript ve SQL aynı kuralı kullanır, ikinci bir kopya yazılmaz.
 *
 * Sahip ve yönetici her izne işletme genelinde sahiptir. Personel yalnız verilen izni, verildiği
 * kapsamda (işletme, bölge, şube) kullanır. Müşteri ve operasyon cihazı işletme izni taşımaz.
 */
function managesBusiness(scope: TenantScope): boolean {
  return scope.role === "owner" || scope.role === "manager";
}

/** İzin yoksa `forbidden`. Şube `null` ise yalnız işletme genelindeki izin sayılır. */
export async function authorize(
  tx: Database,
  scope: TenantScope,
  permission: BusinessPermission,
  branchId: string | null,
): Promise<void> {
  if (managesBusiness(scope)) return;
  if (scope.role !== "staff") throw new AppError("forbidden");
  const row = await tx.one<{ allowed: boolean }>(sql`
    select tenant_member_can(${scope.businessId}, ${permission}, ${branchId}::uuid) as allowed
  `);
  if (!row.allowed) throw new AppError("forbidden");
}

/**
 * Liste süzgeci: personel yalnız izinli şubelerin satırlarını görür. `branch`, sorgudaki şube
 * sütunudur. Sahip ve yönetici için süzgeç yoktur; diğer kapsamlar hiçbir satır görmez.
 */
export function permittedBranch(
  scope: TenantScope,
  permission: BusinessPermission,
  branch: SqlFragment,
): SqlFragment {
  if (managesBusiness(scope)) return sql.empty;
  if (scope.role !== "staff") return sql`and false`;
  return sql`and tenant_member_can(${scope.businessId}, ${permission}, ${branch})`;
}

/**
 * Personelin herhangi bir izninin geçtiği etkin şubeler. Sahip ve yönetici için `null`
 * (bütün şubeler). Şube listesi gibi ortak ekranlar bunu kullanır.
 */
export async function accessibleBranchIds(
  tx: Database,
  scope: TenantScope,
): Promise<string[] | null> {
  if (managesBusiness(scope)) return null;
  if (scope.role !== "staff") return [];
  const rows = await tx.many<{ id: string }>(sql`
    select b.id
    from branches b
    join business_members m
      on m.business_id = b.business_id and m.user_id = ${scope.userId} and m.active and m.role = 'staff'
    where b.business_id = ${scope.businessId} and b.active
      and exists (
        select 1 from business_member_grants g
        where g.business_id = m.business_id and g.member_id = m.id
          and (
            (g.region_id is null and g.branch_id is null)
            or g.branch_id = b.id
            or exists (
              select 1 from business_region_branches rb
              where rb.business_id = g.business_id and rb.region_id = g.region_id
                and rb.branch_id = b.id
            )
          )
      )
    order by b.name, b.id
  `);
  return rows.map((row) => row.id);
}

/** Şubenin işletim bilgilerini (saatler, ayarlar, bulunurluk) okumak için şubeye herhangi bir erişim. */
export async function requireBranchAccess(
  tx: Database,
  scope: TenantScope,
  branchId: string,
): Promise<void> {
  const branches = await accessibleBranchIds(tx, scope);
  if (branches !== null && !branches.includes(branchId)) throw new AppError("forbidden");
}
