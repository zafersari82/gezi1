import { randomUUID } from "node:crypto";

import {
  type CreatePaymentBody,
  CURRENCY,
  type Page,
  type PageQuery,
  type Payment,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { sql, type SqlFragment } from "../../core/database";
import { AppError } from "../../core/errors";
import { miniAppLive } from "../miniapps/miniapp-rows";

const PAYMENT_TTL_MINUTES = 15;
const SANDBOX_PROVIDER = "sandbox";

interface PaymentRow {
  id: string;
  seq: number;
  mini_app_id: string;
  mini_app_name: string;
  merchant_id: string;
  merchant_name: string;
  order_id: string;
  description: string;
  amount_minor: number;
  status: "created" | "paid" | "cancelled";
  provider: string;
  created_at: Date;
  expires_at: Date;
  expired: boolean;
}

/**
 * Ödeme sınırı: VADO kart verisi işlemez. Mini uygulama yalnızca sipariş bilgisini verir,
 * kullanıcı tutarı VADO'nun kendi ekranında onaylar. Bu sürümde yalnızca deneme (sandbox)
 * ödemesi vardır; gerçek tahsilat, lisanslı bir ödeme kuruluşunun bağlanmasını gerektirir.
 */
export function createPaymentService({ config, db }: AppContext) {
  function toPayment(row: PaymentRow): Payment {
    return {
      id: row.id,
      seq: row.seq,
      miniAppId: row.mini_app_id,
      miniAppName: row.mini_app_name,
      merchantId: row.merchant_id,
      merchantName: row.merchant_name,
      orderId: row.order_id,
      description: row.description,
      amountMinor: row.amount_minor,
      currency: CURRENCY,
      status: row.expired ? "expired" : row.status,
      sandbox: row.provider === SANDBOX_PROVIDER,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
    };
  }

  function selectPayments(userId: string, filter: SqlFragment, limit: number) {
    return db.many<PaymentRow>(sql`
      select
        p.id, p.seq, p.mini_app_id, a.name as mini_app_name,
        p.merchant_id, mm.display_name as merchant_name,
        p.order_id, p.description, p.amount_minor, p.status, p.provider,
        p.created_at, p.expires_at,
        (p.status = 'created' and p.expires_at <= now()) as expired
      from payments p
      join mini_apps a on a.id = p.mini_app_id
      join mini_app_merchants mm
        on mm.mini_app_id = p.mini_app_id and mm.merchant_id = p.merchant_id
      where p.user_id = ${userId} and ${filter}
      order by p.seq desc
      limit ${limit}
    `);
  }

  async function get(userId: string, paymentId: string): Promise<Payment> {
    const [row] = await selectPayments(userId, sql`p.id = ${paymentId}`, 1);
    if (row === undefined) throw new AppError("payment_not_found");
    return toPayment(row);
  }

  async function list(userId: string, page: PageQuery): Promise<Page<Payment>> {
    const filter = page.cursor === undefined ? sql`true` : sql`p.seq < ${Number(page.cursor)}`;
    const rows = await selectPayments(userId, filter, page.limit + 1);
    const items = rows.slice(0, page.limit).map(toPayment);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > page.limit && last !== undefined ? String(last.seq) : null,
    };
  }

  function requireSandbox(): void {
    if (config.paymentMode !== "sandbox") throw new AppError("payment_provider_unavailable");
  }

  /**
   * Ödeme oturumu açar. Mini uygulamanın ödeme yetkisi ve satıcıyla eşleştirmesi sunucuda
   * doğrulanır. Aynı sipariş için yinelenen istek mevcut oturumu döndürür.
   */
  async function create(userId: string, body: CreatePaymentBody): Promise<Payment> {
    requireSandbox();

    const miniApp = await db.maybeOne<{ capabilities: string[] }>(sql`
      select a.capabilities from mini_app_runtime a
      where a.id = ${body.miniAppId} and ${miniAppLive(config.miniAppDevMode)}
    `);
    if (!miniApp?.capabilities.includes("payment.request")) {
      throw new AppError("payment_not_allowed");
    }
    const merchant = await db.maybeOne(sql`
      select 1 from mini_app_merchants
      where mini_app_id = ${body.miniAppId} and merchant_id = ${body.merchantId} and active
    `);
    if (merchant === null) throw new AppError("merchant_not_bound");

    const created = await db.transaction(async (tx) => {
      const row = await tx.maybeOne<{ id: string }>(sql`
        insert into payments
          (user_id, mini_app_id, merchant_id, order_id, description, amount_minor, provider, expires_at)
        values (
          ${userId},
          ${body.miniAppId},
          ${body.merchantId},
          ${body.orderId},
          ${body.description},
          ${body.amountMinor},
          ${SANDBOX_PROVIDER},
          now() + make_interval(mins => ${PAYMENT_TTL_MINUTES})
        )
        on conflict on constraint payments_order_key do nothing
        returning id
      `);
      if (row !== null) {
        await recordAudit(tx, {
          actor: userId,
          action: "payment.created",
          targetType: "payment",
          targetId: row.id,
          metadata: {
            miniAppId: body.miniAppId,
            merchantId: body.merchantId,
            orderId: body.orderId,
            amountMinor: body.amountMinor,
          },
        });
      }
      return row;
    });
    if (created !== null) return get(userId, created.id);

    const [existing] = await selectPayments(
      userId,
      sql`
        p.mini_app_id = ${body.miniAppId}
        and p.merchant_id = ${body.merchantId}
        and p.order_id = ${body.orderId}
      `,
      1,
    );
    if (existing === undefined) throw new AppError("payment_not_found");
    if (existing.amount_minor !== body.amountMinor) throw new AppError("payment_state_invalid");
    return toPayment(existing);
  }

  /** Kullanıcının onayıyla ödemeyi tamamlar. Yinelenen onay isteği aynı sonucu döndürür. */
  async function confirm(userId: string, paymentId: string): Promise<Payment> {
    requireSandbox();

    const confirmed = await db.transaction(async (tx) => {
      const updated = await tx.execute(sql`
        update payments
        set status = 'paid', provider_reference = ${`sandbox-${randomUUID()}`}, updated_at = now()
        where id = ${paymentId}
          and user_id = ${userId}
          and provider = ${SANDBOX_PROVIDER}
          and status = 'created'
          and expires_at > now()
      `);
      if (updated === 0) return false;
      await recordAudit(tx, {
        actor: userId,
        action: "payment.confirmed",
        targetType: "payment",
        targetId: paymentId,
      });
      return true;
    });

    const payment = await get(userId, paymentId);
    if (confirmed || payment.status === "paid") return payment;
    throw new AppError(payment.status === "expired" ? "payment_expired" : "payment_state_invalid");
  }

  async function cancel(userId: string, paymentId: string): Promise<Payment> {
    const cancelled = await db.execute(sql`
      update payments
      set status = 'cancelled', updated_at = now()
      where id = ${paymentId} and user_id = ${userId} and status = 'created'
    `);
    const payment = await get(userId, paymentId);
    if (cancelled > 0 || payment.status === "cancelled") return payment;
    throw new AppError("payment_state_invalid");
  }

  return { get, list, create, confirm, cancel };
}

export type PaymentService = ReturnType<typeof createPaymentService>;
