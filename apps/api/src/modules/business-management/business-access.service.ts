import {
  type AccessGrant,
  type AccessGrantView,
  type BranchRegionBody,
  businessPermissionSchema,
  type BusinessRegion,
  type MemberAccess,
  type MemberAccessBody,
  type MyBusinessAccess,
  normaliseAccessGrants,
  normalizePhone,
  type StaffInvitation,
  type StaffInvitationCreate,
  type StaffInvitationPreview,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { type Database, isUniqueViolation, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { platformScope } from "../../core/platform-scope";
import { randomToken, sha256 } from "../../core/security";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";

const INVITATION_LIFETIME_HOURS = 72;
const MAX_PENDING_INVITATIONS = 50;

interface GrantRow {
  owner_id: string;
  permission: string;
  region_id: string | null;
  branch_id: string | null;
  scope_name: string | null;
}

function grantView(row: GrantRow): AccessGrantView {
  const permission = businessPermissionSchema.parse(row.permission);
  if (row.region_id !== null)
    return {
      permission,
      scope: { kind: "region", regionId: row.region_id },
      scopeName: row.scope_name,
    };
  if (row.branch_id !== null)
    return {
      permission,
      scope: { kind: "branch", branchId: row.branch_id },
      scopeName: row.scope_name,
    };
  return { permission, scope: { kind: "business" }, scopeName: null };
}

function scopeColumns(grant: AccessGrant): { regionId: string | null; branchId: string | null } {
  if (grant.scope.kind === "region") return { regionId: grant.scope.regionId, branchId: null };
  if (grant.scope.kind === "branch") return { regionId: null, branchId: grant.scope.branchId };
  return { regionId: null, branchId: null };
}

function groupByOwner(rows: GrantRow[]): Map<string, AccessGrantView[]> {
  const grouped = new Map<string, AccessGrantView[]>();
  for (const row of rows) {
    const list = grouped.get(row.owner_id) ?? [];
    list.push(grantView(row));
    grouped.set(row.owner_id, list);
  }
  return grouped;
}

/** İzinlerin bölge ve şubeleri bu işletmeye ait olmalı; yoksa kayıt yokmuş gibi davranılır. */
async function requireGrantScopes(
  tx: Database,
  businessId: string,
  grants: readonly AccessGrant[],
) {
  const regionIds = [
    ...new Set(grants.map((g) => scopeColumns(g).regionId).filter((id) => id !== null)),
  ];
  const branchIds = [
    ...new Set(grants.map((g) => scopeColumns(g).branchId).filter((id) => id !== null)),
  ];
  const found = await tx.one<{ regions: number; branches: number }>(sql`
    select
      (select count(*)::int from business_regions
        where business_id = ${businessId} and id = any(${regionIds}::uuid[])) as regions,
      (select count(*)::int from branches
        where business_id = ${businessId} and id = any(${branchIds}::uuid[])) as branches
  `);
  if (found.regions !== regionIds.length || found.branches !== branchIds.length)
    throw new AppError("not_found");
}

const INVITATION_GRANTS = sql`
  select g.invitation_id as owner_id, g.permission, g.region_id, g.branch_id,
    coalesce(r.name, b.name) as scope_name
  from business_staff_invitation_grants g
  left join business_regions r on r.business_id = g.business_id and r.id = g.region_id
  left join branches b on b.business_id = g.business_id and b.id = g.branch_id
`;

interface InvitationRow {
  id: string;
  business_id: string;
  recipient_phone: string;
  invited_by: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
}

function invitationView(row: InvitationRow, grants: AccessGrantView[]): StaffInvitation {
  return {
    id: row.id,
    phone: row.recipient_phone,
    grants,
    expiresAt: row.expires_at.toISOString(),
    status:
      row.accepted_at !== null
        ? "accepted"
        : row.revoked_at !== null
          ? "revoked"
          : row.expires_at.getTime() <= Date.now()
            ? "expired"
            : "pending",
  };
}

/**
 * Ekip, bölge ve izin yönetimi. İzinleri ve bölgeleri yalnız işletme sahibi değiştirir;
 * yönetici görür. Bütün değişiklikler denetim kaydına yazılır.
 */
export function createBusinessAccessService({
  db,
  platformDb,
}: Pick<AppContext, "db" | "platformDb">) {
  function myAccess(scope: TenantScope): Promise<MyBusinessAccess> {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    const role = scope.role;
    if (role !== "owner" && role !== "manager" && role !== "staff") throw new AppError("forbidden");
    const permissions = businessPermissionSchema.options;
    if (role !== "staff")
      return Promise.resolve({
        role,
        permissions: permissions.map((permission) => ({ permission, branchIds: null })),
      });
    return withTenant(db, scope, async (tx) => {
      const rows = await tx.many<{
        permission: string;
        all_branches: boolean;
        branch_ids: string[];
      }>(sql`
        select g.permission,
          bool_or(g.region_id is null and g.branch_id is null) as all_branches,
          array_remove(array_agg(distinct coalesce(g.branch_id, rb.branch_id)), null) as branch_ids
        from business_member_grants g
        join business_members m on m.business_id = g.business_id and m.id = g.member_id
        left join business_region_branches rb
          on rb.business_id = g.business_id and rb.region_id = g.region_id
        where g.business_id = ${scope.businessId} and m.user_id = ${scope.userId}
          and m.active and m.role = 'staff'
        group by g.permission
        order by g.permission
      `);
      return {
        role,
        permissions: rows.map((row) => ({
          permission: businessPermissionSchema.parse(row.permission),
          branchIds: row.all_branches ? null : row.branch_ids,
        })),
      };
    });
  }

  function members(scope: TenantScope): Promise<MemberAccess[]> {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const rows = await tx.many<{
        id: string;
        user_id: string;
        display_name: string;
        role: MemberAccess["role"];
        active: boolean;
        version: number;
      }>(sql`
        select m.id, m.user_id, m.role, m.active, m.version,
          coalesce(nullif(u.display_name, ''), nullif(u.username, ''), 'Personel') as display_name
        from business_members m
        join users u on u.id = m.user_id
        where m.business_id = ${scope.businessId}
        order by case m.role when 'owner' then 0 when 'manager' then 1 when 'staff' then 2 else 3 end,
          m.created_at, m.id
      `);
      const grants = groupByOwner(
        await tx.many<GrantRow>(sql`
          select g.member_id as owner_id, g.permission, g.region_id, g.branch_id,
            coalesce(r.name, b.name) as scope_name
          from business_member_grants g
          left join business_regions r on r.business_id = g.business_id and r.id = g.region_id
          left join branches b on b.business_id = g.business_id and b.id = g.branch_id
          where g.business_id = ${scope.businessId}
          order by g.permission, scope_name nulls first
        `),
      );
      return rows.map((row) => ({
        memberId: row.id,
        userId: row.user_id,
        displayName: row.display_name,
        role: row.role,
        active: row.active,
        version: row.version,
        grants: grants.get(row.id) ?? [],
      }));
    });
  }

  /** Personelin izinleri tek seferde, sürüm denetimiyle değiştirilir. */
  async function setMemberAccess(
    scope: TenantScope,
    memberId: string,
    body: MemberAccessBody,
  ): Promise<MemberAccess> {
    requireBusinessRole(scope, ["owner"]);
    const grants = normaliseAccessGrants(body.grants);
    await withTenant(db, scope, async (tx) => {
      const member = await tx.maybeOne<{ role: string; active: boolean; version: number }>(sql`
        select role, active, version from business_members
        where business_id = ${scope.businessId} and id = ${memberId}
        for update
      `);
      if (member === null) throw new AppError("not_found");
      if (member.version !== body.expectedVersion) throw new AppError("record_version_conflict");
      if (member.role !== "staff" || !member.active) throw new AppError("validation_failed");
      await requireGrantScopes(tx, scope.businessId, grants);
      await tx.execute(sql`
        delete from business_member_grants
        where business_id = ${scope.businessId} and member_id = ${memberId}
      `);
      for (const grant of grants) {
        const { regionId, branchId } = scopeColumns(grant);
        await tx.execute(sql`
          insert into business_member_grants
            (business_id, member_id, permission, region_id, branch_id, granted_by)
          values (${scope.businessId}, ${memberId}, ${grant.permission}, ${regionId}, ${branchId},
            ${scope.userId})
        `);
      }
      await tx.execute(sql`
        update business_members set version = version + 1
        where business_id = ${scope.businessId} and id = ${memberId}
      `);
      await recordAudit(tx, {
        actor: scope.userId,
        action: "business.member_access_changed",
        targetType: "business_member",
        targetId: memberId,
        metadata: {
          businessId: scope.businessId,
          permissions: [...new Set(grants.map((grant) => grant.permission))],
          grantCount: grants.length,
        },
      });
    });
    const updated = (await members(scope)).find((member) => member.memberId === memberId);
    if (updated === undefined) throw new AppError("not_found");
    return updated;
  }

  function regions(scope: TenantScope): Promise<{ items: BusinessRegion[] }> {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => ({
      items: await tx.many<BusinessRegion>(sql`
        select r.id, r.name, r.version,
          coalesce(array_agg(rb.branch_id order by rb.branch_id)
            filter (where rb.branch_id is not null), '{}') as "branchIds"
        from business_regions r
        left join business_region_branches rb on rb.business_id = r.business_id and rb.region_id = r.id
        where r.business_id = ${scope.businessId}
        group by r.id
        order by r.name, r.id
      `),
    }));
  }

  async function regionById(tx: Database, businessId: string, regionId: string) {
    const region = await tx.maybeOne<BusinessRegion>(sql`
      select r.id, r.name, r.version,
        coalesce(array_agg(rb.branch_id order by rb.branch_id)
          filter (where rb.branch_id is not null), '{}') as "branchIds"
      from business_regions r
      left join business_region_branches rb on rb.business_id = r.business_id and rb.region_id = r.id
      where r.business_id = ${businessId} and r.id = ${regionId}
      group by r.id
    `);
    if (region === null) throw new AppError("not_found");
    return region;
  }

  async function createRegion(scope: TenantScope, name: string): Promise<BusinessRegion> {
    requireBusinessRole(scope, ["owner"]);
    try {
      return await withTenant(db, scope, async (tx) => {
        const row = await tx.one<{ id: string }>(sql`
          insert into business_regions (business_id, name) values (${scope.businessId}, ${name})
          returning id
        `);
        await recordAudit(tx, {
          actor: scope.userId,
          action: "business.region_created",
          targetType: "business_region",
          targetId: row.id,
          metadata: { businessId: scope.businessId },
        });
        return regionById(tx, scope.businessId, row.id);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError("region_name_taken");
      throw error;
    }
  }

  async function renameRegion(
    scope: TenantScope,
    regionId: string,
    name: string,
    expectedVersion: number,
  ): Promise<BusinessRegion> {
    requireBusinessRole(scope, ["owner"]);
    try {
      return await withTenant(db, scope, async (tx) => {
        const row = await tx.maybeOne<{ version: number }>(sql`
          select version from business_regions
          where business_id = ${scope.businessId} and id = ${regionId}
          for update
        `);
        if (row === null) throw new AppError("not_found");
        if (row.version !== expectedVersion) throw new AppError("record_version_conflict");
        await tx.execute(sql`
          update business_regions set name = ${name}, version = version + 1
          where business_id = ${scope.businessId} and id = ${regionId}
        `);
        await recordAudit(tx, {
          actor: scope.userId,
          action: "business.region_renamed",
          targetType: "business_region",
          targetId: regionId,
          metadata: { businessId: scope.businessId },
        });
        return regionById(tx, scope.businessId, regionId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError("region_name_taken");
      throw error;
    }
  }

  /** Bölge silinince şubeleri bölgesiz kalır; o bölgeye verilmiş izinler de kalkar. */
  function deleteRegion(scope: TenantScope, regionId: string, expectedVersion: number) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      const row = await tx.maybeOne<{ version: number }>(sql`
        select version from business_regions
        where business_id = ${scope.businessId} and id = ${regionId}
        for update
      `);
      if (row === null) throw new AppError("not_found");
      if (row.version !== expectedVersion) throw new AppError("record_version_conflict");
      await tx.execute(sql`
        delete from business_regions where business_id = ${scope.businessId} and id = ${regionId}
      `);
      await recordAudit(tx, {
        actor: scope.userId,
        action: "business.region_deleted",
        targetType: "business_region",
        targetId: regionId,
        metadata: { businessId: scope.businessId },
      });
    });
  }

  /** Şubenin bölgesi beklenen eski değerle karşılaştırılarak değiştirilir. */
  function setBranchRegion(scope: TenantScope, branchId: string, body: BranchRegionBody) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      const branch = await tx.maybeOne<{ region_id: string | null }>(sql`
        select rb.region_id
        from branches b
        left join business_region_branches rb on rb.business_id = b.business_id and rb.branch_id = b.id
        where b.business_id = ${scope.businessId} and b.id = ${branchId}
        for update of b
      `);
      if (branch === null) throw new AppError("not_found");
      if (branch.region_id !== body.expectedRegionId) throw new AppError("record_version_conflict");
      if (body.regionId === null) {
        await tx.execute(sql`
          delete from business_region_branches
          where business_id = ${scope.businessId} and branch_id = ${branchId}
        `);
      } else {
        const region = await tx.maybeOne(sql`
          select 1 from business_regions
          where business_id = ${scope.businessId} and id = ${body.regionId}
          for key share
        `);
        if (region === null) throw new AppError("not_found");
        await tx.execute(sql`
          insert into business_region_branches (business_id, branch_id, region_id)
          values (${scope.businessId}, ${branchId}, ${body.regionId})
          on conflict (business_id, branch_id) do update set region_id = excluded.region_id
        `);
      }
      await recordAudit(tx, {
        actor: scope.userId,
        action: "business.branch_region_changed",
        targetType: "branch",
        targetId: branchId,
        metadata: { businessId: scope.businessId, from: body.expectedRegionId, to: body.regionId },
      });
      return { branchId, regionId: body.regionId };
    });
  }

  function invitations(scope: TenantScope): Promise<{ items: StaffInvitation[] }> {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      const rows = await tx.many<InvitationRow>(sql`
        select * from business_staff_invitations
        where business_id = ${scope.businessId}
        order by created_at desc, id desc
        limit 30
      `);
      const grants = groupByOwner(
        await tx.many<GrantRow>(sql`
          ${INVITATION_GRANTS}
          where g.business_id = ${scope.businessId}
            and g.invitation_id = any(${rows.map((row) => row.id)}::uuid[])
          order by g.permission, scope_name nulls first
        `),
      );
      return { items: rows.map((row) => invitationView(row, grants.get(row.id) ?? [])) };
    });
  }

  /** Bağlantı yalnız bu yanıtta görünür; veritabanında belirtecin özeti tutulur. */
  async function createInvitation(scope: TenantScope, input: StaffInvitationCreate) {
    requireBusinessRole(scope, ["owner"]);
    const phone = normalizePhone(input.phone);
    if (phone === null) throw new AppError("invalid_phone");
    const grants = normaliseAccessGrants(input.grants);
    return withTenant(db, scope, async (tx) => {
      // Aynı işletmenin bekleyen davet sınırı bütün cihazlarda tek sırayla denetlenir.
      const business = await tx.maybeOne(sql`
        select 1 from businesses where id = ${scope.businessId} and status = 'active' for update
      `);
      if (business === null) throw new AppError("forbidden");
      const pending = await tx.one<{ count: number }>(sql`
        select count(*)::int as count from business_staff_invitations
        where business_id = ${scope.businessId} and revoked_at is null and accepted_at is null
          and expires_at > now()
      `);
      if (pending.count >= MAX_PENDING_INVITATIONS) throw new AppError("rate_limited");
      const member = await tx.maybeOne(sql`
        select 1 from business_members m join users u on u.id = m.user_id
        where m.business_id = ${scope.businessId} and u.phone = ${phone} and m.active
      `);
      if (member !== null) throw new AppError("already_member");
      await requireGrantScopes(tx, scope.businessId, grants);
      const token = randomToken();
      const row = await tx.one<InvitationRow>(sql`
        insert into business_staff_invitations
          (business_id, recipient_phone, invited_by, token_hash, expires_at)
        values (${scope.businessId}, ${phone}, ${scope.userId}, ${sha256(token)},
          now() + make_interval(hours => ${INVITATION_LIFETIME_HOURS}))
        returning *
      `);
      for (const grant of grants) {
        const { regionId, branchId } = scopeColumns(grant);
        await tx.execute(sql`
          insert into business_staff_invitation_grants
            (business_id, invitation_id, permission, region_id, branch_id)
          values (${scope.businessId}, ${row.id}, ${grant.permission}, ${regionId}, ${branchId})
        `);
      }
      const views = await tx.many<GrantRow>(sql`
        ${INVITATION_GRANTS}
        where g.business_id = ${scope.businessId} and g.invitation_id = ${row.id}
        order by g.permission, scope_name nulls first
      `);
      await recordAudit(tx, {
        actor: scope.userId,
        action: "business.staff_invitation_created",
        targetType: "staff_invitation",
        targetId: row.id,
        metadata: {
          businessId: scope.businessId,
          permissions: [...new Set(grants.map((grant) => grant.permission))],
          grantCount: grants.length,
        },
      });
      return { invitation: invitationView(row, views.map(grantView)), token };
    });
  }

  function revokeInvitation(scope: TenantScope, id: string) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      const row = await tx.maybeOne(sql`
        update business_staff_invitations set revoked_at = now()
        where business_id = ${scope.businessId} and id = ${id}
          and revoked_at is null and accepted_at is null
        returning id
      `);
      if (row === null) throw new AppError("not_found");
      await recordAudit(tx, {
        actor: scope.userId,
        action: "business.staff_invitation_revoked",
        targetType: "staff_invitation",
        targetId: id,
        metadata: { businessId: scope.businessId },
      });
    });
  }

  /** Davet, giriş yapmış ve davetteki telefon numarasına sahip kişiye açılır; üyelik gerekmez. */
  function findInvitation(tx: Database, token: string, userId: string, lock: boolean) {
    return tx.maybeOne<InvitationRow & { business_name: string }>(sql`
      select i.*, b.name as business_name
      from business_staff_invitations i
      join businesses b on b.id = i.business_id
      join users u on u.id = ${userId} and u.phone = i.recipient_phone and u.status = 'active'
      where i.token_hash = ${sha256(token)} and i.expires_at > now()
        and i.revoked_at is null and i.accepted_at is null and b.status = 'active'
      ${lock ? sql`for update of i` : sql.empty}
    `);
  }

  function previewInvitation(userId: string, token: string): Promise<StaffInvitationPreview> {
    return platformScope(platformDb, async (tx) => {
      const row = await findInvitation(tx, token, userId, false);
      if (row === null) throw new AppError("not_found");
      const grants = await tx.many<GrantRow>(sql`
        ${INVITATION_GRANTS}
        where g.business_id = ${row.business_id} and g.invitation_id = ${row.id}
        order by g.permission, scope_name nulls first
      `);
      return {
        businessName: row.business_name,
        grants: grants.map(grantView),
        expiresAt: row.expires_at.toISOString(),
      };
    });
  }

  function acceptInvitation(userId: string, token: string) {
    return platformScope(platformDb, async (tx) => {
      // Satır kilidi kabul, iptal ve çift dokunmayı tek sıraya dizer.
      const row = await findInvitation(tx, token, userId, true);
      if (row === null) throw new AppError("not_found");
      // Etkin üye, yönetici ya da sahip davetle değiştirilmez; yalnız pasif personel yeniden açılır.
      const membership = await tx.maybeOne<{ id: string }>(sql`
        insert into business_members (business_id, user_id, role, active)
        values (${row.business_id}, ${userId}, 'staff', true)
        on conflict (business_id, user_id) do update
          set active = true, version = business_members.version + 1
          where business_members.role = 'staff' and not business_members.active
        returning id
      `);
      if (membership === null) throw new AppError("already_member");
      await tx.execute(sql`
        insert into business_member_grants
          (business_id, member_id, permission, region_id, branch_id, granted_by)
        select business_id, ${membership.id}, permission, region_id, branch_id, ${row.invited_by}
        from business_staff_invitation_grants
        where business_id = ${row.business_id} and invitation_id = ${row.id}
      `);
      await tx.execute(sql`
        update business_staff_invitations set accepted_at = now(), accepted_by = ${userId}
        where id = ${row.id}
      `);
      await recordAudit(tx, {
        actor: userId,
        action: "business.staff_invitation_accepted",
        targetType: "staff_invitation",
        targetId: row.id,
        metadata: { businessId: row.business_id },
      });
      return { businessId: row.business_id };
    });
  }

  return {
    myAccess,
    members,
    setMemberAccess,
    regions,
    createRegion,
    renameRegion,
    deleteRegion,
    setBranchRegion,
    invitations,
    createInvitation,
    revokeInvitation,
    previewInvitation,
    acceptInvitation,
  };
}
