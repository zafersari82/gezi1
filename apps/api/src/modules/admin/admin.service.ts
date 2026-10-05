import {
  type AdminBusiness,
  type AdminOverview,
  type AdminReport,
  type AdminUpdateBusinessBody,
  type AdminUser,
  type AuditEntry,
  type Page,
  type PageQuery,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
  type UserStatus,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { AuthService } from "../auth/auth.service";
import { BUSINESS_COLUMNS, type BusinessRow, toBusiness } from "../businesses/business-rows";
import { miniAppLive } from "../miniapps/miniapp-rows";
import { toUserRef, type UserRefRow } from "../users/user-rows";

const LIST_LIMIT = 200;

interface AdminUserRow {
  id: string;
  phone: string | null;
  display_name: string | null;
  username: string | null;
  status: UserStatus;
  created_at: Date;
}

interface AdminBusinessRow extends BusinessRow {
  tax_number: string | null;
  created_at: Date;
  owner_id: string;
  owner_display_name: string | null;
  owner_status: UserStatus;
  owner_avatar_key: string | null;
}

interface ReportRow extends UserRefRow {
  report_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  note: string;
  report_status: ReportStatus;
  created_at: Date;
}

interface AuditRow {
  id: number;
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

/** Arama metnini LIKE deseni olarak güvenle kullanmak için özel karakterleri kaçırır. */
function containsPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export function createAdminService({ config, db, storage }: AppContext, auth: AuthService) {
  async function overview(): Promise<AdminOverview> {
    const counts = await db.one<{
      users: number;
      new_users_today: number;
      active_businesses: number;
      pending_businesses: number;
      published_mini_apps: number;
      unverified_mini_apps: number;
      url_mini_apps: number;
      packages_in_review: number;
      messages_today: number;
      payments_today: number;
      open_reports: number;
    }>(sql`
      select
        (select count(*) from users where status <> 'deleted') as users,
        (select count(*) from users where created_at >= current_date) as new_users_today,
        (select count(*) from businesses where status = 'active') as active_businesses,
        (select count(*) from businesses where status = 'pending') as pending_businesses,
        (
          select count(*) from mini_app_runtime a where ${miniAppLive(config.miniAppDevMode)}
        ) as published_mini_apps,
        (select count(*) from mini_apps where enabled and not verified) as unverified_mini_apps,
        (select count(*) from mini_apps where source = 'url') as url_mini_apps,
        (select count(*) from package_versions where status = 'in_review') as packages_in_review,
        (
          select count(*) from messages where created_at >= current_date and kind <> 'system'
        ) as messages_today,
        (select count(*) from payments where created_at >= current_date) as payments_today,
        (select count(*) from reports where status = 'open') as open_reports
    `);
    return {
      users: counts.users,
      newUsersToday: counts.new_users_today,
      activeBusinesses: counts.active_businesses,
      pendingBusinesses: counts.pending_businesses,
      publishedMiniApps: counts.published_mini_apps,
      unverifiedMiniApps: counts.unverified_mini_apps,
      urlMiniApps: counts.url_mini_apps,
      packagesInReview: counts.packages_in_review,
      messagesToday: counts.messages_today,
      paymentsToday: counts.payments_today,
      openReports: counts.open_reports,
      config: {
        demoMode: config.demoMode,
        paymentMode: config.paymentMode,
        sessionDays: config.sessionDays,
        userQrTtlSeconds: config.userQrTtlSeconds,
        corsOrigins: config.corsOrigins,
        miniAppDevMode: config.miniAppDevMode,
        packageMaxBytes: config.packageMaxBytes,
      },
    };
  }

  // -- Kullanıcılar ---------------------------------------------------------

  async function listUsers(query?: string): Promise<AdminUser[]> {
    const pattern = query === undefined || query === "" ? null : containsPattern(query);
    const rows = await db.many<AdminUserRow>(sql`
      select id, phone, display_name, username, status, created_at
      from users
      where ${
        pattern === null
          ? sql`true`
          : sql`(phone like ${pattern} or username like ${pattern} or display_name ilike ${pattern})`
      }
      order by created_at desc
      limit ${LIST_LIMIT}
    `);
    return rows.map((row) => ({
      id: row.id,
      phone: row.phone,
      displayName: row.display_name,
      username: row.username,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /** Hesabı askıya alır veya yeniden açar. Askıya alınan hesabın tüm oturumları kapatılır. */
  async function updateUserStatus(
    actor: string,
    userId: string,
    status: "active" | "suspended",
  ): Promise<void> {
    const updated = await db.transaction(async (tx) => {
      const count = await tx.execute(sql`
        update users set status = ${status}, updated_at = now()
        where id = ${userId} and status <> 'deleted'
      `);
      if (count > 0) {
        await recordAudit(tx, {
          actor,
          action: status === "suspended" ? "user.suspended" : "user.reactivated",
          targetType: "user",
          targetId: userId,
        });
      }
      return count;
    });
    if (updated === 0) throw new AppError("user_not_found");
    if (status === "suspended") await auth.revokeAllSessions(userId);
  }

  // -- İşletmeler -----------------------------------------------------------

  async function listBusinesses(query?: string): Promise<AdminBusiness[]> {
    const pattern = query === undefined || query === "" ? null : containsPattern(query);
    const rows = await db.many<AdminBusinessRow>(sql`
      select
        ${BUSINESS_COLUMNS}, b.tax_number, b.created_at,
        r.id as owner_id,
        r.display_name as owner_display_name,
        r.status as owner_status,
        r.avatar_key as owner_avatar_key
      from businesses b
      join user_refs r on r.id = b.owner_id
      where ${pattern === null ? sql`true` : sql`(b.name ilike ${pattern} or b.slug like ${pattern})`}
      order by b.created_at desc
      limit ${LIST_LIMIT}
    `);
    return rows.map((row) => ({
      ...toBusiness(row),
      taxNumber: row.tax_number,
      owner: toUserRef(
        {
          id: row.owner_id,
          display_name: row.owner_display_name,
          status: row.owner_status,
          avatar_key: row.owner_avatar_key,
        },
        storage,
      ),
      ownerStatus: row.owner_status,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /** İşletmeyi onaylar, yayınlar veya askıya alır. Sahibinin hesabı etkin değilse yayınlanamaz. */
  async function updateBusiness(
    actor: string,
    businessId: string,
    body: AdminUpdateBusinessBody,
  ): Promise<void> {
    const updated = await db.transaction(async (tx) => {
      if (body.status === "active") {
        const owner = await tx.maybeOne<{ status: UserStatus }>(sql`
          select u.status from businesses b join users u on u.id = b.owner_id
          where b.id = ${businessId}
        `);
        if (owner !== null && owner.status !== "active") {
          throw new AppError("business_owner_unavailable");
        }
      }
      const count = await tx.execute(sql`
        update businesses
        set
          verified = coalesce(${body.verified ?? null}, verified),
          status = coalesce(${body.status ?? null}, status),
          updated_at = now()
        where id = ${businessId}
      `);
      if (count > 0) {
        await recordAudit(tx, {
          actor,
          action: "business.updated",
          targetType: "business",
          targetId: businessId,
          metadata: body,
        });
      }
      return count;
    });
    if (updated === 0) throw new AppError("business_not_found");
  }

  // -- Şikayetler ve denetim kaydı ------------------------------------------

  async function listReports(): Promise<AdminReport[]> {
    const rows = await db.many<ReportRow>(sql`
      select
        rp.id as report_id, rp.target_type, rp.target_id, rp.reason, rp.note,
        rp.status as report_status, rp.created_at,
        r.id, r.display_name, r.status, r.avatar_key
      from reports rp
      join user_refs r on r.id = rp.reporter_id
      order by (rp.status = 'open') desc, rp.created_at desc
      limit ${LIST_LIMIT}
    `);
    return rows.map((row) => ({
      id: row.report_id,
      reporter: toUserRef(row, storage),
      targetType: row.target_type,
      targetId: row.target_id,
      reason: row.reason,
      note: row.note,
      status: row.report_status,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async function updateReport(
    actor: string,
    reportId: string,
    status: ReportStatus,
  ): Promise<void> {
    const updated = await db.transaction(async (tx) => {
      const count = await tx.execute(sql`
        update reports
        set status = ${status}, resolved_at = ${status === "resolved" ? sql`now()` : sql`null`}
        where id = ${reportId}
      `);
      if (count > 0) {
        await recordAudit(tx, {
          actor,
          action: "report.updated",
          targetType: "report",
          targetId: reportId,
          metadata: { status },
        });
      }
      return count;
    });
    if (updated === 0) throw new AppError("report_not_found");
  }

  async function listAudit(page: PageQuery): Promise<Page<AuditEntry>> {
    const rows = await db.many<AuditRow>(sql`
      select id, actor, action, target_type, target_id, metadata, created_at
      from audit_log
      where ${page.cursor === undefined ? sql`true` : sql`id < ${Number(page.cursor)}`}
      order by id desc
      limit ${page.limit + 1}
    `);
    const items = rows.slice(0, page.limit).map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > page.limit && last !== undefined ? String(last.id) : null,
    };
  }

  return {
    overview,
    listUsers,
    updateUserStatus,
    listBusinesses,
    updateBusiness,
    listReports,
    updateReport,
    listAudit,
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
