import {
  BUSINESS_SOCKET_TTL_MS,
  type BusinessSocketTicket,
  type CourierLiveEvent,
  courierLiveEventSchema,
} from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { OutboxConsumer } from "../../core/outbox-worker";
import { platformScope } from "../../core/platform-scope";
import { randomToken, sha256 } from "../../core/security";
import type { CourierSocketAuth } from "../../realtime/realtime";
import type { CourierScope } from "./delivery-provider";
export interface CourierLiveRow {
  business_id: string;
  event_id: string;
  job_id: string;
  cursor: number;
  version: number;
  type: string;
}
export const courierLiveView = (r: CourierLiveRow): CourierLiveEvent =>
  courierLiveEventSchema.parse({
    businessId: r.business_id,
    eventId: r.event_id,
    jobId: r.job_id,
    cursor: r.cursor,
    version: r.version,
    type: r.type,
  });
export function createCourierLiveService({ platformDb, config }: AppContext) {
  async function issue(
    tx: Database,
    scope: CourierScope,
    sessionId: string,
  ): Promise<BusinessSocketTicket> {
    const ticket = randomToken();
    const row = await tx.one<{ expires_at: Date }>(
      sql`insert into courier_socket_tickets(business_id,user_id,session_id,token_hash) values(${scope.businessId},${scope.userId},${sessionId},${sha256(ticket)}) returning expires_at`,
    );
    return { ticket, expiresAt: row.expires_at.toISOString(), socketUrl: config.publicUrl };
  }
  async function consume(ticket: string): Promise<CourierSocketAuth> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new AppError("unauthorized");
    return platformScope(platformDb, async (tx) => {
      const row = await tx.maybeOne<{
        id: string;
        business_id: string;
        user_id: string;
        session_id: string;
      }>(
        sql`select id,business_id,user_id,session_id from courier_socket_tickets where token_hash=${sha256(ticket)} and used_at is null and expires_at>now()`,
      );
      if (row === null) throw new AppError("unauthorized");
      const user = await tx.maybeOne(
        sql`select id from users where id=${row.user_id} and status='active' for share`,
      );
      if (user === null) throw new AppError("unauthorized");
      const member = await tx.maybeOne(
        sql`select m.id from business_members m join businesses b on b.id=m.business_id join users owner on owner.id=b.owner_id where m.business_id=${row.business_id} and m.user_id=${row.user_id} and m.active and m.role='courier' and b.status='active' and b.verified and owner.status='active' for share of m,b,owner`,
      );
      if (member === null) throw new AppError("unauthorized");
      const session = await tx.maybeOne<{ expires_at: Date }>(
        sql`select expires_at from sessions where id=${row.session_id} and user_id=${row.user_id} and revoked_at is null and expires_at>now() for share`,
      );
      if (session === null) throw new AppError("unauthorized");
      const used = await tx.maybeOne(
        sql`update courier_socket_tickets set used_at=now() where id=${row.id} and used_at is null and expires_at>now() returning id`,
      );
      if (used === null) throw new AppError("unauthorized");
      return {
        kind: "courier",
        businessId: row.business_id,
        userId: row.user_id,
        sessionId: row.session_id,
        liveUntil: Math.min(Date.now() + BUSINESS_SOCKET_TTL_MS, session.expires_at.getTime()),
      };
    });
  }
  return { issue, consume };
}
export function createCourierLiveConsumer({ platformDb, realtime }: AppContext): OutboxConsumer {
  return {
    name: "delivery.courier.live",
    kind: "external",
    types: [
      "order.status_changed",
      "order.payment_recorded",
      "delivery.assigned",
      "delivery.departed",
      "delivery.completed",
      "delivery.cancelled",
    ],
    async deliver(event) {
      if (event.businessId === null) return;
      const row = await platformScope(platformDb, (tx) =>
        tx.maybeOne<CourierLiveRow & { user_id: string }>(
          sql`select e.*,m.user_id from courier_live_events e join courier_jobs j on j.business_id=e.business_id and j.id=e.job_id and j.member_id=e.member_id join orders o on o.business_id=j.business_id and o.id=j.order_id join business_members m on m.business_id=j.business_id and m.id=j.member_id join users u on u.id=m.user_id join businesses b on b.id=m.business_id join users owner on owner.id=b.owner_id where e.business_id=${event.businessId} and e.event_id=${event.id} and j.status in ('assigned','in_transit') and o.status not in ('completed','cancelled','rejected') and m.role='courier' and m.active and u.status='active' and b.status='active' and b.verified and owner.status='active'`,
        ),
      );
      if (row !== null) realtime.emitCourier(row.business_id, row.user_id, courierLiveView(row));
    },
  };
}
