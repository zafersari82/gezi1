import { z } from "zod";

import { MESSAGE_MAX_LENGTH, messageSchema } from "./chat";
import { idSchema, pageQuerySchema, timestampSchema } from "./common";

/** Aynı hesabın ağ yeniden denemeleri mesajları çoğaltmaz. */
export const businessChatReplySchema = z
  .object({
    clientId: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
  })
  .strict();
export type BusinessChatReply = z.infer<typeof businessChatReplySchema>;

export const businessChatThreadSchema = z.object({
  conversationId: idSchema,
  customerName: z.string(),
  lastMessage: z.string().nullable(),
  updatedAt: timestampSchema,
  unreadCount: z.number().int().nonnegative(),
});
export const businessChatInboxSchema = z.object({
  items: z.array(businessChatThreadSchema),
  nextCursor: z.string().nullable(),
});
export const businessChatMessageSchema = messageSchema.extend({ fromCustomer: z.boolean() });
export const businessChatMessagesSchema = z.object({
  items: z.array(businessChatMessageSchema),
  nextCursor: z.string().nullable(),
});
/** Sipariş kartındaki veriler değişmez mesaj metninden değil, her açılışta yetkili sunucudan alınır. */
export const businessChatOrderSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  branchId: idSchema,
  branchName: z.string(),
  status: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  totalMinor: z.number().int().nonnegative(),
  currency: z.literal("TRY"),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type BusinessChatOrder = z.infer<typeof businessChatOrderSchema>;
export const businessChatOrdersSchema = z.object({ items: z.array(businessChatOrderSchema) });
/** Sektöre özel yeni durumlar geldiğinde teknik kod anlaşılır metne dönüştürülebilir. */
export function businessChatOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    placed: "Sipariş alındı",
    accepted: "Onaylandı",
    rejected: "Reddedildi",
    preparing: "Hazırlanıyor",
    ready: "Hazır",
    completed: "Tamamlandı",
    cancelled: "İptal edildi",
    out_for_delivery: "Dağıtımda",
    delivered: "Teslim edildi",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}
export const businessChatPageQuerySchema = pageQuerySchema;
