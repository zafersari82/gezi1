import {
  type CourierJob,
  courierJobContactSchema,
  courierJobSchema,
  type CourierMemberBody,
  type CourierPaymentBody,
  type CourierStepBody,
  type DeliveryAssignmentBody,
  isErrorCode,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { idempotencyBodyHash } from "../../core/idempotency";
import type { OrderingLifecycle } from "../../core/ordering-lifecycle";
import { appendEvent } from "../../core/outbox-events";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import { withUser } from "../../core/user-scope";
import { locationMutation } from "../../modules/location/location-mutation";
import { type CourierLiveRow, courierLiveView, createCourierLiveService } from "./courier-live";
import type { CourierScope, DeliveryProvider } from "./delivery-provider";
function readResult(value: unknown): CourierJob {
  if (typeof value === "object" && value !== null && "error" in value) {
    if (!isErrorCode(value.error)) throw new Error("Sağlayıcı bilinmeyen hata döndürdü");
    throw new AppError(value.error);
  }
  return courierJobSchema.parse(value);
}
export function createOwnCourierProvider(context: AppContext, lifecycle: OrderingLifecycle) {
  const { db } = context;
  const live = createCourierLiveService(context);
  const issued = new WeakSet<CourierScope>();
  async function withCourier<T>(
    scope: CourierScope,
    run: (tx: Database) => Promise<T>,
  ): Promise<T> {
    if (!issued.has(scope)) throw new AppError("forbidden");
    return withUser(db, scope.userId, async (tx) => {
      const context = await tx.one<{ business_id: string | null }>(
        sql`select nullif(current_setting('vado.business_id',true),'') as business_id`,
      );
      if (context.business_id !== null && context.business_id !== scope.businessId)
        throw new AppError("forbidden");
      await tx.execute(sql`select set_config('vado.business_id',${scope.businessId},true)`);
      const member = await tx.one<{ id: string | null }>(
        sql`select courier_lock_actor(${scope.businessId}) as id`,
      );
      if (member.id !== scope.memberId) throw new AppError("forbidden");
      return run(tx);
    });
  }
  const provider: DeliveryProvider = {
    id: "own",
    async authorise(userId, businessId) {
      return withUser(db, userId, async (tx) => {
        await tx.execute(sql`select set_config('vado.business_id',${businessId},true)`);
        const member = await tx.one<{ id: string | null }>(
          sql`select courier_current_member(${businessId}) as id`,
        );
        if (member.id === null) throw new AppError("forbidden");
        const scope = Object.freeze({ userId, businessId, memberId: member.id });
        issued.add(scope);
        return scope;
      });
    },
    assign(scope, orderId, key, body: DeliveryAssignmentBody) {
      requireBusinessRole(scope, ["owner", "manager"]);
      return withTenant(db, scope, (tx) =>
        locationMutation(
          tx,
          scope.userId,
          scope.businessId,
          `delivery.assign:${orderId}`,
          key,
          body,
          async () => {
            const result = await tx.one<{ result: unknown }>(
              sql`select courier_assign(${scope.businessId},${orderId},${body.memberId},${body.expectedVersion},${body.expectedOrderVersion}) as result`,
            );
            const job = readResult(result.result);
            await recordAudit(tx, {
              actor: scope.userId,
              action: "delivery.assigned",
              targetType: "courier_job",
              targetId: job.id,
              metadata: { businessId: scope.businessId, version: job.version },
            });
            return job;
          },
        ),
      );
    },
    jobs(scope) {
      return withCourier(scope, async (tx) => {
        const rows = await tx.many<{ result: unknown }>(
          sql`select courier_read_job(${scope.businessId},id,false) as result from courier_jobs where business_id=${scope.businessId} order by created_at,id`,
        );
        return rows.map((row) => readResult(row.result));
      });
    },
    job(scope, id) {
      return withCourier(scope, async (tx) => {
        const row = await tx.one<{ result: unknown }>(
          sql`select courier_read_job(${scope.businessId},${id},true) as result`,
        );
        if (row.result === null) throw new AppError("not_found");
        return courierJobContactSchema.parse(row.result);
      });
    },
    mutate(scope, id, key, operation, body: CourierStepBody | CourierPaymentBody) {
      return withCourier(scope, async (tx) => {
        const row = await tx.one<{ result: unknown }>(
          sql`select courier_mutate(${scope.businessId},${id},${operation},${key},${idempotencyBodyHash(body)},${JSON.stringify(body)}::jsonb) as result`,
        );
        const job = readResult(row.result);
        if (
          typeof row.result === "object" &&
          row.result !== null &&
          "applied" in row.result &&
          row.result.applied === true &&
          job.status === "completed" &&
          job.paid
        )
          await lifecycle.run("complete", tx, {
            businessId: scope.businessId,
            orderId: job.orderId,
            userId: scope.userId,
          });
        return job;
      });
    },
  };
  async function setMember(scope: TenantScope, key: string, body: CourierMemberBody) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, (tx) =>
      locationMutation(
        tx,
        scope.userId,
        scope.businessId,
        `delivery.member:${body.userId}`,
        key,
        body,
        async () => {
          const user = await tx.maybeOne(
            sql`select id from users where id=${body.userId} and status='active' for share`,
          );
          if (user === null) throw new AppError("user_not_found");
          const current = await tx.maybeOne<{ id: string; version: number; role: string }>(
            sql`select id,version,role from business_members where business_id=${scope.businessId} and user_id=${body.userId} for update`,
          );
          if (current !== null && current.role !== "courier") throw new AppError("forbidden");
          if ((current?.version ?? 0) !== body.expectedVersion)
            throw new AppError("settings_version_conflict");
          const row = await tx.one<{
            id: string;
            user_id: string;
            version: number;
            active: boolean;
          }>(
            sql`insert into business_members(business_id,user_id,role,active) values(${scope.businessId},${body.userId},'courier',${body.active}) on conflict(business_id,user_id) do update set active=excluded.active,version=business_members.version+1 returning *`,
          );
          await recordAudit(tx, {
            actor: scope.userId,
            action: "delivery.courier_updated",
            targetType: "business_member",
            targetId: row.id,
            metadata: { businessId: scope.businessId, version: row.version, active: row.active },
          });
          await appendEvent(tx, scope, {
            type: "delivery.courier_updated",
            aggregateId: row.id,
            sequence: row.version,
            payload: { memberId: row.id, version: row.version, active: row.active },
          });
          return { id: row.id, userId: row.user_id, version: row.version, active: row.active };
        },
      ),
    );
  }
  function members(scope: TenantScope) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const rows = await tx.many<{ id: string; user_id: string; version: number; active: boolean }>(
        sql`select id,user_id,version,active from business_members where business_id=${scope.businessId} and role='courier' order by created_at,id`,
      );
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        version: r.version,
        active: r.active,
      }));
    });
  }
  function issueTicket(scope: CourierScope, sessionId: string) {
    return withCourier(scope, (tx) => live.issue(tx, scope, sessionId));
  }
  function replay(scope: CourierScope, cursor: number) {
    return withCourier(scope, async (tx) => {
      const offset = await tx.maybeOne<{ value: number }>(
        sql`select value from courier_live_offsets where business_id=${scope.businessId}`,
      );
      const latest = offset?.value ?? 0;
      const first = await tx.one<{ value: number | null }>(
        sql`select min(cursor)::bigint as value from courier_live_events where business_id=${scope.businessId}`,
      );
      const reset = cursor > latest || (cursor !== 0 && cursor < (first.value ?? latest + 1) - 1);
      const rows = await tx.many<CourierLiveRow>(
        sql`select * from courier_live_events where business_id=${scope.businessId} and cursor>${reset ? 0 : cursor} and cursor<=${latest} order by cursor limit 500`,
      );
      return {
        items: rows.map(courierLiveView),
        cursor: rows.length === 500 ? (rows.at(-1)?.cursor ?? latest) : latest,
        reset,
      };
    });
  }
  return { ...provider, setMember, members, issueTicket, consumeTicket: live.consume, replay };
}
