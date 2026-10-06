import type {
  AppInstanceBody,
  Branch,
  BranchBody,
  BranchHoursBody,
  BusinessMemberBody,
  BusinessMembership,
} from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { isUniqueViolation, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { platformScope } from "../../core/platform-scope";
import {
  authoriseTenant,
  requireBusinessRole,
  type TenantScope,
  withTenant,
} from "../../core/tenant-scope";
import { miniAppLive } from "../miniapps/miniapp-rows";

const MANAGERS = ["owner", "manager"] as const;

interface MembershipRow {
  id: string;
  business_id: string;
  user_id: string;
  name: string;
  role: BusinessMembership["role"];
  active: boolean;
}
function toMembership(row: MembershipRow): BusinessMembership {
  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    businessName: row.name,
    role: row.role,
    active: row.active,
  };
}
interface BranchRow {
  id: string;
  business_id: string;
  name: string;
  timezone: string;
  address: string;
  active: boolean;
}
function toBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    timezone: row.timezone,
    address: row.address,
    active: row.active,
  };
}
interface InstanceRow {
  id: string;
  business_id: string;
  mini_app_id: string;
  merchant_id: string;
  engine: "ordering";
  active: boolean;
  created_at: Date;
}
function toInstance(row: InstanceRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    miniAppId: row.mini_app_id,
    merchantId: row.merchant_id,
    engine: row.engine,
    active: row.active,
    createdAt: row.created_at.toISOString(),
  };
}

export function createBusinessManagementService({ db, platformDb, config }: AppContext) {
  async function memberships(userId: string): Promise<BusinessMembership[]> {
    return platformScope(platformDb, async (tx) => {
      const rows = await tx.many<MembershipRow>(sql`
        select m.*, b.name from business_members m
        join businesses b on b.id = m.business_id
        join users u on u.id = m.user_id
        where m.user_id = ${userId} and m.active and u.status = 'active'
        order by b.name, b.id
      `);
      return rows.map(toMembership);
    });
  }

  async function authorise(userId: string, businessId: string): Promise<TenantScope> {
    const member = await platformScope(platformDb, (tx) =>
      tx.maybeOne<MembershipRow>(sql`
      select m.*, b.name from business_members m join businesses b on b.id = m.business_id
      join users u on u.id = m.user_id
      where m.business_id = ${businessId} and m.user_id = ${userId} and m.active and u.status = 'active'
    `),
    );
    if (member === null) throw new AppError("forbidden");
    return authoriseTenant({
      businessId,
      userId,
      role: member.role,
      appInstanceId: null,
      businessCustomerId: null,
    });
  }

  async function members(scope: TenantScope): Promise<BusinessMembership[]> {
    requireBusinessRole(scope, MANAGERS);
    return withTenant(db, scope, async (tx) => {
      const rows = await tx.many<MembershipRow>(sql`
        select m.*, b.name from business_members m join businesses b on b.id = m.business_id
        where m.business_id = ${scope.businessId} order by m.created_at, m.id
      `);
      return rows.map(toMembership);
    });
  }

  async function setMember(scope: TenantScope, body: BusinessMemberBody): Promise<void> {
    requireBusinessRole(scope, ["owner"]);
    await withTenant(db, scope, async (tx) => {
      const user = await tx.maybeOne(
        sql`select 1 from users where id = ${body.userId} and status = 'active' for share`,
      );
      if (user === null) throw new AppError("user_not_found");
      const owner = await tx.maybeOne(sql`
        select 1 from business_members where business_id = ${scope.businessId}
          and user_id = ${body.userId} and role = 'owner'
      `);
      if (owner !== null) throw new AppError("forbidden");
      await tx.execute(sql`
        insert into business_members(business_id, user_id, role, active)
        values (${scope.businessId}, ${body.userId}, ${body.role}, ${body.active})
        on conflict (business_id, user_id) do update set role = excluded.role, active = excluded.active
      `);
    });
  }

  function branches(scope: TenantScope): Promise<Branch[]> {
    return withTenant(db, scope, async (tx) =>
      (
        await tx.many<BranchRow>(sql`
      select * from branches where business_id = ${scope.businessId} order by name, id
    `)
      ).map(toBranch),
    );
  }

  async function saveBranch(scope: TenantScope, body: BranchBody, id?: string): Promise<Branch> {
    requireBusinessRole(scope, MANAGERS);
    try {
      return await withTenant(db, scope, async (tx) => {
        const row =
          id === undefined
            ? await tx.one<BranchRow>(sql`
          insert into branches(business_id, name, timezone, address, active)
          values (${scope.businessId}, ${body.name}, ${body.timezone}, ${body.address}, ${body.active}) returning *
        `)
            : await tx.maybeOne<BranchRow>(sql`
          update branches set name = ${body.name}, timezone = ${body.timezone},
            address = ${body.address}, active = ${body.active}
          where business_id = ${scope.businessId} and id = ${id} returning *
        `);
        if (row === null) throw new AppError("not_found");
        return toBranch(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError("validation_failed");
      throw error;
    }
  }

  function hours(scope: TenantScope, branchId: string) {
    return withTenant(db, scope, async (tx) => {
      await requireBranch(tx, scope, branchId);
      const rows = await tx.many<{ weekday: number; opens_at: number; closes_at: number }>(sql`
        select weekday, opens_at, closes_at from branch_hours
        where business_id = ${scope.businessId} and branch_id = ${branchId} order by weekday, opens_at
      `);
      return {
        hours: rows.map((row) => ({
          weekday: row.weekday,
          opensAt: row.opens_at,
          closesAt: row.closes_at,
        })),
      };
    });
  }

  async function setHours(
    scope: TenantScope,
    branchId: string,
    body: BranchHoursBody,
  ): Promise<void> {
    requireBusinessRole(scope, MANAGERS);
    await withTenant(db, scope, async (tx) => {
      await requireBranch(tx, scope, branchId);
      const intervals = body.hours.map((hour) => ({
        start: hour.weekday * 1440 + hour.opensAt,
        end: hour.weekday * 1440 + hour.closesAt,
      }));
      for (let i = 0; i < intervals.length; i += 1) {
        const a = intervals[i];
        if (a === undefined) continue;
        for (const b of intervals.slice(i + 1)) {
          for (const shift of [-10080, 0, 10080]) {
            if (a.start < b.end + shift && b.start + shift < a.end)
              throw new AppError("validation_failed");
          }
        }
      }
      await tx.execute(
        sql`delete from branch_hours where business_id = ${scope.businessId} and branch_id = ${branchId}`,
      );
      for (const hour of body.hours) {
        await tx.execute(sql`
          insert into branch_hours(business_id, branch_id, weekday, opens_at, closes_at)
          values (${scope.businessId}, ${branchId}, ${hour.weekday}, ${hour.opensAt}, ${hour.closesAt})
        `);
      }
    });
  }

  function instances(scope: TenantScope) {
    return withTenant(db, scope, async (tx) =>
      (
        await tx.many<InstanceRow>(sql`
      select * from app_instances where business_id = ${scope.businessId} order by created_at, id
    `)
      ).map(toInstance),
    );
  }

  function createInstance(scope: TenantScope, body: AppInstanceBody) {
    requireBusinessRole(scope, MANAGERS);
    return withTenant(db, scope, async (tx) => {
      const binding = await tx.maybeOne(sql`
        select 1 from mini_app_merchants where business_id = ${scope.businessId}
          and mini_app_id = ${body.miniAppId} and merchant_id = ${body.merchantId} and active
      `);
      if (binding === null) throw new AppError("merchant_not_bound");
      const row = await tx.one<InstanceRow>(sql`
        insert into app_instances(business_id, mini_app_id, merchant_id, engine, active)
        values (${scope.businessId}, ${body.miniAppId}, ${body.merchantId}, ${body.engine}, ${body.active})
        on conflict (business_id, mini_app_id, merchant_id) do update set active = excluded.active returning *
      `);
      return toInstance(row);
    });
  }

  async function customerScope(
    userId: string,
    businessId: string,
    appInstanceId: string,
    expectedMiniAppId?: string,
  ): Promise<TenantScope> {
    const available = await platformScope(platformDb, (tx) =>
      tx.maybeOne(sql`
      select 1 from app_instances i join businesses b on b.id = i.business_id
      join users owner on owner.id = b.owner_id
      join mini_app_merchants mm on mm.business_id = i.business_id and mm.mini_app_id = i.mini_app_id
        and mm.merchant_id = i.merchant_id
      join mini_app_runtime a on a.id = i.mini_app_id
      where i.business_id = ${businessId} and i.id = ${appInstanceId} and i.active and mm.active
        ${expectedMiniAppId === undefined ? sql.empty : sql`and i.mini_app_id = ${expectedMiniAppId}`}
        and b.status = 'active' and b.verified and owner.status = 'active'
        and ${miniAppLive(config.miniAppDevMode)}
    `),
    );
    if (available === null) throw new AppError("business_not_found");
    const initial = authoriseTenant({
      businessId,
      userId,
      role: "customer",
      appInstanceId,
      businessCustomerId: null,
    });
    const customer = await withTenant(db, initial, async (tx) => {
      const user = await tx.maybeOne(
        sql`select id from users where id = ${userId} and status = 'active' for share`,
      );
      if (user === null) throw new AppError("unauthorized");
      return tx.one<{ id: string }>(sql`
      insert into business_customers(business_id, user_id) values (${businessId}, ${userId})
      on conflict (business_id, user_id) where user_id is not null do update set user_id = excluded.user_id returning id
    `);
    });
    return authoriseTenant({
      businessId,
      userId,
      role: "customer",
      appInstanceId,
      businessCustomerId: customer.id,
    });
  }

  async function resolveCustomerScope(userId: string, miniAppId: string) {
    const instances = await platformScope(platformDb, (tx) =>
      tx.many<{ business_id: string; id: string }>(
        sql`select business_id,id from app_instances where mini_app_id=${miniAppId} and active order by id limit 2`,
      ),
    );
    if (instances.length !== 1 || instances[0] === undefined)
      throw new AppError("business_not_found");
    return customerScope(userId, instances[0].business_id, instances[0].id, miniAppId);
  }
  return {
    resolveCustomerScope,
    memberships,
    authorise,
    members,
    setMember,
    branches,
    saveBranch,
    hours,
    setHours,
    instances,
    createInstance,
    customerScope,
  };
}

async function requireBranch(db: AppContext["db"], scope: TenantScope, id: string): Promise<void> {
  const row = await db.maybeOne(
    sql`select 1 from branches where business_id = ${scope.businessId} and id = ${id} for update`,
  );
  if (row === null) throw new AppError("not_found");
}
