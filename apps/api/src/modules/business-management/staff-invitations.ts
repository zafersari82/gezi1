import type { StaffInvitation, StaffInvitationCreate } from "@vado/contracts";
import { normalizePhone } from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { platformScope } from "../../core/platform-scope";
import { randomToken, sha256 } from "../../core/security";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";

const INVITATION_LIFETIME_HOURS = 72;
const MAX_PENDING_INVITATIONS = 50;

interface InvitationRow {
  id: string;
  business_id: string;
  recipient_phone: string;
  order_access: "none" | "view" | "manage";
  can_manage_availability: boolean;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  business_name?: string;
}
interface InvitationBranch {
  id: string;
  name: string;
}

async function invitationBranches(tx: Database, businessId: string, invitationId: string) {
  return tx.many<InvitationBranch>(sql`
    select b.id,b.name from business_staff_invitation_branches ib
    join branches b on b.business_id=ib.business_id and b.id=ib.branch_id
    where ib.business_id=${businessId} and ib.invitation_id=${invitationId}
    order by b.name,b.id
  `);
}
function invitationView(row: InvitationRow, branches: InvitationBranch[]): StaffInvitation {
  return {
    id: row.id,
    phone: row.recipient_phone,
    branches,
    orderAccess: row.order_access,
    canManageAvailability: row.can_manage_availability,
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

/** One-time staff invites share the existing membership and branch grant model. */
export function createStaffInvitations({ db, platformDb }: Pick<AppContext, "db" | "platformDb">) {
  async function invitations(scope: TenantScope) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      const rows = await tx.many<InvitationRow>(sql`
        select * from business_staff_invitations where business_id=${scope.businessId}
        order by created_at desc,id desc limit 30
      `);
      const items: StaffInvitation[] = [];
      for (const row of rows)
        items.push(invitationView(row, await invitationBranches(tx, scope.businessId, row.id)));
      return { items };
    });
  }

  async function createInvitation(scope: TenantScope, input: StaffInvitationCreate) {
    requireBusinessRole(scope, ["owner"]);
    const phone = normalizePhone(input.phone);
    if (phone === null) throw new AppError("invalid_phone");
    return withTenant(db, scope, async (tx) => {
      // Serialize the business-wide pending invitation limit across all devices.
      const business = await tx.maybeOne(sql`
        select 1 from businesses where id=${scope.businessId} and status='active' for update
      `);
      if (business === null) throw new AppError("forbidden");
      const count = await tx.one<{ count: string }>(sql`
        select count(*)::text as count from business_staff_invitations
        where business_id=${scope.businessId} and revoked_at is null
          and accepted_at is null and expires_at>now()
      `);
      if (Number(count.count) >= MAX_PENDING_INVITATIONS) throw new AppError("rate_limited");
      const alreadyMember = await tx.maybeOne(sql`
        select 1 from business_members m join users u on u.id=m.user_id
        where m.business_id=${scope.businessId} and u.phone=${phone} and m.active
      `);
      if (alreadyMember !== null) throw new AppError("validation_failed");
      const branches = await tx.many<InvitationBranch>(sql`
        select id,name from branches where business_id=${scope.businessId}
          and id=any(${input.branchIds}::uuid[]) and active
        order by name,id for key share
      `);
      if (branches.length !== input.branchIds.length) throw new AppError("not_found");
      const token = randomToken();
      const row = await tx.one<InvitationRow>(sql`
        insert into business_staff_invitations
          (business_id,recipient_phone,invited_by,token_hash,order_access,can_manage_availability,expires_at)
        values (${scope.businessId},${phone},${scope.userId},${sha256(token)},
          ${input.orderAccess},${input.canManageAvailability},
          now()+make_interval(hours => ${INVITATION_LIFETIME_HOURS}))
        returning *
      `);
      for (const branch of branches)
        await tx.execute(sql`
        insert into business_staff_invitation_branches(business_id,invitation_id,branch_id)
        values(${scope.businessId},${row.id},${branch.id})
      `);
      await recordAudit(tx, {
        actor: scope.userId,
        action: "business.staff_invitation_created",
        targetType: "staff_invitation",
        targetId: row.id,
        metadata: {
          businessId: scope.businessId,
          branchCount: branches.length,
          orderAccess: input.orderAccess,
          canManageAvailability: input.canManageAvailability,
        },
      });
      // Only this creation response includes the plaintext token.
      return { invitation: invitationView(row, branches), token };
    });
  }

  async function revokeInvitation(scope: TenantScope, id: string) {
    requireBusinessRole(scope, ["owner"]);
    return withTenant(db, scope, async (tx) => {
      const row = await tx.maybeOne<{ id: string }>(sql`
        update business_staff_invitations set revoked_at=now()
        where business_id=${scope.businessId} and id=${id}
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

  /** Invite lookup does not require existing business membership; phone ownership does. */
  function findInvitation(tx: Database, token: string, userId: string, lock = false) {
    return tx.maybeOne<InvitationRow>(sql`
      select i.*,b.name as business_name from business_staff_invitations i
      join businesses b on b.id=i.business_id
      join users u on u.id=${userId} and u.phone=i.recipient_phone and u.status='active'
      where i.token_hash=${sha256(token)} and i.expires_at>now()
        and i.revoked_at is null and i.accepted_at is null and b.status='active'
      ${lock ? sql`for update of i` : sql.empty}
    `);
  }

  function previewInvitation(userId: string, token: string) {
    return platformScope(platformDb, async (tx) => {
      const row = await findInvitation(tx, token, userId);
      if (row === null) throw new AppError("not_found");
      const branches = await invitationBranches(tx, row.business_id, row.id);
      if (branches.length === 0) throw new AppError("not_found");
      return {
        businessName: row.business_name ?? "İşletme",
        branches,
        orderAccess: row.order_access,
        canManageAvailability: row.can_manage_availability,
        expiresAt: row.expires_at.toISOString(),
      };
    });
  }

  function acceptInvitation(userId: string, token: string) {
    return platformScope(platformDb, async (tx) => {
      // A row lock serializes accept, revoke and double taps. The accepting user must
      // control the exact phone number named in the invitation (verified VADO login).
      const row = await findInvitation(tx, token, userId, true);
      if (row === null) throw new AppError("not_found");
      const branches = await tx.many<{ id: string }>(sql`
        select b.id from business_staff_invitation_branches ib
        join branches b on b.business_id=ib.business_id and b.id=ib.branch_id and b.active
        where ib.business_id=${row.business_id} and ib.invitation_id=${row.id}
        order by b.id for key share of b
      `);
      const expected = await tx.one<{ total: string }>(sql`
        select count(*)::text as total from business_staff_invitation_branches
        where business_id=${row.business_id} and invitation_id=${row.id}
      `);
      if (branches.length === 0 || branches.length !== Number(expected.total))
        throw new AppError("not_found");
      // Never promote an active member, reassign a manager, or overwrite owner roles.
      const membership = await tx.maybeOne<{ user_id: string }>(sql`
        insert into business_members(business_id,user_id,role,active)
        values(${row.business_id},${userId},'staff',true)
        on conflict(business_id,user_id) do update set active=true
          where business_members.role='staff' and not business_members.active
        returning user_id
      `);
      if (membership === null) throw new AppError("validation_failed");
      // Remove any stale grants from an older deactivated membership before provisioning.
      await tx.execute(sql`delete from branch_availability_grants
        where business_id=${row.business_id} and user_id=${userId}`);
      await tx.execute(sql`delete from business_region_operators
        where business_id=${row.business_id} and user_id=${userId}`);
      await tx.execute(sql`delete from business_branch_order_grants
        where business_id=${row.business_id} and user_id=${userId}`);
      await tx.execute(sql`delete from business_region_order_grants
        where business_id=${row.business_id} and user_id=${userId}`);
      for (const branch of branches) {
        if (row.order_access !== "none")
          await tx.execute(sql`
          insert into business_branch_order_grants(business_id,branch_id,user_id,can_manage)
          values(${row.business_id},${branch.id},${userId},${row.order_access === "manage"})
        `);
        if (row.can_manage_availability)
          await tx.execute(sql`
          insert into branch_availability_grants(business_id,branch_id,user_id)
          values(${row.business_id},${branch.id},${userId})
        `);
      }
      await tx.execute(sql`update business_staff_invitations
        set accepted_at=now(), accepted_by=${userId} where id=${row.id}`);
      await recordAudit(tx, {
        actor: userId,
        action: "business.staff_invitation_accepted",
        targetType: "staff_invitation",
        targetId: row.id,
        metadata: { businessId: row.business_id, branchCount: branches.length },
      });
      return { businessId: row.business_id };
    });
  }

  return { invitations, createInvitation, revokeInvitation, previewInvitation, acceptInvitation };
}
