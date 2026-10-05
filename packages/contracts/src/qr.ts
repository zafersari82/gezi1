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
  z.object({ type: z.literal("miniapp"), miniApp: miniAppSchema }),
]);
export type QrTarget = z.infer<typeof qrTargetSchema>;
