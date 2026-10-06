import {
  authResultSchema,
  conversationDetailSchema,
  conversationSchema,
  messageSchema,
  notificationSettingsSchema,
  requestOtpResponseSchema,
  TERMS_VERSION,
} from "@vado/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { platformScope } from "../src/core/platform-scope";
import {
  anonymous,
  as,
  createUser,
  makeContacts,
  startTestApp,
  type TestApp,
  type TestUser,
} from "./support/harness";

let tokenCounter = 0;
const pushToken = () => `ExponentPushToken[sinama-${String((tokenCounter += 1))}]`;
let clientCounter = 0;
const clientId = () => `bildirim-${String((clientCounter += 1))}`;

describe("anlık bildirimler", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.stop());
  beforeEach(() => {
    app.sentPush.length = 0;
  });

  async function register(user: TestUser): Promise<string> {
    const token = pushToken();
    await as(app, user).done("PUT", "/v1/me/push-token", { body: { token } });
    return token;
  }

  async function directChat(): Promise<{ ayse: TestUser; mehmet: TestUser; id: string }> {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    await makeContacts(app, ayse, mehmet);
    const conversation = await as(app, ayse).ok(
      conversationSchema,
      "POST",
      "/v1/conversations/direct",
      { body: { userId: mehmet.id } },
    );
    return { ayse, mehmet, id: conversation.id };
  }

  async function send(user: TestUser, conversationId: string, body: string) {
    await as(app, user).ok(messageSchema, "POST", `/v1/conversations/${conversationId}/messages`, {
      body: { kind: "text", clientId: clientId(), body },
    });
    await app.services.notifications.idle();
  }

  it("mesaj ve kalıcı bildirim olayı aynı işlemde tek kez oluşur", async () => {
    const { ayse, mehmet, id } = await directChat();
    await register(mehmet);
    const body = { kind: "text", clientId: clientId(), body: "Kalıcı bildirim" };
    const client = as(app, ayse);
    await client.ok(messageSchema, "POST", `/v1/conversations/${id}/messages`, { body });
    await client.ok(messageSchema, "POST", `/v1/conversations/${id}/messages`, { body });
    await app.services.notifications.idle();
    const events = await platformScope(app.platformDb, (tx) =>
      tx.many<{ id: string }>(sql`
      select id from platform_outbox_events where type = 'push.message' and payload->>'conversationId' = ${id}
    `),
    );
    expect(events).toHaveLength(1);
    expect(app.sentPush).toHaveLength(1);
    expect(app.sentPush[0]?.data).toMatchObject({ eventId: events[0]?.id });
  });

  it("olay kaydı başarısızsa mesaj da kaydedilmez", async () => {
    const { ayse, id } = await directChat();
    await app.db.execute(
      sql`update users set display_name = 'Olay atomiklik sınaması' where id = ${ayse.id}`,
    );
    await app.migrationDb
      .execute(sql`create function notification_atomic_test() returns trigger language plpgsql as $$
      begin
        if new.type = 'push.message' and exists (select 1 from messages m join users u on u.id=m.sender_id
          where m.id=(new.payload->>'messageId')::uuid and u.display_name='Olay atomiklik sınaması') then
          raise exception 'Test için olay kaydı reddedildi' using errcode='23514';
        end if;
        return new;
      end $$;
      create trigger notification_atomic_test before insert on platform_outbox_events
        for each row execute function notification_atomic_test()`);
    try {
      await as(app, ayse).fail("internal_error", "POST", `/v1/conversations/${id}/messages`, {
        body: { kind: "text", clientId: clientId(), body: "Geri alınmalı" },
      });
      expect(
        await app.db.many(
          sql`select * from messages where conversation_id = ${id} and kind = 'text'`,
        ),
      ).toEqual([]);
    } finally {
      await app.migrationDb.execute(
        sql`drop trigger notification_atomic_test on platform_outbox_events; drop function notification_atomic_test()`,
      );
    }
  });

  it("gecikmiş teslim alıcının güncel bildirim tercihini okur", async () => {
    const { ayse, mehmet, id } = await directChat();
    await register(mehmet);
    const eventId = await app.db.transaction(async (tx) => {
      const row = await tx.one<{
        id: string;
      }>(sql`insert into messages(conversation_id,sender_id,kind,body,client_id)
        values (${id},${ayse.id},'text','Geç teslim',${clientId()}) returning id`);
      return app.services.notifications.enqueueMessage(tx, {
        messageId: row.id,
        conversationId: id,
        senderId: ayse.id,
        kind: "text",
        body: "Geç teslim",
      });
    });
    await as(app, mehmet).ok(notificationSettingsSchema, "PATCH", "/v1/me/notifications", {
      body: { pushMessages: false },
    });
    if (eventId === null) throw new Error("Bildirim olayı oluşmadı");
    await app.services.events.drain({ eventIds: [eventId] });
    expect(app.sentPush).toEqual([]);
  });

  it("ayarlar: mesaj bildirimi açık, önizleme kapalı başlar; değiştirilebilir", async () => {
    const user = await createUser(app, "Zeynep");
    const client = as(app, user);
    expect(await client.ok(notificationSettingsSchema, "GET", "/v1/me/notifications")).toEqual({
      pushMessages: true,
      pushPreview: false,
    });
    const changed = await client.ok(notificationSettingsSchema, "PATCH", "/v1/me/notifications", {
      body: { pushPreview: true },
    });
    expect(changed).toEqual({ pushMessages: true, pushPreview: true });
    await client.fail("validation_failed", "PATCH", "/v1/me/notifications", { body: {} });
    await anonymous(app).fail("unauthorized", "GET", "/v1/me/notifications");
  });

  it("yeni mesaj alıcıya önizlemesiz gider; gönderene gitmez", async () => {
    const { ayse, mehmet, id } = await directChat();
    const mehmetToken = await register(mehmet);
    await register(ayse);
    await send(ayse, id, "Cumartesi 13:00 uygun mu?");

    expect(app.sentPush).toEqual([
      {
        to: mehmetToken,
        title: "VADO",
        body: "Yeni mesajın var",
        data: { type: "message", conversationId: id, eventId: expect.any(String) as unknown },
      },
    ]);
  });

  it("önizleme açıksa gönderen ve metin görünür; uzun metin kısaltılır", async () => {
    const { ayse, mehmet, id } = await directChat();
    await register(mehmet);
    await as(app, mehmet).ok(notificationSettingsSchema, "PATCH", "/v1/me/notifications", {
      body: { pushPreview: true },
    });
    await send(ayse, id, `Merhaba\n${"a".repeat(200)}`);

    const [message] = app.sentPush;
    expect(message?.title).toBe("Ayşe");
    expect(message?.body.startsWith("Merhaba a")).toBe(true);
    expect(message?.body).toHaveLength(120);
    expect(message?.body.endsWith("…")).toBe(true);
  });

  it("grup mesajında başlık gönderen ve grup adıdır; mesaj bildirimini kapatan üyeye gitmez", async () => {
    const owner = await createUser(app, "Ayşe");
    const quiet = await createUser(app, "Sessiz");
    const loud = await createUser(app, "Can");
    for (const member of [quiet, loud]) await makeContacts(app, owner, member);
    const group = await as(app, owner).ok(
      conversationDetailSchema,
      "POST",
      "/v1/conversations/group",
      { body: { title: "Hafta Sonu", memberIds: [quiet.id, loud.id] } },
    );
    await app.services.notifications.idle();
    app.sentPush.length = 0;
    await register(quiet);
    const loudToken = await register(loud);
    await as(app, quiet).ok(notificationSettingsSchema, "PATCH", "/v1/me/notifications", {
      body: { pushMessages: false },
    });
    await as(app, loud).ok(notificationSettingsSchema, "PATCH", "/v1/me/notifications", {
      body: { pushPreview: true },
    });

    await send(owner, group.id, "Kahvaltı 10:30");
    expect(app.sentPush).toEqual([
      {
        to: loudToken,
        title: "Ayşe · Hafta Sonu",
        body: "Kahvaltı 10:30",
        data: { type: "message", conversationId: group.id, eventId: expect.any(String) as unknown },
      },
    ]);
  });

  it("çıkış yapılan ya da kapatılan oturuma bildirim gitmez; adres silinir", async () => {
    const { ayse, mehmet, id } = await directChat();
    await register(mehmet);
    await as(app, mehmet).done("POST", "/v1/auth/logout");
    const left = await app.db.many(sql`select 1 from push_tokens where user_id = ${mehmet.id}`);
    expect(left).toHaveLength(0);
    await send(ayse, id, "Orada mısın?");
    expect(app.sentPush).toEqual([]);
  });

  it("aynı cihaz adresi başka hesapla kaydedilince önceki hesaptan alınır", async () => {
    const { ayse, mehmet, id } = await directChat();
    const shared = pushToken();
    await as(app, mehmet).done("PUT", "/v1/me/push-token", { body: { token: shared } });
    const other = await createUser(app, "Aynı telefondaki hesap");
    await as(app, other).done("PUT", "/v1/me/push-token", { body: { token: shared } });
    await send(ayse, id, "Mehmet'e");
    expect(app.sentPush).toEqual([]);
    const owner = await app.db.one<{ user_id: string }>(
      sql`select user_id from push_tokens where token = ${shared}`,
    );
    expect(owner.user_id).toBe(other.id);
  });

  it("sağlayıcının geçersiz dediği adres silinir", async () => {
    const { ayse, mehmet, id } = await directChat();
    const token = await register(mehmet);
    app.invalidPushTokens.add(token);
    await send(ayse, id, "İlk");
    expect(app.sentPush).toHaveLength(1);
    const left = await app.db.many(sql`select 1 from push_tokens where token = ${token}`);
    expect(left).toHaveLength(0);
    app.sentPush.length = 0;
    await send(ayse, id, "İkinci");
    expect(app.sentPush).toEqual([]);
  });

  it("adres biçimi denetlenir; adres silinebilir", async () => {
    const user = await createUser(app, "Biçim");
    const client = as(app, user);
    for (const token of ["", "abc", "ExponentPushToken[]", "ExponentPushToken[a b]"]) {
      await client.fail("validation_failed", "PUT", "/v1/me/push-token", { body: { token } });
    }
    await register(user);
    await client.done("DELETE", "/v1/me/push-token");
    const left = await app.db.many(sql`select 1 from push_tokens where user_id = ${user.id}`);
    expect(left).toHaveLength(0);
  });

  it("yeni cihazdan girişte diğer cihazlara güvenlik bildirimi gider", async () => {
    const user = await createUser(app, "Güvenlik");
    const token = await register(user);
    // Mesaj bildirimini kapatmak güvenlik bildirimini etkilemez.
    await as(app, user).ok(notificationSettingsSchema, "PATCH", "/v1/me/notifications", {
      body: { pushMessages: false },
    });
    const guest = anonymous(app);
    await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", {
      body: { phone: user.phone },
    });
    const result = await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", {
      body: {
        phone: user.phone,
        code: "000000",
        acceptedTermsVersion: TERMS_VERSION,
        deviceName: "Yabancı Telefon",
        platform: "ios",
        deviceId: "yabanci-cihaz-0000-0001",
      },
    });
    expect(result.user.id).toBe(user.id);
    await app.services.notifications.idle();
    expect(app.sentPush).toEqual([
      {
        to: token,
        title: "Yeni cihazdan giriş",
        body: 'Hesabına "Yabancı Telefon" cihazından giriş yapıldı. Sen değilsen Ben › Oturumlar ekranından bu oturumu kapat.',
        data: { type: "new_device", eventId: expect.any(String) as unknown },
      },
    ]);
  });

  it("kural veritabanında da geçerlidir: adres yalnızca sahibinin açık oturumuna yazılır", async () => {
    const owner = await createUser(app, "Sahip");
    const intruder = await createUser(app, "Başkası");
    await expect(
      app.db.execute(sql`
        insert into push_tokens (session_id, user_id, token)
        values (${owner.sessionId}, ${intruder.id}, ${pushToken()})
      `),
    ).rejects.toThrow(/açık ve kullanıcıya ait bir oturuma/);
    await expect(
      app.db.execute(sql`
        insert into push_tokens (session_id, user_id, token)
        values (${owner.sessionId}, ${owner.id}, 'gecersiz')
      `),
    ).rejects.toThrow(/push_tokens_token_check/);

    await register(owner);
    await app.db.execute(sql`update sessions set revoked_at = now() where id = ${owner.sessionId}`);
    const left = await app.db.many(sql`select 1 from push_tokens where user_id = ${owner.id}`);
    expect(left).toHaveLength(0);
  });
});
