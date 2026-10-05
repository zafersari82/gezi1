import { z } from "zod";

import { amountMinorSchema, CURRENCY, idSchema, timestampSchema } from "./common";
import { miniAppIdSchema } from "./miniapps";

export const PAYMENT_DESCRIPTION_MAX = 140;

/** Satıcı kimliği: küçük harf, rakam ve tire (3-60 karakter). */
export const merchantIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/);

/** Mini uygulamanın kendi sipariş numarası; aynı sipariş için ikinci ödeme oturumu açılmaz. */
export const orderIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const paymentDescriptionSchema = z.string().trim().min(1).max(PAYMENT_DESCRIPTION_MAX);

export const paymentModeSchema = z.enum(["sandbox", "provider"]);
export type PaymentMode = z.infer<typeof paymentModeSchema>;

export const paymentStatusSchema = z.enum(["created", "paid", "cancelled", "expired"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentSchema = z.object({
  id: idSchema,
  seq: z.number().int(),
  miniAppId: miniAppIdSchema,
  miniAppName: z.string(),
  merchantId: merchantIdSchema,
  merchantName: z.string(),
  orderId: z.string(),
  description: z.string(),
  amountMinor: z.number().int(),
  currency: z.literal(CURRENCY),
  status: paymentStatusSchema,
  /** `true` ise deneme ödemesidir; gerçek para hareketi yoktur. */
  sandbox: z.boolean(),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
});
export type Payment = z.infer<typeof paymentSchema>;

export const createPaymentBodySchema = z.object({
  miniAppId: miniAppIdSchema,
  merchantId: merchantIdSchema,
  orderId: orderIdSchema,
  description: paymentDescriptionSchema,
  amountMinor: amountMinorSchema,
});
export type CreatePaymentBody = z.infer<typeof createPaymentBodySchema>;
