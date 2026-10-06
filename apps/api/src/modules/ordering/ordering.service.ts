import { createHash } from "node:crypto";

import {
  type AcceptOrderBody,
  type ApiErrorBody,
  type Cart,
  type CheckoutCartBody,
  type Order,
  type OrderListQuery,
  type OrderSummary,
  type RecordOrderPaymentBody,
  type RejectOrderBody,
  type ReplaceCartBody,
  type ResetCartBody,
  TERMINAL_ORDER_STATES,
  type UpdateOrderStatusBody,
} from "@vado/contracts";

import type { TenantContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { withIdempotency } from "../../core/idempotency";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import type { CatalogService } from "../catalog/catalog.service";
import { type FulfilmentChoice, validateFulfilment } from "./fulfilment";

interface CartRow {
  id: string;
  business_id: string;
  branch_id: string;
  app_instance_id: string;
  business_customer_id: string;
  fulfilment: Cart["fulfilment"];
  table_session_id: string | null;
  scheduled_at: Date | null;
  status: Cart["status"];
  version: number;
  expires_at: Date;
}
interface CartLineRow {
  id: string;
  item_id: string;
  quantity: number;
  option_ids: string[];
  note: string;
  seen_unit_price_minor: number;
  seen_vat_basis_points: number;
}
interface OrderRow {
  id: string;
  business_id: string;
  cart_id: string;
  branch_id: string;
  app_instance_id: string;
  business_customer_id: string;
  fulfilment: Cart["fulfilment"];
  table_session_id: string | null;
  table_label?: string | null;
  scheduled_at: Date | null;
  status: string;
  version: number;
  total_minor: number;
  vat_minor: number;
  currency: "TRY";
  created_at: Date;
  updated_at: Date;
  preparation_minutes: number | null;
  estimated_ready_at: Date | null;
  rejection_reason: string | null;
  payment_paid?: boolean;
  state_graph: Record<string, string[]>;
  capabilities: string[];
}
interface OrderLineRow {
  id: string;
  item_id: string;
  name: string;
  quantity: number;
  note: string;
  base_price_minor: number;
  unit_price_minor: number;
  total_minor: number;
  vat_basis_points: number;
  vat_minor: number;
}
function customer(scope: TenantScope) {
  if (
    scope.role !== "customer" ||
    scope.appInstanceId === null ||
    scope.businessCustomerId === null
  )
    throw new AppError("forbidden");
  return { instanceId: scope.appInstanceId, customerId: scope.businessCustomerId };
}
function summary(row: OrderRow): OrderSummary {
  return {
    id: row.id,
    businessId: row.business_id,
    cartId: row.cart_id,
    branchId: row.branch_id,
    appInstanceId: row.app_instance_id,
    businessCustomerId: row.business_customer_id,
    fulfilment: row.fulfilment,
    tableSessionId: row.table_session_id,
    tableLabel: row.table_label ?? null,
    scheduledAt: row.scheduled_at?.toISOString() ?? null,
    preparationMinutes: row.preparation_minutes,
    estimatedReadyAt: row.estimated_ready_at?.toISOString() ?? null,
    rejectionReason: row.rejection_reason,
    paymentStatus: row.total_minor === 0 || row.payment_paid === true ? "paid" : "pending",
    paymentVersion: row.payment_paid === true ? 1 : 0,
    status: row.status,
    version: row.version,
    totalMinor: row.total_minor,
    vatMinor: row.vat_minor,
    currency: row.currency,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createOrderingService(
  { db }: TenantContext,
  catalog: CatalogService,
  permitTransition: (capabilities: readonly string[], from: string, to: string) => boolean,
) {
  async function expireOwned(tx: Database, scope: TenantScope): Promise<void> {
    const { instanceId, customerId } = customer(scope);
    await tx.execute(sql`update carts set status='expired',version=version+1 where business_id=${scope.businessId}
      and app_instance_id=${instanceId} and business_customer_id=${customerId} and status='open' and expires_at<=now()`);
  }
  async function requireCart(
    tx: Database,
    scope: TenantScope,
    id: string,
    lock = false,
  ): Promise<CartRow> {
    const { instanceId, customerId } = customer(scope);
    const row =
      await tx.maybeOne<CartRow>(sql`select * from carts where business_id=${scope.businessId} and id=${id}
      and app_instance_id=${instanceId} and business_customer_id=${customerId} ${lock ? sql`for update` : sql.empty}`);
    if (row === null) throw new AppError("not_found");
    return row;
  }
  async function cartView(tx: Database, scope: TenantScope, row: CartRow): Promise<Cart> {
    const stored = await tx.many<CartLineRow>(
      sql`select * from cart_lines where business_id=${scope.businessId} and cart_id=${row.id} order by position`,
    );
    const quote = await catalog.quote(
      tx,
      scope,
      row.branch_id,
      stored.map((line) => ({
        itemId: line.item_id,
        quantity: line.quantity,
        optionIds: line.option_ids,
        note: line.note,
      })),
      row.scheduled_at ?? new Date(),
    );
    const lines = quote.lines.map((line, index) => {
      const saved = stored[index];
      if (saved === undefined) throw new Error("Sepet fiyat görüntüsü eksik");
      return {
        ...line,
        id: saved.id,
        priceChanged:
          saved.seen_unit_price_minor !== line.unitPriceMinor ||
          saved.seen_vat_basis_points !== line.vatBasisPoints,
      };
    });
    const quoteHash = createHash("sha256")
      .update(
        JSON.stringify({
          businessId: scope.businessId,
          branchId: row.branch_id,
          fulfilment: row.fulfilment,
          tableSessionId: row.table_session_id,
          scheduledAt: row.scheduled_at?.toISOString() ?? null,
          lines: quote.lines,
        }),
      )
      .digest("hex");
    return {
      id: row.id,
      businessId: scope.businessId,
      branchId: row.branch_id,
      appInstanceId: row.app_instance_id,
      businessCustomerId: row.business_customer_id,
      fulfilment: row.fulfilment,
      tableSessionId: row.table_session_id,
      scheduledAt: row.scheduled_at?.toISOString() ?? null,
      status: row.status,
      version: row.version,
      expiresAt: row.expires_at.toISOString(),
      lines,
      totalMinor: quote.totalMinor,
      vatMinor: quote.vatMinor,
      currency: "TRY",
      quoteHash,
    };
  }
  function openCart(
    scope: TenantScope,
    branchId: string,
    choice: FulfilmentChoice = {
      fulfilment: "pickup",
      tableSessionId: null,
      scheduledAt: null,
    },
  ): Promise<Cart> {
    const { instanceId, customerId } = customer(scope);
    return withTenant(db, scope, async (tx) => {
      await expireOwned(tx, scope);
      const branch = await tx.maybeOne(
        sql`select id from branches where business_id=${scope.businessId} and id=${branchId} and active for share`,
      );
      if (branch === null) throw new AppError("not_found");
      await validateFulfilment(tx, scope, branchId, choice);
      for (let attempt = 0; attempt < 3; attempt++) {
        let row =
          await tx.maybeOne<CartRow>(sql`insert into carts(business_id,branch_id,app_instance_id,business_customer_id,fulfilment,table_session_id,scheduled_at)
          values(${scope.businessId},${branchId},${instanceId},${customerId},${choice.fulfilment},${choice.tableSessionId},${choice.scheduledAt})
          on conflict(business_id,app_instance_id,business_customer_id,branch_id) where status='open' do nothing returning *`);
        row ??=
          await tx.maybeOne<CartRow>(sql`select * from carts where business_id=${scope.businessId} and branch_id=${branchId}
          and app_instance_id=${instanceId} and business_customer_id=${customerId} and status='open' for update`);
        if (row !== null) {
          if (
            row.fulfilment !== choice.fulfilment ||
            row.table_session_id !== choice.tableSessionId ||
            (row.scheduled_at?.toISOString() ?? null) !== choice.scheduledAt
          )
            row = await tx.one<CartRow>(
              sql`update carts set fulfilment=${choice.fulfilment},table_session_id=${choice.tableSessionId},scheduled_at=${choice.scheduledAt},version=version+1 where business_id=${scope.businessId} and id=${row.id} returning *`,
            );
          return cartView(tx, scope, row);
        }
      }
      throw new AppError("cart_version_conflict");
    });
  }
  function getCart(scope: TenantScope, id: string): Promise<Cart> {
    customer(scope);
    return withTenant(db, scope, async (tx) => {
      await expireOwned(tx, scope);
      return cartView(tx, scope, await requireCart(tx, scope, id, true));
    });
  }
  function resetCart(scope: TenantScope, id: string, body: ResetCartBody): Promise<Cart> {
    customer(scope);
    return withTenant(db, scope, async (tx) => {
      const row = await requireCart(tx, scope, id, true);
      if (row.status === "checked_out") throw new AppError("cart_closed");
      if (row.status === "expired") return cartView(tx, scope, row);
      if (row.version !== body.expectedVersion)
        throw new AppError("cart_version_conflict", { cart: await cartView(tx, scope, row) });
      const expired = await tx.one<CartRow>(
        sql`update carts set status='expired',version=version+1 where business_id=${scope.businessId} and id=${id} returning *`,
      );
      return cartView(tx, scope, expired);
    });
  }
  async function replaceCart(scope: TenantScope, id: string, body: ReplaceCartBody): Promise<Cart> {
    customer(scope);
    try {
      return await withTenant(db, scope, async (tx) => {
        await expireOwned(tx, scope);
        const row = await requireCart(tx, scope, id, true);
        if (row.status === "expired") throw new AppError("cart_expired");
        if (row.status !== "open") throw new AppError("cart_closed");
        if (row.version !== body.expectedVersion)
          throw new AppError("cart_version_conflict", { cart: await cartView(tx, scope, row) });
        const quote = await catalog.quote(
          tx,
          scope,
          row.branch_id,
          body.lines.map((line) => ({
            ...line,
            note: line.note ?? "",
            optionIds: [...line.optionIds].sort(),
          })),
          row.scheduled_at ?? new Date(),
        );
        const updated = await tx.one<CartRow>(
          sql`update carts set version=version+1 where id=${id} and business_id=${scope.businessId} and version=${body.expectedVersion} returning *`,
        );
        await tx.execute(
          sql`delete from cart_lines where business_id=${scope.businessId} and cart_id=${id}`,
        );
        for (const [position, line] of quote.lines.entries()) {
          await tx.execute(sql`insert into cart_lines(business_id,cart_id,item_id,quantity,option_ids,seen_unit_price_minor,seen_vat_basis_points,position,note)
            values(${scope.businessId},${id},${line.itemId},${line.quantity},${line.optionIds}::uuid[],${line.unitPriceMinor},${line.vatBasisPoints},${position},${line.note ?? ""})`);
        }
        return cartView(tx, scope, updated);
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error.code === "23503" || error.code === "23514")
      )
        throw new AppError("validation_failed");
      throw error;
    }
  }
  async function readOrder(tx: Database, scope: TenantScope, id: string): Promise<Order> {
    const owned =
      scope.role === "customer"
        ? sql`and app_instance_id=${customer(scope).instanceId} and business_customer_id=${customer(scope).customerId}`
        : scope.role === "kitchen"
          ? sql`and branch_id=${scope.branchId} and app_instance_id=${scope.appInstanceId}`
          : sql.empty;
    const row = await tx.maybeOne<OrderRow>(
      sql`select orders.*,(select t.label from table_sessions s join restaurant_tables t on t.business_id=s.business_id and t.id=s.table_id where s.business_id=orders.business_id and s.id=orders.table_session_id) as table_label,exists(select 1 from order_payments p where p.business_id=orders.business_id and p.order_id=orders.id) as payment_paid from orders where business_id=${scope.businessId} and id=${id} ${owned} for share of orders`,
    );
    if (row === null) throw new AppError("not_found");
    const lines = await tx.many<OrderLineRow>(
      sql`select * from order_lines where business_id=${scope.businessId} and order_id=${id} order by position`,
    );
    const options = await tx.many<{
      order_line_id: string;
      option_id: string;
      name: string;
      price_delta_minor: number;
    }>(sql`select o.* from order_line_options o join order_lines l on l.business_id=o.business_id and l.id=o.order_line_id
      where l.business_id=${scope.businessId} and l.order_id=${id} order by o.option_id`);
    const history = await tx.many<{
      id: string;
      version: number;
      from_status: string | null;
      to_status: string;
      actor_kind: "customer" | "business" | "system" | "device";
      created_at: Date;
    }>(
      sql`select * from order_status_history where business_id=${scope.businessId} and order_id=${id} order by version`,
    );
    return {
      ...summary(row),
      stateGraph: row.state_graph,
      capabilities: row.capabilities,
      lines: lines.map((line) => ({
        id: line.id,
        itemId: line.item_id,
        name: line.name,
        quantity: line.quantity,
        note: line.note,
        basePriceMinor: line.base_price_minor,
        unitPriceMinor: line.unit_price_minor,
        totalMinor: line.total_minor,
        vatBasisPoints: line.vat_basis_points,
        vatMinor: line.vat_minor,
        options: options
          .filter((o) => o.order_line_id === line.id)
          .map((o) => ({ id: o.option_id, name: o.name, priceDeltaMinor: o.price_delta_minor })),
      })),
      history: history.map((h) => ({
        id: h.id,
        version: h.version,
        fromStatus: h.from_status,
        toStatus: h.to_status,
        actorKind: h.actor_kind,
        createdAt: h.created_at.toISOString(),
      })),
    };
  }
  function getOrder(scope: TenantScope, id: string): Promise<Order> {
    return withTenant(db, scope, (tx) => readOrder(tx, scope, id));
  }
  function checkout(scope: TenantScope, id: string, key: string, body: CheckoutCartBody) {
    const { customerId } = customer(scope);
    return withTenant(db, scope, (tx) =>
      withIdempotency<Order | ApiErrorBody>(
        tx,
        scope,
        "ordering.checkout",
        key,
        { cartId: id, ...body },
        async () => {
          await expireOwned(tx, scope);
          const row = await requireCart(tx, scope, id, true);
          if (row.status === "expired") throw new AppError("cart_expired");
          if (row.status !== "open") throw new AppError("cart_closed");
          await validateFulfilment(
            tx,
            scope,
            row.branch_id,
            {
              fulfilment: row.fulfilment,
              tableSessionId: row.table_session_id,
              scheduledAt: row.scheduled_at?.toISOString() ?? null,
            },
            true,
          );
          const cart = await cartView(tx, scope, row);
          if (
            cart.version !== body.cartVersion ||
            cart.totalMinor !== body.seenTotalMinor ||
            cart.quoteHash !== body.quoteHash ||
            cart.lines.length === 0 ||
            cart.lines.some((line) => !line.available)
          ) {
            const changed = new AppError("cart_changed", { cart });
            return {
              status: 409,
              body: {
                error: { code: changed.code, message: changed.message, details: changed.details },
              },
            };
          }
          await tx.execute(
            sql`select set_config('vado.order_actor_kind','customer',true),set_config('vado.order_actor_id',${customerId},true)`,
          );
          await tx.execute(
            sql`update carts set status='checked_out',version=version+1 where business_id=${scope.businessId} and id=${id} and version=${body.cartVersion}`,
          );
          const order = await tx.one<{
            id: string;
          }>(sql`insert into orders(business_id,cart_id,branch_id,app_instance_id,business_customer_id,fulfilment,total_minor,vat_minor,state_graph,capabilities,table_session_id,scheduled_at)
        values(${scope.businessId},${id},${row.branch_id},${row.app_instance_id},${customerId},${row.fulfilment},${cart.totalMinor},${cart.vatMinor},
          ordering_workflow_for_instance(${scope.businessId},${row.app_instance_id}),ordering_capabilities_for_instance(${scope.businessId},${row.app_instance_id}),${row.table_session_id},${row.scheduled_at}) returning id`);
          for (const [position, line] of cart.lines.entries()) {
            const saved = await tx.one<{
              id: string;
            }>(sql`insert into order_lines(business_id,order_id,item_id,name,quantity,base_price_minor,unit_price_minor,total_minor,vat_basis_points,vat_minor,position,note)
          values(${scope.businessId},${order.id},${line.itemId},${line.name},${line.quantity},${line.unitPriceMinor - line.options.reduce((sum, o) => sum + o.priceDeltaMinor, 0)},
            ${line.unitPriceMinor},${line.totalMinor},${line.vatBasisPoints},${line.vatMinor},${position},${line.note ?? ""}) returning id`);
            for (const option of line.options)
              await tx.execute(sql`insert into order_line_options(business_id,order_line_id,option_id,name,price_delta_minor)
          values(${scope.businessId},${saved.id},${option.id},${option.name},${option.priceDeltaMinor})`);
          }
          const result = await readOrder(tx, scope, order.id);
          return { status: 200, body: result };
        },
      ),
    );
  }
  function listOrders(scope: TenantScope, page: OrderListQuery, ascending = false) {
    return withTenant(db, scope, async (tx) => {
      const owned =
        scope.role === "customer"
          ? sql`and business_customer_id=${customer(scope).customerId} and app_instance_id=${customer(scope).instanceId}`
          : scope.role === "kitchen"
            ? sql`and branch_id=${scope.branchId} and app_instance_id=${scope.appInstanceId}`
            : sql.empty;
      const cursor =
        page.cursor === undefined
          ? sql.empty
          : ascending
            ? sql`and (created_at,id)>(select created_at,id from orders where business_id=${scope.businessId} and id=${page.cursor} ${owned})`
            : sql`and (created_at,id)<(select created_at,id from orders where business_id=${scope.businessId} and id=${page.cursor} ${owned})`;
      const status = page.status === undefined ? sql.empty : sql`and status=${page.status}`;
      const statuses =
        page.statuses === undefined ? sql.empty : sql`and status=any(${page.statuses}::text[])`;
      const active =
        page.active === undefined
          ? sql.empty
          : page.active
            ? sql`and not(status=any(${TERMINAL_ORDER_STATES}::text[]))`
            : sql`and status=any(${TERMINAL_ORDER_STATES}::text[])`;
      const filters = sql`${page.branchId === undefined ? sql.empty : sql`and branch_id=${page.branchId}`} ${page.appInstanceId === undefined ? sql.empty : sql`and app_instance_id=${page.appInstanceId}`}`;
      const sorting = ascending ? sql`created_at asc,id asc` : sql`created_at desc,id desc`;
      const rows = await tx.many<OrderRow>(
        sql`select orders.*,(select t.label from table_sessions s join restaurant_tables t on t.business_id=s.business_id and t.id=s.table_id where s.business_id=orders.business_id and s.id=orders.table_session_id) as table_label,exists(select 1 from order_payments p where p.business_id=orders.business_id and p.order_id=orders.id) as payment_paid from orders where business_id=${scope.businessId} ${owned} ${cursor} ${status} ${statuses} ${active} ${filters} order by ${sorting} limit ${page.limit + 1}`,
      );
      const items = rows.slice(0, page.limit).map(summary);
      return { items, nextCursor: rows.length > page.limit ? (items.at(-1)?.id ?? null) : null };
    });
  }
  async function listQueue(scope: TenantScope, page: OrderListQuery) {
    const list = await listOrders(scope, page, true);
    return withTenant(db, scope, async (tx) => ({
      items: await Promise.all(list.items.map((o) => readOrder(tx, scope, o.id))),
      nextCursor: list.nextCursor,
    }));
  }
  function updateStatus(
    scope: TenantScope,
    id: string,
    body: UpdateOrderStatusBody,
    decision?: { preparationMinutes?: number; reason?: string },
  ): Promise<Order> {
    if (scope.role !== "kitchen") requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      let actorId: string;
      if (scope.role === "kitchen") actorId = scope.deviceId;
      else {
        const actor = await tx.maybeOne<{ id: string }>(
          sql`select id from business_members where business_id=${scope.businessId} and user_id=${scope.userId} and role=${scope.role} and active for share`,
        );
        if (actor === null) throw new AppError("forbidden");
        actorId = actor.id;
      }
      const deviceFilter =
        scope.role === "kitchen"
          ? sql`and branch_id=${scope.branchId} and app_instance_id=${scope.appInstanceId}`
          : sql.empty;
      const row = await tx.maybeOne<OrderRow>(
        sql`select * from orders where business_id=${scope.businessId} and id=${id} ${deviceFilter} for update`,
      );
      if (row === null) throw new AppError("not_found");
      if (
        scope.role === "kitchen" &&
        (!row.capabilities.includes("ordering.kitchen@1.0.0") ||
          !["accepted", "rejected", "preparing", "ready", "completed"].includes(body.status))
      )
        throw new AppError("forbidden");
      if (row.version !== body.expectedVersion)
        throw new AppError("order_version_conflict", { order: await readOrder(tx, scope, id) });
      if (
        !row.state_graph[row.status]?.includes(body.status) ||
        !permitTransition(row.capabilities, row.status, body.status)
      )
        throw new AppError("order_state_invalid");
      if (
        row.capabilities.includes("ordering.kitchen@1.0.0") &&
        ((body.status === "accepted" && decision?.preparationMinutes === undefined) ||
          (body.status === "rejected" && decision?.reason === undefined))
      )
        throw new AppError("order_decision_required");
      if (
        ["cancelled", "rejected"].includes(body.status) &&
        (await tx.maybeOne(
          sql`select 1 from order_payments where business_id=${scope.businessId} and order_id=${id}`,
        )) !== null
      )
        throw new AppError("order_state_invalid");
      const readyAt =
        decision?.preparationMinutes === undefined
          ? row.estimated_ready_at
          : new Date(
              Math.max(
                Date.now() + decision.preparationMinutes * 60_000,
                row.scheduled_at?.getTime() ?? 0,
              ),
            );
      await tx.execute(
        sql`select set_config('vado.order_actor_kind',${scope.role === "kitchen" ? "device" : "business"},true),set_config('vado.order_actor_id',${actorId},true)`,
      );
      await tx.execute(
        sql`update orders set status=${body.status},version=version+1,preparation_minutes=${decision?.preparationMinutes ?? row.preparation_minutes},estimated_ready_at=${readyAt},rejection_reason=${decision?.reason ?? row.rejection_reason} where business_id=${scope.businessId} and id=${id} and version=${body.expectedVersion}`,
      );
      return readOrder(tx, scope, id);
    });
  }
  function accept(scope: TenantScope, id: string, body: AcceptOrderBody) {
    return updateStatus(
      scope,
      id,
      { expectedVersion: body.expectedVersion, status: "accepted" },
      { preparationMinutes: body.preparationMinutes },
    );
  }
  function reject(scope: TenantScope, id: string, body: RejectOrderBody) {
    return updateStatus(
      scope,
      id,
      { expectedVersion: body.expectedVersion, status: "rejected" },
      { reason: body.reason },
    );
  }
  function recordPayment(scope: TenantScope, id: string, body: RecordOrderPaymentBody) {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      const row = await tx.maybeOne<OrderRow>(
        sql`select * from orders where business_id=${scope.businessId} and id=${id} for update`,
      );
      if (row === null) throw new AppError("not_found");
      const order = await readOrder(tx, scope, id);
      if (order.paymentVersion !== body.expectedPaymentVersion || order.paymentStatus === "paid")
        throw new AppError("payment_version_conflict", { order });
      if (
        ["placed", "rejected", "cancelled"].includes(row.status) ||
        (body.place === "table" && row.fulfilment !== "dine_in")
      )
        throw new AppError("order_state_invalid");
      const actor = await tx.one<{ id: string }>(
        sql`select id from business_members where business_id=${scope.businessId} and user_id=${scope.userId} and active`,
      );
      await tx.execute(
        sql`insert into order_payments(business_id,order_id,amount_minor,place,method,member_id) values(${scope.businessId},${id},${row.total_minor},${body.place},${body.method},${actor.id})`,
      );
      return readOrder(tx, scope, id);
    });
  }
  return {
    openCart,
    getCart,
    resetCart,
    replaceCart,
    checkout,
    getOrder,
    listOrders,
    listQueue,
    updateStatus,
    accept,
    reject,
    recordPayment,
  };
}
export type OrderingService = ReturnType<typeof createOrderingService>;
