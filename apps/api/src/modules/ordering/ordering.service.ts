import { createHash } from "node:crypto";

import {
  type AcceptOrderBody,
  type ApiErrorBody,
  type ApplyCartIncentivesBody,
  type BranchPerformance,
  type Cart,
  type CheckoutCartBody,
  type IncentiveChoice,
  incentiveChoiceSchema,
  incentiveQuoteSchema,
  type Order,
  type OrderListQuery,
  type OrderSummary,
  type RecordOrderPaymentBody,
  type RejectOrderBody,
  type ReorderBody,
  type ReorderResult,
  type ReplaceCartBody,
  type ResetCartBody,
  TERMINAL_ORDER_STATES,
  type UpdateOrderStatusBody,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import { permittedBranch } from "../../core/business-access";
import type { TenantContext } from "../../core/context";
import { type Database, sql, type SqlFragment } from "../../core/database";
import { AppError } from "../../core/errors";
import { withIdempotency } from "../../core/idempotency";
import type { OrderingLifecycle } from "../../core/ordering-lifecycle";
import type { OrderPricing } from "../../core/ordering-pricing";
import { appendEvent } from "../../core/outbox-events";
import { withPlatformMutation } from "../../core/platform-mutations";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import type { CatalogService } from "../catalog/catalog.service";
import { quoteDelivery } from "../delivery/delivery-policy";
import { type createFulfilmentValidator, type FulfilmentChoice } from "./fulfilment";

interface CartRow {
  incentive_choice: IncentiveChoice;
  address_id: string | null;
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
  incentive_snapshot: unknown;
  branch_timezone: string;
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
  discount_minor: number;
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
/** Müşteri ve operasyon cihazı kendi sahiplik süzgecini ayrıca uygular; işletme üyesi yalnız izinli şubeleri görür. */
function memberOrders(
  scope: TenantScope,
  permission: "orders.view" | "orders.manage",
): SqlFragment {
  if (scope.role === "customer" || scope.role === "device") return sql.empty;
  return permittedBranch(scope, permission, sql`orders.branch_id`);
}
function summary(row: OrderRow): OrderSummary {
  return {
    branchTimezone: row.branch_timezone,
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

/** Paketlerin sipariş işletimine kattığı kurallar; çekirdek paket adlarını bilmez. */
export interface OrderRules {
  permitTransition: (
    capabilities: readonly string[],
    from: string,
    to: string,
    fulfilment?: Cart["fulfilment"],
  ) => boolean;
  deviceMaySetStatus: (capabilities: readonly string[], status: string) => boolean;
  decisionRequired: (capabilities: readonly string[]) => boolean;
}

export function createOrderingService(
  { db }: TenantContext,
  catalog: CatalogService,
  rules: OrderRules,
  validateFulfilment: ReturnType<typeof createFulfilmentValidator>,
  lifecycle: OrderingLifecycle,
  priceOrder: OrderPricing,
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
  async function cartView(
    tx: Database,
    scope: TenantScope,
    row: CartRow,
    lockIncentives = false,
  ): Promise<Cart> {
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
    const baseLines = quote.lines.map((line, index) => {
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
    const priced = await priceOrder(tx, scope, {
      cartId: row.id,
      branchId: row.branch_id,
      choice: incentiveChoiceSchema.parse(row.incentive_choice),
      lines: baseLines,
      lock: lockIncentives,
    });
    const lines = priced.lines;
    const delivery =
      row.fulfilment === "delivery" && row.address_id !== null
        ? await quoteDelivery(
            tx,
            scope,
            row.branch_id,
            row.address_id,
            row.scheduled_at?.toISOString() ?? null,
          )
        : null;
    const quoteHash = createHash("sha256")
      .update(
        JSON.stringify({
          businessId: scope.businessId,
          branchId: row.branch_id,
          fulfilment: row.fulfilment,
          tableSessionId: row.table_session_id,
          scheduledAt: row.scheduled_at?.toISOString() ?? null,
          lines,
          incentives: priced.incentives,
          delivery,
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
      addressId: row.address_id,
      tableSessionId: row.table_session_id,
      scheduledAt: row.scheduled_at?.toISOString() ?? null,
      status: row.status,
      version: row.version,
      expiresAt: row.expires_at.toISOString(),
      lines,
      totalMinor: lines.reduce((sum, line) => sum + line.totalMinor, 0) + (delivery?.feeMinor ?? 0),
      incentives: priced.incentives,
      delivery:
        delivery === null
          ? null
          : {
              areaId: delivery.areaId,
              areaVersion: delivery.areaVersion,
              regionVersion: delivery.regionVersion,
              feeMinor: delivery.feeMinor,
              minimumMinor: delivery.minimumMinor,
              deliveryMinutes: delivery.deliveryMinutes,
              preparationMinutes: delivery.preparationMinutes,
              slotMinutes: delivery.slotMinutes,
              scheduledAt: delivery.scheduledAt,
            },
      vatMinor: lines.reduce((sum, line) => sum + line.vatMinor, 0),
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
    connection: Database = db,
  ): Promise<Cart> {
    const { instanceId, customerId } = customer(scope);
    return withTenant(connection, scope, async (tx) => {
      await expireOwned(tx, scope);
      const branch = await tx.maybeOne(
        sql`select id from branches where business_id=${scope.businessId} and id=${branchId} and active for share`,
      );
      if (branch === null) throw new AppError("not_found");
      await validateFulfilment(tx, scope, branchId, choice);
      for (let attempt = 0; attempt < 3; attempt++) {
        let row =
          await tx.maybeOne<CartRow>(sql`insert into carts(business_id,branch_id,app_instance_id,business_customer_id,fulfilment,table_session_id,scheduled_at,address_id)
          values(${scope.businessId},${branchId},${instanceId},${customerId},${choice.fulfilment},${choice.tableSessionId},${choice.scheduledAt},${choice.addressId ?? null})
          on conflict(business_id,app_instance_id,business_customer_id,branch_id) where status='open' do nothing returning *`);
        row ??=
          await tx.maybeOne<CartRow>(sql`select * from carts where business_id=${scope.businessId} and branch_id=${branchId}
          and app_instance_id=${instanceId} and business_customer_id=${customerId} and status='open' for update`);
        if (row !== null) {
          if (
            row.address_id !== (choice.addressId ?? null) ||
            row.fulfilment !== choice.fulfilment ||
            row.table_session_id !== choice.tableSessionId ||
            (row.scheduled_at?.toISOString() ?? null) !== choice.scheduledAt
          )
            row = await tx.one<CartRow>(
              sql`update carts set address_id=${choice.addressId ?? null},fulfilment=${choice.fulfilment},table_session_id=${choice.tableSessionId},scheduled_at=${choice.scheduledAt},version=version+1 where business_id=${scope.businessId} and id=${row.id} returning *`,
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
  async function replaceCart(
    scope: TenantScope,
    id: string,
    body: ReplaceCartBody,
    connection: Database = db,
  ): Promise<Cart> {
    customer(scope);
    try {
      return await withTenant(connection, scope, async (tx) => {
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
  function applyIncentives(
    scope: TenantScope,
    id: string,
    key: string,
    body: ApplyCartIncentivesBody,
  ): Promise<Cart> {
    customer(scope);
    if (scope.userId === null) throw new AppError("forbidden");
    const userId = scope.userId;
    return withTenant(db, scope, (tx) =>
      withPlatformMutation(
        tx,
        userId,
        scope.businessId,
        `ordering.incentives:${id}`,
        key,
        body,
        async () => {
          await expireOwned(tx, scope);
          const row = await requireCart(tx, scope, id, true);
          if (row.status !== "open")
            throw new AppError(row.status === "expired" ? "cart_expired" : "cart_closed");
          if (row.version !== body.expectedVersion)
            throw new AppError("cart_version_conflict", { cart: await cartView(tx, scope, row) });
          const choice = { couponCode: body.couponCode, pointsToSpend: body.pointsToSpend };
          const preview = await cartView(tx, scope, { ...row, incentive_choice: choice }, true);
          for (const issue of preview.incentives?.issues ?? []) {
            throw new AppError(
              issue === "stack_forbidden"
                ? "incentive_stack_forbidden"
                : issue === "loyalty_insufficient"
                  ? "loyalty_insufficient"
                  : "incentive_unavailable",
            );
          }
          const updated = await tx.one<CartRow>(
            sql`update carts set incentive_choice=${JSON.stringify(choice)}::jsonb,version=version+1 where business_id=${scope.businessId} and id=${id} returning *`,
          );
          await recordAudit(tx, {
            actor: userId,
            action: "incentive.cart_updated",
            targetType: "cart",
            targetId: id,
            metadata: { businessId: scope.businessId, version: updated.version },
          });
          await appendEvent(tx, scope, {
            type: "cart.incentives_changed",
            aggregateId: id,
            sequence: updated.version,
            payload: { cartId: id, version: updated.version },
          });
          return cartView(tx, scope, updated);
        },
      ),
    );
  }
  async function readOrder(tx: Database, scope: TenantScope, id: string): Promise<Order> {
    const owned =
      scope.role === "customer"
        ? sql`and app_instance_id=${customer(scope).instanceId} and business_customer_id=${customer(scope).customerId}`
        : scope.role === "device"
          ? sql`and branch_id=${scope.branchId} and app_instance_id=${scope.appInstanceId}`
          : sql.empty;
    const row = await tx.maybeOne<OrderRow>(
      sql`select orders.*,(select b.timezone from branches b where b.business_id=orders.business_id and b.id=orders.branch_id) as branch_timezone,(select t.label from table_sessions s join restaurant_tables t on t.business_id=s.business_id and t.id=s.table_id where s.business_id=orders.business_id and s.id=orders.table_session_id) as table_label,exists(select 1 from order_payments p where p.business_id=orders.business_id and p.order_id=orders.id) as payment_paid from orders where business_id=${scope.businessId} and id=${id} ${owned} ${memberOrders(scope, "orders.view")} for share of orders`,
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
    const payment = await tx.maybeOne<{
      id: string;
      amount_minor: number;
      place: "table" | "counter" | "delivery";
      method: "cash" | "card";
      member_id: string;
      reference: string | null;
      created_at: Date;
    }>(sql`select * from order_payments where business_id=${scope.businessId} and order_id=${id}`);
    return {
      ...summary(row),
      incentives:
        row.incentive_snapshot === null ? null : incentiveQuoteSchema.parse(row.incentive_snapshot),
      payment:
        payment === null
          ? null
          : {
              id: payment.id,
              amountMinor: payment.amount_minor,
              place: payment.place,
              method: payment.method,
              memberId: payment.member_id,
              reference: payment.reference,
              createdAt: payment.created_at.toISOString(),
            },
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
        discountMinor: line.discount_minor,
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
    return withTenant(db, scope, async (tx) => {
      const response = await withIdempotency<
        (Omit<Order, "branchTimezone"> & { branchTimezone?: string }) | ApiErrorBody
      >(tx, scope, "ordering.checkout", key, { cartId: id, ...body }, async () => {
        await expireOwned(tx, scope);
        const row = await requireCart(tx, scope, id, true);
        if (row.status === "expired") throw new AppError("cart_expired");
        if (row.status !== "open") throw new AppError("cart_closed");
        await validateFulfilment(
          tx,
          scope,
          row.branch_id,
          {
            addressId: row.address_id,
            fulfilment: row.fulfilment,
            tableSessionId: row.table_session_id,
            scheduledAt: row.scheduled_at?.toISOString() ?? null,
          },
          true,
        );
        const cart = await cartView(tx, scope, row, true);
        if (
          cart.version !== body.cartVersion ||
          cart.totalMinor !== body.seenTotalMinor ||
          cart.quoteHash !== body.quoteHash ||
          cart.lines.length === 0 ||
          (cart.incentives?.issues.length ?? 0) > 0 ||
          cart.lines.some((line) => !line.available) ||
          (cart.delivery !== null &&
            cart.delivery !== undefined &&
            cart.totalMinor - cart.delivery.feeMinor < cart.delivery.minimumMinor)
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
        }>(sql`insert into orders(business_id,cart_id,branch_id,app_instance_id,business_customer_id,fulfilment,total_minor,vat_minor,state_graph,capabilities,table_session_id,scheduled_at,delivery_fee_minor,incentive_snapshot)
        values(${scope.businessId},${id},${row.branch_id},${row.app_instance_id},${customerId},${row.fulfilment},${cart.totalMinor},${cart.vatMinor},
          ordering_workflow_for_fulfilment(${scope.businessId},${row.app_instance_id},${row.fulfilment}),ordering_capabilities_for_instance(${scope.businessId},${row.app_instance_id}),${row.table_session_id},${row.scheduled_at},${cart.delivery?.feeMinor ?? 0},${JSON.stringify(cart.incentives)}::jsonb) returning id`);
        for (const [position, line] of cart.lines.entries()) {
          const saved = await tx.one<{
            id: string;
          }>(sql`insert into order_lines(business_id,order_id,item_id,name,quantity,base_price_minor,unit_price_minor,total_minor,vat_basis_points,vat_minor,position,note,discount_minor)
          values(${scope.businessId},${order.id},${line.itemId},${line.name},${line.quantity},${line.unitPriceMinor - line.options.reduce((sum, o) => sum + o.priceDeltaMinor, 0)},
            ${line.unitPriceMinor},${line.totalMinor},${line.vatBasisPoints},${line.vatMinor},${position},${line.note ?? ""},${line.discountMinor ?? 0}) returning id`);
          for (const option of line.options)
            await tx.execute(sql`insert into order_line_options(business_id,order_line_id,option_id,name,price_delta_minor)
          values(${scope.businessId},${saved.id},${option.id},${option.name},${option.priceDeltaMinor})`);
        }
        if (cart.delivery && row.address_id !== null) {
          const delivery = await quoteDelivery(
            tx,
            scope,
            row.branch_id,
            row.address_id,
            row.scheduled_at?.toISOString() ?? null,
          );
          await tx.execute(
            sql`insert into delivery_order_snapshots(business_id,order_id,snapshot) values(${scope.businessId},${order.id},${JSON.stringify(delivery)}::jsonb)`,
          );
        }
        await lifecycle.run("reserve", tx, {
          businessId: scope.businessId,
          orderId: order.id,
          userId: scope.userId,
        });
        const result = await readOrder(tx, scope, order.id);
        return { status: 200, body: result };
      });
      // Eski tekrar görüntüsü değişmez; yalnız eksik saat dilimi yanıt kopyasına eklenir.
      if (
        response.status === 200 &&
        "branchId" in response.body &&
        response.body.branchTimezone === undefined
      ) {
        const branch = await tx.maybeOne<{ timezone: string }>(
          sql`select b.timezone from branches b join orders o on o.business_id=b.business_id and o.branch_id=b.id where b.business_id=${scope.businessId} and b.id=${response.body.branchId} and o.id=${response.body.id} and o.app_instance_id=${scope.appInstanceId} and o.business_customer_id=${customerId}`,
        );
        if (branch === null) throw new AppError("not_found");
        return { ...response, body: { ...response.body, branchTimezone: branch.timezone } };
      }
      return response;
    });
  }
  function listOrders(scope: TenantScope, page: OrderListQuery, ascending = false) {
    return withTenant(db, scope, async (tx) => {
      const owned =
        scope.role === "customer"
          ? sql`and business_customer_id=${customer(scope).customerId} and app_instance_id=${customer(scope).instanceId}`
          : scope.role === "device"
            ? sql`and branch_id=${scope.branchId} and app_instance_id=${scope.appInstanceId}`
            : sql.empty;
      const cursor =
        page.cursor === undefined
          ? sql.empty
          : ascending
            ? sql`and (created_at,id)>(select created_at,id from orders where business_id=${scope.businessId} and id=${page.cursor} ${owned} ${memberOrders(scope, "orders.view")})`
            : sql`and (created_at,id)<(select created_at,id from orders where business_id=${scope.businessId} and id=${page.cursor} ${owned} ${memberOrders(scope, "orders.view")})`;
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
        sql`select orders.*,(select b.timezone from branches b where b.business_id=orders.business_id and b.id=orders.branch_id) as branch_timezone,(select t.label from table_sessions s join restaurant_tables t on t.business_id=s.business_id and t.id=s.table_id where s.business_id=orders.business_id and s.id=orders.table_session_id) as table_label,exists(select 1 from order_payments p where p.business_id=orders.business_id and p.order_id=orders.id) as payment_paid from orders where business_id=${scope.businessId} ${owned} ${memberOrders(scope, "orders.view")} ${cursor} ${status} ${statuses} ${active} ${filters} order by ${sorting} limit ${page.limit + 1}`,
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
    connection: Database = db,
  ): Promise<Order> {
    if (body.status === "cancelled") requireBusinessRole(scope, ["owner", "manager"]);
    if (scope.role !== "device") requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(connection, scope, async (tx) => {
      let actorId: string;
      if (scope.role === "device") actorId = scope.deviceId;
      else {
        const actor = await tx.maybeOne<{ id: string }>(
          sql`select id from business_members where business_id=${scope.businessId} and user_id=${scope.userId} and role=${scope.role} and active for share`,
        );
        if (actor === null) throw new AppError("forbidden");
        actorId = actor.id;
      }
      const deviceFilter =
        scope.role === "device"
          ? sql`and branch_id=${scope.branchId} and app_instance_id=${scope.appInstanceId}`
          : sql.empty;
      const row = await tx.maybeOne<OrderRow>(
        sql`select * from orders where business_id=${scope.businessId} and id=${id} ${deviceFilter} ${memberOrders(scope, "orders.manage")} for update`,
      );
      if (row === null) throw new AppError("not_found");
      if (scope.role === "device" && !rules.deviceMaySetStatus(row.capabilities, body.status))
        throw new AppError("forbidden");
      if (row.version !== body.expectedVersion)
        throw new AppError("order_version_conflict", { order: await readOrder(tx, scope, id) });
      if (
        !row.state_graph[row.status]?.includes(body.status) ||
        !rules.permitTransition(row.capabilities, row.status, body.status, row.fulfilment)
      )
        throw new AppError("order_state_invalid");
      if (
        rules.decisionRequired(row.capabilities) &&
        ((body.status === "accepted" && decision?.preparationMinutes === undefined) ||
          (body.status === "rejected" && decision?.reason === undefined))
      )
        throw new AppError("order_decision_required");
      if (
        ["cancelled", "rejected"].includes(body.status) &&
        (await tx.maybeOne(
          sql`select 1 from order_payments p where p.business_id=${scope.businessId} and p.order_id=${id} and (${body.status}='rejected' or p.amount_minor>(select coalesce(sum(r.amount_minor),0) from order_refunds r where r.business_id=p.business_id and r.order_id=p.order_id))`,
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
        sql`select set_config('vado.order_actor_kind',${scope.role === "device" ? "device" : "business"},true),set_config('vado.order_actor_id',${actorId},true)`,
      );
      await tx.execute(
        sql`update orders set status=${body.status},version=version+1,preparation_minutes=${decision?.preparationMinutes ?? row.preparation_minutes},estimated_ready_at=${readyAt},rejection_reason=${decision?.reason ?? row.rejection_reason} where business_id=${scope.businessId} and id=${id} and version=${body.expectedVersion}`,
      );
      const result = await readOrder(tx, scope, id);
      if (body.status === "completed" && result.paymentStatus === "paid")
        await lifecycle.run("complete", tx, {
          businessId: scope.businessId,
          orderId: id,
          userId: scope.userId,
        });
      if (body.status === "cancelled" || body.status === "rejected")
        await lifecycle.run("cancel", tx, {
          businessId: scope.businessId,
          orderId: id,
          userId: scope.userId,
        });
      return result;
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
        sql`select * from orders where business_id=${scope.businessId} and id=${id} ${memberOrders(scope, "orders.manage")} for update`,
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
      const result = await readOrder(tx, scope, id);
      if (result.status === "completed")
        await lifecycle.run("complete", tx, {
          businessId: scope.businessId,
          orderId: id,
          userId: scope.userId,
        });
      return result;
    });
  }
  function cancelForReturn(
    scope: TenantScope,
    id: string,
    expectedVersion: number,
    connection: Database = db,
  ) {
    if (scope.role !== "customer") {
      requireBusinessRole(scope, ["owner", "manager"]);
      return updateStatus(
        scope,
        id,
        { expectedVersion, status: "cancelled" },
        undefined,
        connection,
      );
    }
    const actor = customer(scope);
    return withTenant(connection, scope, async (tx) => {
      const row = await tx.maybeOne<OrderRow>(
        sql`select * from orders where business_id=${scope.businessId} and id=${id} and business_customer_id=${actor.customerId} and app_instance_id=${actor.instanceId} for update`,
      );
      if (row === null) throw new AppError("not_found");
      if (row.version !== expectedVersion)
        throw new AppError("order_version_conflict", { order: await readOrder(tx, scope, id) });
      if (
        row.status !== "placed" ||
        (await tx.maybeOne(
          sql`select 1 from order_payments where business_id=${scope.businessId} and order_id=${id}`,
        )) !== null
      )
        throw new AppError("order_state_invalid");
      await tx.execute(
        sql`select set_config('vado.order_actor_kind','customer',true),set_config('vado.order_actor_id',${actor.customerId},true)`,
      );
      await tx.execute(
        sql`update orders set status='cancelled',version=version+1 where business_id=${scope.businessId} and id=${id}`,
      );
      await lifecycle.run("cancel", tx, {
        businessId: scope.businessId,
        orderId: id,
        userId: scope.userId,
      });
      return readOrder(tx, scope, id);
    });
  }
  function reorder(
    scope: TenantScope,
    id: string,
    key: string,
    body: ReorderBody,
  ): Promise<ReorderResult> {
    const actor = customer(scope);
    return withTenant(db, scope, (tx) =>
      withPlatformMutation(
        tx,
        scope.userId ?? "",
        scope.businessId,
        `reorder/${id}`,
        key,
        body,
        async () => {
          if (
            (await tx.maybeOne(
              sql`select 1 where ordering_capabilities_for_instance(${scope.businessId},${actor.instanceId}) ? 'ordering.reorder@1.0.0'`,
            )) === null
          )
            throw new AppError("fulfilment_unavailable");
          const old = await readOrder(tx, scope, id);
          await expireOwned(tx, scope);
          const existing = await tx.maybeOne<CartRow>(
            sql`select * from carts where business_id=${scope.businessId} and app_instance_id=${actor.instanceId} and business_customer_id=${actor.customerId} and branch_id=${body.branchId} and status='open' for update`,
          );
          if (
            existing !== null &&
            (body.cartId !== existing.id ||
              body.expectedVersion !== existing.version ||
              (!body.replace && (await cartView(tx, scope, existing)).lines.length > 0))
          )
            throw new AppError("cart_version_conflict", {
              cart: await cartView(tx, scope, existing),
            });
          if (existing === null && (body.cartId !== null || body.expectedVersion !== 0))
            throw new AppError("cart_version_conflict");
          const selections = old.lines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            optionIds: line.options.map((option) => option.id),
            note: line.note,
          }));
          const quote = await catalog.quote(tx, scope, body.branchId, selections);
          const currentOptions = await tx.many<{ item_id: string; option_id: string }>(
            sql`select g.item_id,o.id as option_id from item_option_groups g join option_groups groups on groups.business_id=g.business_id and groups.id=g.group_id join options o on o.business_id=groups.business_id and o.group_id=groups.id where g.business_id=${scope.businessId} and groups.active and o.active`,
          );
          const omitted: ReorderResult["omitted"] = [];
          const kept = selections.filter((selection, index) => {
            if (quote.lines[index]?.available === true) return true;
            const optionsChanged = selection.optionIds.some(
              (id) =>
                !currentOptions.some(
                  (option) => option.item_id === selection.itemId && option.option_id === id,
                ),
            );
            omitted.push({
              itemId: selection.itemId,
              name: old.lines[index]?.name ?? "Ürün",
              quantity: selection.quantity,
              reason: optionsChanged ? "options_changed" : "unavailable",
            });
            return false;
          });
          const opened =
            existing === null
              ? await openCart(scope, body.branchId, undefined, tx)
              : await cartView(tx, scope, existing);
          const cart = await replaceCart(
            scope,
            opened.id,
            { expectedVersion: opened.version, lines: kept },
            tx,
          );
          await recordAudit(tx, {
            actor: scope.userId ?? "customer",
            action: "order.reordered",
            targetType: "cart",
            targetId: cart.id,
            metadata: { businessId: scope.businessId, sourceOrderId: id, omitted: omitted.length },
          });
          return {
            cart,
            omitted,
            requiresConfirmation: omitted.length > 0 || cart.totalMinor !== old.totalMinor,
            fulfilmentNeedsSelection: existing === null && old.fulfilment !== "pickup",
          };
        },
      ),
    );
  }
  /**
   * Şube performansı; personel yalnız rapor izni olan şubeleri görür. Tamamlanan siparişlerin
   * tutarı tahsilat ya da muhasebe geliri değildir (iade ve tahsilat ayrı tutulur).
   */
  function branchPerformance(scope: TenantScope, days: 7 | 30): Promise<BranchPerformance> {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      const items = await tx.many<BranchPerformance["items"][number]>(sql`
        select o.branch_id as "branchId", b.name as "branchName",
          count(*)::integer as "orderCount",
          count(*) filter (where o.status='completed')::integer as "completedCount",
          count(*) filter (where o.status in ('cancelled','rejected'))::integer as "cancelledCount",
          count(*) filter (where o.status not in ('completed','cancelled','rejected'))::integer as "openCount",
          coalesce(sum(o.total_minor) filter (where o.status='completed'),0)::text as "completedAmountMinor"
        from orders o join branches b on b.business_id=o.business_id and b.id=o.branch_id
        where o.business_id=${scope.businessId}
          and o.created_at >= now() - make_interval(days => ${days}::integer)
          ${permittedBranch(scope, "reports.view", sql`o.branch_id`)}
        group by o.branch_id,b.name
        order by b.name,o.branch_id
      `);
      return { days, currency: "TRY", items };
    });
  }
  return {
    cancelForReturn,
    reorder,
    applyIncentives,
    openCart,
    getCart,
    resetCart,
    replaceCart,
    checkout,
    getOrder,
    listOrders,
    branchPerformance,
    listQueue,
    updateStatus,
    accept,
    reject,
    recordPayment,
  };
}
export type OrderingService = ReturnType<typeof createOrderingService>;
