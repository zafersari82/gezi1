import type { BusinessMemberRole } from "@vado/contracts";

import { type Database, sql } from "./database";
import { AppError } from "./errors";

const AUTHORISED = Symbol("tenant-authorised");
interface ScopeBase {
  readonly [AUTHORISED]: true;
  readonly businessId: string;
}
/** Üyelik ve müşteri bağlamı yalnızca kişisel oturumdan üretilir. */
export interface PersonalTenantScope extends ScopeBase {
  readonly userId: string;
  readonly role: BusinessMemberRole | "customer";
  readonly appInstanceId: string | null;
  readonly businessCustomerId: string | null;
  readonly deviceId?: never;
  readonly branchId?: never;
}
/** Cihaz kişisel hesap değildir; yalnızca eşleştirildiği mutfağa erişir. */
export interface KitchenTenantScope extends ScopeBase {
  readonly userId: null;
  readonly role: "kitchen";
  readonly deviceId: string;
  readonly branchId: string;
  readonly appInstanceId: string;
  readonly businessCustomerId: null;
}
export type TenantScope = PersonalTenantScope | KitchenTenantScope;
const issued = new WeakSet<TenantScope>();

/** Bu kuruculara motor modüllerinden erişim lint ile yasaktır. */
export function authoriseTenant(
  input: Omit<PersonalTenantScope, typeof AUTHORISED>,
): PersonalTenantScope {
  const scope = Object.freeze({ ...input, [AUTHORISED]: true as const });
  issued.add(scope);
  return scope;
}
export function authoriseKitchenTenant(
  input: Omit<KitchenTenantScope, typeof AUTHORISED>,
): KitchenTenantScope {
  const scope = Object.freeze({ ...input, [AUTHORISED]: true as const });
  issued.add(scope);
  return scope;
}

/** Kapsam bağlantıya değil, yalnızca bu SQL işlemine aittir. */
export function withTenant<T>(
  db: Database,
  scope: TenantScope,
  run: (tx: Database) => Promise<T>,
): Promise<T> {
  if (!issued.has(scope)) throw new AppError("forbidden");
  return db.transaction(async (tx) => {
    const current = await tx.one<{ business_id: string | null }>(sql`
      select nullif(current_setting('vado.business_id', true), '') as business_id
    `);
    if (current.business_id !== null && current.business_id !== scope.businessId)
      throw new AppError("forbidden");
    await tx.execute(sql`select set_config('vado.business_id', ${scope.businessId}, true)`);
    if (scope.role !== "kitchen") {
      const actor = await tx.one<{ user_id: string | null }>(
        sql`select nullif(current_setting('vado.user_id',true),'') as user_id`,
      );
      if (actor.user_id !== null && actor.user_id !== scope.userId) throw new AppError("forbidden");
      await tx.execute(sql`select set_config('vado.user_id',${scope.userId},true)`);
      if (scope.role === "courier") throw new AppError("forbidden");
    }
    if (scope.role === "kitchen") {
      const device = await tx.maybeOne(sql`
        select d.id from kitchen_devices d join app_instances i on i.business_id=d.business_id and i.id=d.app_instance_id
        join branches b on b.business_id=d.business_id and b.id=d.branch_id
        join businesses business on business.id=d.business_id join users owner on owner.id=business.owner_id
        where d.business_id=${scope.businessId} and d.id=${scope.deviceId} and d.branch_id=${scope.branchId}
          and d.app_instance_id=${scope.appInstanceId} and d.revoked_at is null and d.expires_at>now() and b.active and i.active
          and business.status='active' and business.verified and owner.status='active'
          and ordering_capabilities_for_instance(d.business_id,d.app_instance_id) ? 'ordering.kitchen@1.0.0' for share of d,b,i,business,owner
      `);
      if (device === null) throw new AppError("unauthorized");
    } else {
      const user = await tx.maybeOne(
        sql`select id from users where id=${scope.userId} and status='active' for share`,
      );
      if (user === null) throw new AppError("unauthorized");
      if (scope.role === "customer") {
        if (scope.businessCustomerId !== null) {
          const customer = await tx.maybeOne(sql`
            select id from business_customers where business_id=${scope.businessId} and id=${scope.businessCustomerId} and user_id=${scope.userId} for share
          `);
          if (customer === null) throw new AppError("forbidden");
        }
        const instance = await tx.maybeOne(
          sql`select id from app_instances where business_id=${scope.businessId} and id=${scope.appInstanceId} and active for share`,
        );
        if (instance === null) throw new AppError("forbidden");
      } else {
        const member = await tx.maybeOne(
          sql`select id from business_members where business_id=${scope.businessId} and user_id=${scope.userId} and role=${scope.role} and active for share`,
        );
        if (member === null) throw new AppError("forbidden");
      }
    }
    return run(tx);
  });
}

export function requireBusinessRole(
  scope: TenantScope,
  roles: readonly BusinessMemberRole[],
): asserts scope is PersonalTenantScope {
  if (scope.role === "customer" || scope.role === "kitchen" || !roles.includes(scope.role))
    throw new AppError("forbidden");
}
