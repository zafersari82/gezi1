import { z } from "zod";

import { businessSchema } from "./businesses";
import { idSchema, timestampSchema } from "./common";
import { miniAppIdSchema, miniAppSchema } from "./miniapps";
import { userProfileSchema } from "./users";

/**
 * Tüm VADO QR kodları bu önekle başlar: vado://q/<veri>.<anahtar kimliği>.<imza>
 * 2.1 ve öncesinde üretilmiş kodlarda anahtar kimliği yoktur: vado://q/<veri>.<imza>
 */
export const QR_PREFIX = "vado://q/";

/** QR koduna imzalı olarak yazılabilecek parametre sayısı ve uzunlukları. */
export const QR_PARAMS_MAX = 5;
export const QR_PARAM_KEY_PATTERN = /^[a-z0-9_]{1,20}$/;
export const QR_PARAM_VALUE_MAX = 64;

/**
 * Mini uygulama koduna panelden yazılan parametreler (masa numarası, şube kodu gibi). Kodun imzasının
 * içindedir; mini uygulama bunları `app.getContext().params` ile okur ve VADO panelinden geldiğine
 * güvenebilir.
 */
export const qrParamsSchema = z
  .record(
    z.string().regex(QR_PARAM_KEY_PATTERN, "Ad küçük harf, rakam ya da _ olmalı (en fazla 20)"),
    z.string().min(1).max(QR_PARAM_VALUE_MAX),
  )
  .refine((params) => Object.keys(params).length <= QR_PARAMS_MAX, {
    message: `En fazla ${String(QR_PARAMS_MAX)} parametre yazılabilir`,
  });
export type QrParams = z.infer<typeof qrParamsSchema>;

export const adminIssueMiniAppQrBodySchema = z.object({
  params: qrParamsSchema,
});
export type AdminIssueMiniAppQrBody = z.infer<typeof adminIssueMiniAppQrBodySchema>;

export const issueQrBodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user") }),
  z.object({ type: z.literal("business"), id: idSchema }),
  z.object({ type: z.literal("miniapp"), id: miniAppIdSchema }),
]);
export type IssueQrBody = z.infer<typeof issueQrBodySchema>;

export const issuedQrSchema = z.object({
  value: z.string(),
  /** Kişisel kodlar kısa ömürlüdür; işletme ve mini uygulama kodlarının süresi dolmaz. */
  expiresAt: timestampSchema.nullable(),
});
export type IssuedQr = z.infer<typeof issuedQrSchema>;

export const resolveQrBodySchema = z.object({
  value: z.string().min(1).max(2048),
});
export type ResolveQrBody = z.infer<typeof resolveQrBodySchema>;

export const qrTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), user: userProfileSchema }),
  z.object({ type: z.literal("business"), business: businessSchema }),
  z.object({
    type: z.literal("miniapp"),
    miniApp: miniAppSchema,
    /** Kodun imzalı parametreleri; panelden parametresiz üretilmiş kodlarda boştur. */
    params: qrParamsSchema,
  }),
]);
export type QrTarget = z.infer<typeof qrTargetSchema>;
