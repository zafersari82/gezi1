import { z } from "zod";

import { idSchema } from "./common";

/** Telefonun bildirim adresi: Expo'nun ürettiği push belirteci (`ExponentPushToken[…]`). */
export const PUSH_TOKEN_PATTERN = /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{1,200}\]$/;

export const pushTokenBodySchema = z.object({
  token: z.string().regex(PUSH_TOKEN_PATTERN),
});
export type PushTokenBody = z.infer<typeof pushTokenBodySchema>;

export const notificationSettingsSchema = z.object({
  /** Yeni mesaj bildirimleri. Yeni cihaz bildirimi güvenlik içindir ve kapatılamaz. */
  pushMessages: z.boolean(),
  /** Bildirimde gönderenin adı ve mesajın metni görünsün mü? Kapalıyken yalnızca "Yeni mesaj". */
  pushPreview: z.boolean(),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const updateNotificationSettingsBodySchema = notificationSettingsSchema
  .partial()
  .refine((body) => body.pushMessages !== undefined || body.pushPreview !== undefined, {
    error: "En az bir ayar değişmeli.",
  });
export type UpdateNotificationSettingsBody = z.infer<typeof updateNotificationSettingsBodySchema>;

/** Bildirimin taşıdığı veri; telefon bildirime dokunulunca hangi ekranı açacağını buradan bilir. */
export const pushDataSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), conversationId: idSchema }),
  z.object({ type: z.literal("new_device") }),
]);
export type PushData = z.infer<typeof pushDataSchema>;

/** Önizlemede gösterilen metnin en fazla uzunluğu. */
export const PUSH_PREVIEW_MAX = 120;
