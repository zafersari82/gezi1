import {
  type NotificationSettings,
  PUSH_PREVIEW_MAX,
  type PushData,
  type UpdateNotificationSettingsBody,
} from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { sql } from "../../core/database";
import type { AuthContext } from "../../core/http";
import type { PushMessage } from "../../providers/push";

/** Mesaj bildiriminin hazırlanması için gereken, gönderilmiş mesajın özeti. */
export interface SentMessage {
  conversationId: string;
  senderId: string;
  kind: "text" | "image" | "system";
  body: string;
}

interface Recipient {
  session_id: string;
  user_id: string;
  token: string;
}

const PREVIEW_HIDDEN = { title: "VADO", body: "Yeni mesajın var" } as const;

function shorten(text: string): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length <= PUSH_PREVIEW_MAX ? single : `${single.slice(0, PUSH_PREVIEW_MAX - 1)}…`;
}

/**
 * Anlık bildirimler. Bildirim istekleri yanıtı bekletmez: gönderim arka planda yapılır, hata
 * günlüğe yazılır ve isteği yapan kullanıcıya yansımaz. Bildirim yalnızca açık oturumlardaki
 * adreslere gider; sağlayıcının geçersiz dediği adres silinir.
 */
export function createNotificationService({ db, log, push }: AppContext) {
  const pending = new Set<Promise<void>>();

  /** İşi arka planda başlatır; testler `idle()` ile bitmesini bekler. */
  function inBackground(task: () => Promise<void>): void {
    const running = task()
      .catch((error: unknown) => {
        log.error({ err: error }, "Bildirim gönderilemedi");
      })
      .finally(() => pending.delete(running));
    pending.add(running);
  }

  async function idle(): Promise<void> {
    await Promise.all([...pending]);
  }

  async function deliver<Row extends Recipient>(
    recipients: readonly Row[],
    build: (recipient: Row) => PushMessage,
  ): Promise<void> {
    if (recipients.length === 0) return;
    const outcomes = await push.send(recipients.map(build));
    const invalid = recipients
      .filter((_, index) => outcomes[index] === "invalid")
      .map((recipient) => recipient.token);
    if (invalid.length > 0) {
      await db.execute(sql`delete from push_tokens where token = any(${invalid}::text[])`);
      log.info({ count: invalid.length }, "Geçersiz bildirim adresleri silindi");
    }
  }

  // -- Adres ve ayarlar -------------------------------------------------------

  /**
   * Oturumun bildirim adresini kaydeder. Aynı adres başka bir oturumdaysa (cihazda başka hesapla
   * giriş yapıldı) oradan alınır: önceki hesabın bildirimleri bu cihaza gitmez.
   */
  async function saveToken(auth: AuthContext, token: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        delete from push_tokens where token = ${token} and session_id <> ${auth.sessionId}
      `);
      await tx.execute(sql`
        insert into push_tokens (session_id, user_id, token)
        values (${auth.sessionId}, ${auth.userId}, ${token})
        on conflict (session_id) do update set token = excluded.token, updated_at = now()
      `);
    });
  }

  async function removeToken(auth: AuthContext): Promise<void> {
    await db.execute(sql`delete from push_tokens where session_id = ${auth.sessionId}`);
  }

  async function settings(userId: string): Promise<NotificationSettings> {
    const row = await db.one<{ push_messages: boolean; push_preview: boolean }>(sql`
      select push_messages, push_preview from users where id = ${userId}
    `);
    return { pushMessages: row.push_messages, pushPreview: row.push_preview };
  }

  async function updateSettings(
    userId: string,
    body: UpdateNotificationSettingsBody,
  ): Promise<NotificationSettings> {
    await db.execute(sql`
      update users
      set
        push_messages = coalesce(${body.pushMessages ?? null}::boolean, push_messages),
        push_preview = coalesce(${body.pushPreview ?? null}::boolean, push_preview)
      where id = ${userId}
    `);
    return settings(userId);
  }

  // -- Bildirimler ------------------------------------------------------------

  /**
   * Yeni mesajı sohbetin diğer üyelerine bildirir. Mesaj bildirimini kapatan üyeye gitmez;
   * önizlemesi kapalı üyeye gönderen ve metin yazılmaz. Sistem iletileri bildirilmez.
   */
  function notifyMessage(message: SentMessage): void {
    if (message.kind === "system") return;
    inBackground(async () => {
      const recipients = await db.many<Recipient & { preview: boolean }>(sql`
        select p.session_id, p.user_id, p.token, u.push_preview as preview
        from conversation_members cm
        join users u on u.id = cm.user_id
        join push_tokens p on p.user_id = cm.user_id
        join sessions s on s.id = p.session_id
        where cm.conversation_id = ${message.conversationId}
          and cm.user_id <> ${message.senderId}
          and u.status = 'active'
          and u.push_messages
          and s.revoked_at is null
          and s.expires_at > now()
      `);
      if (recipients.length === 0) return;
      const context = await db.one<{ sender: string; kind: string; title: string | null }>(sql`
        select
          coalesce(u.display_name, 'VADO kullanıcısı') as sender, c.kind, c.title
        from conversations c, users u
        where c.id = ${message.conversationId} and u.id = ${message.senderId}
      `);
      const title =
        context.kind === "group" && context.title !== null
          ? `${context.sender} · ${context.title}`
          : context.sender;
      const text = message.kind === "image" ? "📷 Fotoğraf" : shorten(message.body);
      const data: PushData = { type: "message", conversationId: message.conversationId };
      await deliver(recipients, (recipient) => ({
        to: recipient.token,
        ...(recipient.preview ? { title, body: text } : PREVIEW_HIDDEN),
        data,
      }));
    });
  }

  /** Hesaba yeni bir cihazdan girildiğini kullanıcının diğer cihazlarına bildirir. */
  function notifyNewDevice(userId: string, newSessionId: string, deviceName: string): void {
    inBackground(async () => {
      const recipients = await db.many<Recipient>(sql`
        select p.session_id, p.user_id, p.token
        from push_tokens p
        join sessions s on s.id = p.session_id
        where p.user_id = ${userId}
          and p.session_id <> ${newSessionId}
          and s.revoked_at is null
          and s.expires_at > now()
      `);
      await deliver(recipients, (recipient) => ({
        to: recipient.token,
        title: "Yeni cihazdan giriş",
        body: `Hesabına "${shorten(deviceName)}" cihazından giriş yapıldı. Sen değilsen Ben › Oturumlar ekranından bu oturumu kapat.`,
        data: { type: "new_device" },
      }));
    });
  }

  return { saveToken, removeToken, settings, updateSettings, notifyMessage, notifyNewDevice, idle };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
