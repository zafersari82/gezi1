import { z } from "zod";

import { catalogSelectionSchema, moneyMinorSchema, vatBasisPointsSchema } from "./catalog";
import { idSchema, timestampSchema } from "./common";
import { deliverySummarySchema } from "./delivery";
import { incentiveQuoteSchema } from "./incentives";
import {
  type Fulfilment,
  fulfilmentSchema,
  type OrderContext,
  orderContextSchema,
} from "./ordering-registry";
import { timezoneSchema } from "./time";

export const CORE_ORDER_STATES = [
  "placed",
  "accepted",
  "rejected",
  "completed",
  "cancelled",
] as const;
export const TERMINAL_ORDER_STATES = ["rejected", "completed", "cancelled"] as const;
export const CORE_ORDER_GRAPH: Readonly<Record<string, readonly string[]>> = {
  placed: ["accepted", "rejected", "cancelled"],
  accepted: ["completed", "cancelled"],
  rejected: [],
  completed: [],
  cancelled: [],
};
export const orderStateSchema = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/);
export const orderGraphSchema = z.record(orderStateSchema, z.array(orderStateSchema).max(20));
export const expectedVersionSchema = z.number().int().min(1).max(2_147_483_647);
export const openCartBodySchema = z
  .object({
    branchId: idSchema,
    addressId: idSchema.nullable().optional(),
    fulfilment: fulfilmentSchema.default("pickup"),
    context: orderContextSchema.nullable().optional(),
    scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();
export type OpenCartBody = z.infer<typeof openCartBodySchema>;
export const replaceCartBodySchema = z.object({
  expectedVersion: expectedVersionSchema,
  lines: z.array(catalogSelectionSchema).max(100),
});
export type ReplaceCartBody = z.infer<typeof replaceCartBodySchema>;
export const resetCartBodySchema = z.object({ expectedVersion: expectedVersionSchema }).strict();
export type ResetCartBody = z.infer<typeof resetCartBodySchema>;
export const checkoutCartBodySchema = z.object({
  cartVersion: expectedVersionSchema,
  seenTotalMinor: moneyMinorSchema,
  quoteHash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type CheckoutCartBody = z.infer<typeof checkoutCartBodySchema>;
export const updateOrderStatusBodySchema = z.object({
  expectedVersion: expectedVersionSchema,
  status: orderStateSchema,
});
export type UpdateOrderStatusBody = z.infer<typeof updateOrderStatusBodySchema>;
export const shellCartParamsSchema = z.object({
  businessId: idSchema,
  appInstanceId: idSchema,
  id: idSchema,
});
export const pricedOptionSchema = z.object({
  id: idSchema,
  name: z.string(),
  priceDeltaMinor: moneyMinorSchema,
});
export const cartLineSchema = catalogSelectionSchema.extend({
  id: idSchema,
  name: z.string(),
  available: z.boolean(),
  priceChanged: z.boolean(),
  discountMinor: moneyMinorSchema.optional(),
  unitPriceMinor: moneyMinorSchema,
  totalMinor: moneyMinorSchema,
  vatBasisPoints: vatBasisPointsSchema,
  vatMinor: moneyMinorSchema,
  options: z.array(pricedOptionSchema),
});
export const cartSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  branchId: idSchema,
  appInstanceId: idSchema,
  businessCustomerId: idSchema,
  fulfilment: fulfilmentSchema,
  /** Sepet sahibine ait adres kimliği; tam adres teslimat teklifinde izinle açılır. */
  addressId: idSchema.nullable().optional(),
  context: orderContextSchema.nullable().default(null),
  scheduledAt: timestampSchema.nullable().default(null),
  status: z.enum(["open", "checked_out", "expired"]),
  version: expectedVersionSchema,
  expiresAt: timestampSchema,
  lines: z.array(cartLineSchema),
  totalMinor: moneyMinorSchema,
  vatMinor: moneyMinorSchema,
  currency: z.literal("TRY"),
  quoteHash: z.string(),
  delivery: deliverySummarySchema.nullable().optional(),
  incentives: incentiveQuoteSchema.optional(),
});
export type Cart = z.infer<typeof cartSchema>;
export const orderSummarySchema = z.object({
  branchTimezone: timezoneSchema,
  id: idSchema,
  businessId: idSchema,
  cartId: idSchema,
  branchId: idSchema,
  appInstanceId: idSchema,
  businessCustomerId: idSchema,
  fulfilment: fulfilmentSchema,
  context: orderContextSchema.nullable().default(null),
  /** Bağlamın kişiye gösterilen adı (ör. "Masa 4"); bağlamı kaydeden paket üretir. */
  contextLabel: z.string().nullable().default(null),
  scheduledAt: timestampSchema.nullable().default(null),
  status: orderStateSchema,
  version: expectedVersionSchema,
  totalMinor: moneyMinorSchema,
  vatMinor: moneyMinorSchema,
  currency: z.literal("TRY"),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  preparationMinutes: z.number().int().min(1).max(240).nullable().default(null),
  estimatedReadyAt: timestampSchema.nullable().default(null),
  rejectionReason: z.string().nullable().default(null),
  paymentStatus: z.enum(["pending", "paid"]).default("pending"),
  paymentVersion: z.number().int().min(0).max(1).default(0),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;
export const orderLineSchema = z.object({
  discountMinor: moneyMinorSchema.optional(),
  id: idSchema,
  itemId: idSchema,
  name: z.string(),
  quantity: z.number().int().positive(),
  note: z.string().max(500).default(""),
  basePriceMinor: moneyMinorSchema,
  unitPriceMinor: moneyMinorSchema,
  totalMinor: moneyMinorSchema,
  vatBasisPoints: vatBasisPointsSchema,
  vatMinor: moneyMinorSchema,
  options: z.array(pricedOptionSchema),
});
export const orderHistorySchema = z.object({
  id: idSchema,
  version: expectedVersionSchema,
  fromStatus: orderStateSchema.nullable(),
  toStatus: orderStateSchema,
  actorKind: z.enum(["customer", "business", "system", "device"]),
  createdAt: timestampSchema,
});
export const orderPaymentSchema = z.object({
  id: idSchema,
  amountMinor: moneyMinorSchema,
  place: z.enum(["table", "counter", "delivery"]),
  method: z.enum(["cash", "card"]),
  memberId: idSchema,
  reference: z.string().nullable(),
  createdAt: timestampSchema,
});
export type OrderPayment = z.infer<typeof orderPaymentSchema>;
export const orderSchema = orderSummarySchema.extend({
  payment: orderPaymentSchema.nullable().optional(),
  incentives: incentiveQuoteSchema.nullable().optional(),
  lines: z.array(orderLineSchema),
  history: z.array(orderHistorySchema),
  stateGraph: orderGraphSchema,
  capabilities: z.array(z.string()),
});
export type Order = z.infer<typeof orderSchema>;
export const orderListQuerySchema = z.object({
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: orderStateSchema.optional(),
  branchId: idSchema.optional(),
  appInstanceId: idSchema.optional(),
  statuses: z
    .preprocess(
      (value) => (typeof value === "string" ? value.split(",") : value),
      z
        .array(orderStateSchema)
        .min(1)
        .max(20)
        .refine((values) => new Set(values).size === values.length),
    )
    .optional(),
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/** Sipariş ve tahsilatın bağımsız sürümleri, geciken yanıtta da ileri yönde birleşir. */
export function mergeOrderSnapshot<T extends OrderSummary>(current: T | null, incoming: T): T {
  if (current?.id !== incoming.id) return incoming;
  const state = incoming.version >= current.version ? incoming : current;
  const payment = incoming.paymentVersion >= current.paymentVersion ? incoming : current;
  return { ...state, paymentStatus: payment.paymentStatus, paymentVersion: payment.paymentVersion };
}

/** Operational totals: completed order amounts are not proof of collected payments. */
export const branchPerformanceQuerySchema = z.object({
  days: z.enum(["7", "30"]).default("30"),
});
export const branchPerformanceRowSchema = z.object({
  branchId: idSchema,
  branchName: z.string(),
  orderCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  cancelledCount: z.number().int().nonnegative(),
  openCount: z.number().int().nonnegative(),
  completedAmountMinor: z.string().regex(/^\d+$/),
});
export const branchPerformanceSchema = z.object({
  days: z.union([z.literal(7), z.literal(30)]),
  currency: z.literal("TRY"),
  items: z.array(branchPerformanceRowSchema),
});
export type BranchPerformance = z.infer<typeof branchPerformanceSchema>;

// Ortak tipler eski dış içe aktarmaları bozmadan yeni kayıt dosyasına yönlendirilir.
export {
  fulfilmentSchema,
  PAYMENT_PLACES,
  FULFILMENT_PAYMENT_PLACES,
  FULFILMENT_LABELS,
  ORDER_CONTEXT_KINDS,
  orderContextSchema,
} from "./ordering-registry";
export type { Fulfilment, OrderContext, PaymentPlace } from "./ordering-registry";
