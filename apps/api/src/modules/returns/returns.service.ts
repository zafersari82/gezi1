import {
  type PageQuery,
  type ReturnDecisionBody,
  type ReturnRequest,
  type ReturnRequestBody,
  returnRequestSchema,
  type ReturnWithdrawBody,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { TenantContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { OrderingLifecycle } from "../../core/ordering-lifecycle";
import { appendEvent } from "../../core/outbox-events";
import { withPlatformMutation } from "../../core/platform-mutations";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import type { OrderingService } from "../ordering/ordering.service";

interface RequestRow {
  id: string;
  business_id: string;
  order_id: string;
  app_instance_id: string;
  business_customer_id: string;
  order_version: number;
  kind: "cancel" | "refund";
  amount_minor: string | number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  decision_reason: string | null;
  member_id: string | null;
  version: number;
  created_at: Date;
  cursor_timestamp: string;
  updated_at: Date;
  receipt_method: "cash" | "card" | null;
  receipt_reference: string | null;
  receipt_amount: string | number | null;
  receipt_at: Date | null;
}
interface OrderFacts {
  id: string;
  status: string;
  version: number;
  total_minor: string | number;
  paid_minor: string | number;
  refunded_minor: string | number;
  last_sequence: number;
}

// İmleçte PostgreSQL'in mikrosaniye hassasiyetini koru; JS Date milisaniyeye indirger.
const SELECT = sql`select r.*,to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_timestamp,
  f.method as receipt_method,f.reference as receipt_reference,f.amount_minor as receipt_amount,f.created_at as receipt_at
  from order_return_requests r left join order_refunds f on f.business_id=r.business_id and f.request_id=r.id`;

/** Müşteri görünümü iç üye kimliğini taşımaz. */
function view(row: RequestRow, scope: TenantScope): ReturnRequest {
  return returnRequestSchema.parse({
    id: row.id,
    businessId: row.business_id,
    orderId: row.order_id,
    appInstanceId: row.app_instance_id,
    businessCustomerId: row.business_customer_id,
    orderVersion: row.order_version,
    kind: row.kind,
    amountMinor: Number(row.amount_minor),
    reason: row.reason,
    status: row.status,
    decisionReason: row.decision_reason,
    memberId: scope.role === "customer" ? null : row.member_id,
    version: row.version,
    receipt:
      row.receipt_method === null
        ? null
        : {
            method: row.receipt_method,
            reference: row.receipt_reference,
            amountMinor: Number(row.receipt_amount),
            createdAt: row.receipt_at?.toISOString(),
          },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}
function personal(scope: TenantScope) {
  if (
    scope.role !== "customer" ||
    scope.businessCustomerId === null ||
    scope.appInstanceId === null
  )
    throw new AppError("forbidden");
  return {
    userId: scope.userId,
    customerId: scope.businessCustomerId,
    instanceId: scope.appInstanceId,
  };
}

export function createReturnService(
  { db }: TenantContext,
  ordering: OrderingService,
  lifecycle: OrderingLifecycle,
) {
  async function facts(tx: Database, scope: TenantScope, orderId: string, lock: boolean) {
    const row = await tx.maybeOne<OrderFacts>(sql`
      select o.id,o.status,o.version,o.total_minor,
        (select coalesce(sum(amount_minor),0) from order_payments where business_id=o.business_id and order_id=o.id) as paid_minor,
        (select coalesce(sum(amount_minor),0) from order_refunds where business_id=o.business_id and order_id=o.id) as refunded_minor,
        (select coalesce(max(sequence),0) from order_refunds where business_id=o.business_id and order_id=o.id) as last_sequence
      from orders o where o.business_id=${scope.businessId} and o.id=${orderId} ${lock ? sql`for update` : sql.empty}`);
    if (row === null) throw new AppError("not_found");
    return row;
  }
  async function read(tx: Database, scope: TenantScope, id: string) {
    const row = await tx.maybeOne<RequestRow>(
      sql`${SELECT} where r.business_id=${scope.businessId} and r.id=${id}`,
    );
    if (row === null) throw new AppError("not_found");
    return view(row, scope);
  }
  async function memberOf(tx: Database, scope: TenantScope) {
    const member = await tx.maybeOne<{ id: string }>(
      sql`select id from business_members where business_id=${scope.businessId} and user_id=${scope.userId} and active and role in ('owner','manager')`,
    );
    if (member === null) throw new AppError("forbidden");
    return member.id;
  }
  async function announce(
    tx: Database,
    scope: TenantScope,
    value: ReturnRequest,
    type: string,
  ): Promise<ReturnRequest> {
    await recordAudit(tx, {
      actor: scope.userId ?? "device",
      action: type,
      targetType: "return_request",
      targetId: value.id,
      metadata: { businessId: scope.businessId, orderId: value.orderId, status: value.status },
    });
    await appendEvent(tx, scope, {
      aggregateId: value.id,
      orderId: value.orderId,
      sequence: value.version,
      type,
      payload: {
        id: value.id,
        orderId: value.orderId,
        status: value.status,
        version: value.version,
      },
    });
    return value;
  }

  /** Müşteri: kabul öncesi ödemesiz iptal doğrudan; sonrası yetkili karar bekleyen talep. */
  function create(scope: TenantScope, orderId: string, key: string, body: ReturnRequestBody) {
    const actor = personal(scope);
    return withTenant(db, scope, (tx) =>
      withPlatformMutation(
        tx,
        actor.userId,
        scope.businessId,
        `return/${orderId}`,
        key,
        body,
        async () => {
          if (
            (await tx.maybeOne(
              sql`select 1 where ordering_capabilities_for_instance(${scope.businessId},${actor.instanceId}) ? 'ordering.returns@1.0.0'`,
            )) === null
          )
            throw new AppError("fulfilment_unavailable");
          const owned = await tx.maybeOne(
            sql`select 1 from orders where business_id=${scope.businessId} and id=${orderId} and business_customer_id=${actor.customerId} and app_instance_id=${actor.instanceId}`,
          );
          if (owned === null) throw new AppError("not_found");
          const order = await facts(tx, scope, orderId, true);
          if (order.version !== body.expectedOrderVersion)
            throw new AppError("order_version_conflict");
          const paid = Number(order.paid_minor),
            refunded = Number(order.refunded_minor),
            total = Number(order.total_minor),
            open = Math.max(paid - refunded, 0);
          if (
            (await tx.maybeOne(
              sql`select 1 from order_return_requests where business_id=${scope.businessId} and order_id=${orderId} and status='pending'`,
            )) !== null
          )
            throw new AppError("order_state_invalid");
          let amount: number;
          if (body.kind === "cancel") {
            if (["completed", "cancelled", "rejected"].includes(order.status))
              throw new AppError("order_state_invalid");
            amount = open;
          } else {
            amount = body.amountMinor ?? 0;
            if (
              !["completed", "cancelled"].includes(order.status) ||
              (total > 0 && paid !== total) ||
              amount > open ||
              (amount === 0 && total !== 0)
            )
              throw new AppError("order_state_invalid");
          }
          const direct = body.kind === "cancel" && order.status === "placed" && paid === 0;
          const created = await tx.one<{ id: string }>(
            sql`insert into order_return_requests(business_id,order_id,app_instance_id,business_customer_id,order_version,kind,amount_minor,reason)
            values(${scope.businessId},${orderId},${actor.instanceId},${actor.customerId},${order.version},${body.kind},${amount},${body.reason}) returning id`,
          );
          if (direct) {
            await ordering.cancelForReturn(scope, orderId, order.version, tx);
            await tx.execute(
              sql`update order_return_requests set status='approved',decision_reason=${"Müşteri kabul öncesinde iptal etti"},version=version+1 where business_id=${scope.businessId} and id=${created.id}`,
            );
            return announce(tx, scope, await read(tx, scope, created.id), "return.approved");
          }
          return announce(tx, scope, await read(tx, scope, created.id), "return.requested");
        },
      ),
    );
  }

  function list(scope: TenantScope, orderId: string) {
    const actor = personal(scope);
    return withTenant(db, scope, async (tx) => {
      const rows = await tx.many<RequestRow>(
        sql`${SELECT} where r.business_id=${scope.businessId} and r.order_id=${orderId} and r.business_customer_id=${actor.customerId} and r.app_instance_id=${actor.instanceId} order by r.created_at desc,r.id desc`,
      );
      return { items: rows.map((row) => view(row, scope)) };
    });
  }

  /** İşletme: cursor "zaman|kimlik"; varsayılan olarak tüm talepler, yeniden eskiye. */
  function listForBusiness(scope: TenantScope, page: PageQuery, status?: string) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      let after = sql.empty;
      if (page.cursor !== undefined) {
        const [at, id] = page.cursor.split("|");
        if (at === undefined || id === undefined || Number.isNaN(Date.parse(at)))
          throw new AppError("validation_failed");
        after = sql`and (r.created_at,r.id)<(${at}::timestamptz,${id}::uuid)`;
      }
      const rows = await tx.many<RequestRow>(
        sql`${SELECT} where r.business_id=${scope.businessId} ${status === undefined ? sql.empty : sql`and r.status=${status}`} ${after}
          order by r.created_at desc,r.id desc limit ${page.limit + 1}`,
      );
      const items = rows.slice(0, page.limit),
        last = items.at(-1);
      return {
        items: items.map((row) => view(row, scope)),
        nextCursor:
          rows.length > page.limit && last !== undefined
            ? `${last.cursor_timestamp}|${last.id}`
            : null,
      };
    });
  }

  function withdraw(scope: TenantScope, id: string, key: string, body: ReturnWithdrawBody) {
    const actor = personal(scope);
    return withTenant(db, scope, (tx) =>
      withPlatformMutation(
        tx,
        actor.userId,
        scope.businessId,
        `return.withdraw/${id}`,
        key,
        body,
        async () => {
          const current = await tx.maybeOne<RequestRow>(
            sql`${SELECT} where r.business_id=${scope.businessId} and r.id=${id} and r.business_customer_id=${actor.customerId} and r.app_instance_id=${actor.instanceId} for update of r`,
          );
          if (current === null) throw new AppError("not_found");
          if (current.version !== body.expectedVersion)
            throw new AppError("record_version_conflict", { request: view(current, scope) });
          if (current.status !== "pending") throw new AppError("order_state_invalid");
          await tx.execute(
            sql`update order_return_requests set status='withdrawn',version=version+1 where business_id=${scope.businessId} and id=${id}`,
          );
          return announce(tx, scope, await read(tx, scope, id), "return.withdrawn");
        },
      ),
    );
  }

  /** Owner/manager: gerekçeli karar; fiziksel iade, iptal, sadakat ve olay aynı işlemde. */
  function decide(scope: TenantScope, id: string, key: string, body: ReturnDecisionBody) {
    requireBusinessRole(scope, ["owner", "manager"]);
    const userId = scope.userId;
    return withTenant(db, scope, (tx) =>
      withPlatformMutation(
        tx,
        userId,
        scope.businessId,
        `return.decision/${id}`,
        key,
        body,
        async () => {
          const current = await tx.maybeOne<RequestRow>(
            sql`${SELECT} where r.business_id=${scope.businessId} and r.id=${id} for update of r`,
          );
          if (current === null) throw new AppError("not_found");
          if (current.version !== body.expectedVersion)
            throw new AppError("record_version_conflict", { request: view(current, scope) });
          if (current.status !== "pending") throw new AppError("order_state_invalid");
          const memberId = await memberOf(tx, scope);
          const order = await facts(tx, scope, current.order_id, true);
          if (
            order.version !== body.expectedOrderVersion ||
            order.version !== current.order_version
          )
            throw new AppError("order_version_conflict");
          if (body.decision === "reject") {
            if (body.physicalRefund !== null) throw new AppError("validation_failed");
            await tx.execute(
              sql`update order_return_requests set status='rejected',decision_reason=${body.reason},member_id=${memberId},version=version+1 where business_id=${scope.businessId} and id=${id}`,
            );
            return announce(tx, scope, await read(tx, scope, id), "return.rejected");
          }
          const amount = Number(current.amount_minor);
          if (current.kind === "refund" || amount > 0) {
            if (body.physicalRefund === null) throw new AppError("order_state_invalid");
            const total = Number(order.total_minor),
              refunded = Number(order.refunded_minor);
            await tx.execute(
              sql`insert into order_refunds(business_id,order_id,sequence,amount_minor,full_refund,method,reference,member_id,request_id)
              values(${scope.businessId},${current.order_id},${order.last_sequence + 1},${amount},${refunded + amount === total},${body.physicalRefund.method},${body.physicalRefund.reference},${memberId},${id})`,
            );
            await lifecycle.run("refund", tx, {
              businessId: scope.businessId,
              orderId: current.order_id,
              userId,
            });
          } else if (body.physicalRefund !== null) throw new AppError("validation_failed");
          if (current.kind === "cancel")
            await ordering.cancelForReturn(scope, current.order_id, order.version, tx);
          await tx.execute(
            sql`update order_return_requests set status='approved',decision_reason=${body.reason},member_id=${memberId},version=version+1 where business_id=${scope.businessId} and id=${id}`,
          );
          return announce(tx, scope, await read(tx, scope, id), "return.approved");
        },
      ),
    );
  }
  return { create, list, listForBusiness, withdraw, decide };
}
export type ReturnService = ReturnType<typeof createReturnService>;
