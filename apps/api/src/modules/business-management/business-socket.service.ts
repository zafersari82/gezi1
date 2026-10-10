import { BUSINESS_SOCKET_TTL_MS, type BusinessSocketTicket } from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { platformScope } from "../../core/platform-scope";
import { randomToken, sha256 } from "../../core/security";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import type { BusinessSocketAuth } from "../../realtime/realtime";

export function createBusinessSocketService({ db, platformDb, config }: AppContext) {
  function issue(scope: TenantScope, sessionId: string): Promise<BusinessSocketTicket> {
    // Olaylar alıcıya göre süzülerek gönderilir; personel yalnız izinli şubelerin olaylarını alır.
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      const session = await tx.maybeOne(sql`select id from sessions
        where id=${sessionId} and user_id=${scope.userId} and revoked_at is null and expires_at>now() for share`);
      if (session === null) throw new AppError("unauthorized");
      const ticket = randomToken();
      const row = await tx.one<{ expires_at: Date }>(sql`
        insert into business_socket_tickets(business_id,user_id,session_id,token_hash)
        values(${scope.businessId},${scope.userId},${sessionId},${sha256(ticket)}) returning expires_at`);
      return { ticket, expiresAt: row.expires_at.toISOString(), socketUrl: config.publicUrl };
    });
  }
  async function consume(ticket: string): Promise<BusinessSocketAuth> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new AppError("unauthorized");
    return platformScope(platformDb, async (tx) => {
      const row = await tx.maybeOne<{
        id: string;
        business_id: string;
        user_id: string;
        session_id: string;
      }>(sql`select id,business_id,user_id,session_id from business_socket_tickets
        where token_hash=${sha256(ticket)} and used_at is null and expires_at>now()`);
      if (row === null) throw new AppError("unauthorized");
      // Silme ile aynı kilit sırası: kullanıcı, üyelik, oturum, son olarak tek kullanımlık bilet.
      const user = await tx.maybeOne(
        sql`select id from users where id=${row.user_id} and status='active' for share`,
      );
      if (user === null) throw new AppError("unauthorized");
      const member =
        await tx.maybeOne(sql`select id from business_members where business_id=${row.business_id}
        and user_id=${row.user_id} and role in ('owner','manager','staff') and active for share`);
      if (member === null) throw new AppError("unauthorized");
      const session = await tx.maybeOne<{ expires_at: Date }>(sql`select expires_at from sessions
        where id=${row.session_id} and user_id=${row.user_id} and revoked_at is null and expires_at>now() for share`);
      if (session === null) throw new AppError("unauthorized");
      const consumed = await tx.maybeOne(sql`update business_socket_tickets set used_at=now()
        where id=${row.id} and used_at is null and expires_at>now() returning id`);
      if (consumed === null) throw new AppError("unauthorized");
      return {
        userId: row.user_id,
        sessionId: row.session_id,
        businessId: row.business_id,
        liveUntil: Math.min(Date.now() + BUSINESS_SOCKET_TTL_MS, session.expires_at.getTime()),
      };
    });
  }
  return { issue, consume };
}
