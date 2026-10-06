import {
  type NotificationSettings,
  PUSH_PREVIEW_MAX,
  type PushData,
  type UpdateNotificationSettingsBody,
} from "@vado/contracts";
import { z } from "zod";

import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import type { AuthContext } from "../../core/http";
import { appendPlatformEvent } from "../../core/outbox-events";
import { createOutboxWorker, type OutboxConsumer } from "../../core/outbox-worker";
import type { PushMessage } from "../../providers/push";

/** Mesaj bildiriminin hazırlanması için gereken, gönderilmiş mesajın özeti. */
export interface SentMessage {
  messageId: string;
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

/** Kalıcı olay dağıtımı. Süreç içi bekleme yalnızca teslimi hızlandırır; kaynak SQL kuyruğudur. */
export function createNotificationService({ db, platformDb, log, push }: AppContext) {
  const pending = new Set<Promise<unknown>>();
  const consumer: OutboxConsumer = {
    name: "notifications.push",
    kind: "external",
    types: ["push.message", "push.new_device"],
    async deliver(event) {
      if (event.type === "push.message") {
        const { messageId } = z.object({ messageId: z.uuid() }).parse(event.payload);
        const message = await db.maybeOne<{
          conversation_id: string;
          sender_id: string;
          kind: string;
          body: string;
        }>(sql`
          select m.conversation_id, m.sender_id, m.kind, m.body from messages m
          join users u on u.id = m.sender_id and u.status = 'active' where m.id = ${messageId}
        `);
        if (message === null || message.kind === "system") return;
        await deliverMessage(message, event.id);
      } else {
        const { newSessionId } = z.object({ newSessionId: z.uuid() }).parse(event.payload);
        const session = await db.maybeOne<{ user_id: string; device_name: string }>(sql`
          select s.user_id, s.device_name from sessions s join users u on u.id=s.user_id
          where s.id=${newSessionId} and s.revoked_at is null and u.status='active'
        `);
        if (session !== null)
          await deliverNewDevice(session.user_id, newSessionId, session.device_name, event.id);
      }
    },
  };
  const worker = createOutboxWorker({ platformDb, log, consumers: [consumer] });

  function kick(eventId: string | null): void {
    if (eventId === null) return;
    const running = worker
      .drain({ eventIds: [eventId] })
      .catch((error: unknown) => {
        log.error({ err: error }, "Bildirim teslimi duraksadı");
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
    if (outcomes.length !== recipients.length || outcomes.some((outcome) => outcome === "failed")) {
      throw new Error("Bildirim sağlayıcısı teslimi tamamlayamadı");
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
  async function enqueueMessage(tx: Database, message: SentMessage): Promise<string | null> {
    if (message.kind === "system") return null;
    return appendPlatformEvent(tx, {
      type: "push.message",
      payload: { messageId: message.messageId, conversationId: message.conversationId },
    });
  }

  async function deliverMessage(
    message: { conversation_id: string; sender_id: string; kind: string; body: string },
    eventId: string,
  ): Promise<void> {
    const recipients = await db.many<Recipient & { preview: boolean }>(sql`
      select p.session_id, p.user_id, p.token, u.push_preview as preview
      from conversation_members cm
      join users u on u.id = cm.user_id join push_tokens p on p.user_id = cm.user_id
      join sessions s on s.id = p.session_id
      where cm.conversation_id = ${message.conversation_id} and cm.user_id <> ${message.sender_id}
        and u.status = 'active' and u.push_messages and s.revoked_at is null and s.expires_at > now()
    `);
    if (recipients.length === 0) return;
    const context = await db.one<{ sender: string; kind: string; title: string | null }>(sql`
      select coalesce(u.display_name, 'VADO kullanıcısı') as sender, c.kind, c.title
      from conversations c, users u where c.id = ${message.conversation_id} and u.id = ${message.sender_id}
    `);
    const title =
      context.kind === "group" && context.title !== null
        ? `${context.sender} · ${context.title}`
        : context.sender;
    const text = message.kind === "image" ? "📷 Fotoğraf" : shorten(message.body);
    const data: PushData = { type: "message", conversationId: message.conversation_id, eventId };
    await deliver(recipients, (recipient) => ({
      to: recipient.token,
      ...(recipient.preview ? { title, body: text } : PREVIEW_HIDDEN),
      data,
    }));
  }

  function enqueueNewDevice(tx: Database, newSessionId: string): Promise<string> {
    return appendPlatformEvent(tx, { type: "push.new_device", payload: { newSessionId } });
  }

  async function deliverNewDevice(
    userId: string,
    newSessionId: string,
    deviceName: string,
    eventId: string,
  ): Promise<void> {
    const recipients = await db.many<Recipient>(sql`
      select p.session_id, p.user_id, p.token from push_tokens p
      join sessions s on s.id = p.session_id join users u on u.id = p.user_id and u.status = 'active'
      where p.user_id = ${userId} and p.session_id <> ${newSessionId}
        and s.revoked_at is null and s.expires_at > now()
        and exists (select 1 from sessions opened where opened.id = ${newSessionId} and opened.revoked_at is null)
    `);
    await deliver(recipients, (recipient) => ({
      to: recipient.token,
      title: "Yeni cihazdan giriş",
      body: `Hesabına "${shorten(deviceName)}" cihazından giriş yapıldı. Sen değilsen Ben › Oturumlar ekranından bu oturumu kapat.`,
      data: { type: "new_device", eventId },
    }));
  }

  return {
    saveToken,
    removeToken,
    settings,
    updateSettings,
    enqueueMessage,
    enqueueNewDevice,
    kick,
    idle,
    consumer,
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
