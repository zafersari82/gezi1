import type {
  AppInstanceBody,
  Branch,
  BranchBody,
  BranchHoursBody,
  BusinessMemberBody,
  BusinessMembership,
  BusinessMiniAppLaunch,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import { accessibleBranchIds, requireBranchAccess } from "../../core/business-access";
import type { AppContext } from "../../core/context";
import { type Database, isForeignKeyViolation, isUniqueViolation, sql } from "../../core/database";
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
  display_name?: string;
  role: BusinessMembership["role"];
  active: boolean;
}
function toMembership(row: MembershipRow): BusinessMembership {
  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    businessName: row.name,
    ...(row.display_name === undefined ? {} : { displayName: row.display_name }),
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
  province_id: string | null;
  district_id: string | null;
  neighborhood_id: string | null;
  address_line: string | null;
  province_name: string | null;
  district_name: string | null;
  neighborhood_name: string | null;
}
function toBranch(row: BranchRow): Branch {
  const structured =
    row.province_id !== null && row.district_id !== null && row.neighborhood_id !== null
      ? {
          provinceId: row.province_id,
          districtId: row.district_id,
          neighborhoodId: row.neighborhood_id,
          line: row.address_line ?? "",
          provinceName: row.province_name ?? "",
          districtName: row.district_name ?? "",
          neighborhoodName: row.neighborhood_name ?? "",
        }
      : null;
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    timezone: row.timezone,
    address: structured,
    legacyAddress: row.address,
    active: row.active,
  };
}
/** Şube satırı adres adlarıyla birlikte okunur; adlar katalogdan gelir, şubede kopyalanmaz. */
function readBranches(tx: Database, businessId: string, ids: string[] | null) {
  return tx.many<BranchRow>(sql`
    select b.id, b.business_id, b.name, b.timezone, b.address, b.active,
      b.province_id, b.district_id, b.neighborhood_id, b.address_line,
      p.name as province_name, d.name as district_name, n.name as neighborhood_name
    from branches b
    left join location_provinces p on p.id = b.province_id
    left join location_districts d on d.id = b.district_id
    left join location_neighborhoods n on n.id = b.neighborhood_id
    where b.business_id = ${businessId}
      and (${ids === null} or b.id = any(${ids ?? []}::uuid[]))
    order by b.name, b.id
  `);
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
    if (member === null || member.role === "courier") throw new AppError("forbidden");
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
        select m.*, b.name,
          coalesce(nullif(u.display_name,''),nullif(u.username,''),'Personel') as display_name
        from business_members m join businesses b on b.id = m.business_id
        join users u on u.id=m.user_id
        where m.business_id = ${scope.businessId} order by m.created_at, m.id
      `);
      return rows.map(toMembership);
    });
  }

  async function setMember(
    scope: TenantScope,
    body: BusinessMemberBody,
    allowCreation = true,
  ): Promise<void> {
    requireBusinessRole(scope, ["owner"]);
    await withTenant(db, scope, async (tx) => {
      const user = await tx.maybeOne(
        sql`select 1 from users where id = ${body.userId} and status = 'active' for share`,
      );
      if (user === null) throw new AppError("user_not_found");
      // Public member updates must never silently enrol a new person.
      // Invitation acceptance is the only self-service entry point.
      if (
        !allowCreation &&
        (await tx.maybeOne(sql`
        select 1 from business_members where business_id=${scope.businessId}
          and user_id=${body.userId} for update
      `)) === null
      )
        throw new AppError("not_found");
      const owner = await tx.maybeOne(sql`
        select 1 from business_members where business_id = ${scope.businessId}
          and user_id = ${body.userId} and role = 'owner'
      `);
      if (owner !== null) throw new AppError("forbidden");
      // Rol değişir ya da üyelik kapanırsa personel izinlerini veritabanı tetikleyicisi siler.
      await tx.execute(sql`
        insert into business_members(business_id, user_id, role, active)
        values (${scope.businessId}, ${body.userId}, ${body.role}, ${body.active})
        on conflict (business_id, user_id) do update
          set role = excluded.role, active = excluded.active,
            version = business_members.version + 1
      `);
      await recordAudit(tx, {
        actor: scope.userId,
        action: "business.member_changed",
        targetType: "business_member",
        targetId: body.userId,
        metadata: { businessId: scope.businessId, role: body.role, active: body.active },
      });
    });
  }

  function branches(scope: TenantScope): Promise<Branch[]> {
    return withTenant(db, scope, async (tx) =>
      (await readBranches(tx, scope.businessId, await accessibleBranchIds(tx, scope))).map(
        toBranch,
      ),
    );
  }

  /** Yapılandırılmış adres kaydedilince 2.8 öncesinden kalan serbest metin boşalır. */
  async function saveBranch(scope: TenantScope, body: BranchBody, id?: string): Promise<Branch> {
    requireBusinessRole(scope, MANAGERS);
    const address = body.address;
    const columns = {
      province: address?.provinceId ?? null,
      district: address?.districtId ?? null,
      neighborhood: address?.neighborhoodId ?? null,
      line: address?.line ?? null,
    };
    try {
      return await withTenant(db, scope, async (tx) => {
        const saved =
          id === undefined
            ? await tx.one<{ id: string }>(sql`
                insert into branches (business_id, name, timezone, active, province_id, district_id,
                  neighborhood_id, address_line)
                values (${scope.businessId}, ${body.name}, ${body.timezone}, ${body.active},
                  ${columns.province}, ${columns.district}, ${columns.neighborhood}, ${columns.line})
                returning id
              `)
            : await tx.maybeOne<{ id: string }>(sql`
                update branches set name = ${body.name}, timezone = ${body.timezone},
                  active = ${body.active}, province_id = ${columns.province},
                  district_id = ${columns.district}, neighborhood_id = ${columns.neighborhood},
                  address_line = ${columns.line},
                  address = case when ${address !== null} then '' else address end
                where business_id = ${scope.businessId} and id = ${id}
                returning id
              `);
        if (saved === null) throw new AppError("not_found");
        const [row] = await readBranches(tx, scope.businessId, [saved.id]);
        if (row === undefined) throw new AppError("not_found");
        return toBranch(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError("validation_failed");
      if (isForeignKeyViolation(error)) throw new AppError("location_parent_invalid");
      throw error;
    }
  }

  function hours(scope: TenantScope, branchId: string) {
    return withTenant(db, scope, async (tx) => {
      await requireBranch(tx, scope, branchId);
      await requireBranchAccess(tx, scope, branchId);
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

  /**
   * Kamusal işletme profilinden açılan mini uygulamanın doğru örneğini bulur.
   * Yetkiyi istemcinin bildirdiği örnek numarasından türetmez. Mağazaya bağlı birden
   * fazla etkin örnek varsa rastgele seçim yapmaz: belirsiz açılışı reddeder.
   * Bu işlem müşteri kaydı oluşturmaz; ilk gerçek kabuk çağrısı ayrıca doğrulanır.
   */
  async function businessLaunch(businessId: string, miniAppId: string) {
    const matches = await platformScope(platformDb, (tx) =>
      tx.many<{ id: string }>(sql`
        select i.id from app_instances i
        join businesses b on b.id = i.business_id
        join users owner on owner.id = b.owner_id
        join mini_app_merchants mm on mm.business_id = i.business_id
          and mm.mini_app_id = i.mini_app_id and mm.merchant_id = i.merchant_id
        join mini_app_runtime a on a.id = i.mini_app_id
        where i.business_id = ${businessId} and i.mini_app_id = ${miniAppId}
          and i.active and mm.active and b.status = 'active' and b.verified
          and owner.status = 'active' and ${miniAppLive(config.miniAppDevMode)}
        order by i.id limit 2
      `),
    );
    if (matches.length !== 1 || matches[0] === undefined) throw new AppError("business_not_found");
    return { businessId, appInstanceId: matches[0].id } satisfies BusinessMiniAppLaunch;
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
    businessLaunch,
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
