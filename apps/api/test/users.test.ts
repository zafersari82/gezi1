import {
  authResultSchema,
  contactSchema,
  listOf,
  meSchema,
  requestOtpResponseSchema,
  TERMS_VERSION,
  userProfileSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import {
  anonymous,
  as,
  createUser,
  isServed,
  makeContacts,
  startTestApp,
  type TestApp,
  uploadImage,
} from "./support/harness";

describe("kullanıcılar", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.stop());

  it("profilini günceller", async () => {
    const user = await createUser(app, "Ayşe");
    const client = as(app, user);
    const avatar = await uploadImage(app, user);

    const me = await client.ok(meSchema, "PATCH", "/v1/me", {
      body: {
        displayName: "  Ayşe Yılmaz ",
        username: `ayse_${user.id.slice(0, 8)}`,
        bio: "İstanbul",
        avatarMediaId: avatar.id,
        discoverableByPhone: false,
      },
    });
    expect(me.displayName).toBe("Ayşe Yılmaz");
    expect(me.bio).toBe("İstanbul");
    expect(me.avatarUrl).toBe(avatar.url);
    expect(me.discoverableByPhone).toBe(false);

    const cleared = await client.ok(meSchema, "PATCH", "/v1/me", { body: { avatarMediaId: null } });
    expect(cleared.avatarUrl).toBeNull();
    expect(cleared.displayName).toBe("Ayşe Yılmaz");
  });

  it("profil fotoğrafı değişince eskisini siler", async () => {
    const user = await createUser(app, "Ayşe");
    const client = as(app, user);
    const first = await uploadImage(app, user);
    const second = await uploadImage(app, user);

    await client.ok(meSchema, "PATCH", "/v1/me", { body: { avatarMediaId: first.id } });
    await client.ok(meSchema, "PATCH", "/v1/me", { body: { bio: "Fotoğraf yerinde durmalı" } });
    expect(await isServed(app, first.url)).toBe(true);

    await client.ok(meSchema, "PATCH", "/v1/me", { body: { avatarMediaId: second.id } });
    expect(await isServed(app, first.url)).toBe(false);
    expect(await isServed(app, second.url)).toBe(true);

    await client.ok(meSchema, "PATCH", "/v1/me", { body: { avatarMediaId: null } });
    expect(await isServed(app, second.url)).toBe(false);
  });

  it("geçersiz ad ve kimliği reddeder", async () => {
    const client = as(app, await createUser(app, "Mehmet"));
    await client.fail("validation_failed", "PATCH", "/v1/me", { body: { displayName: "A" } });
    await client.fail("validation_failed", "PATCH", "/v1/me", { body: { username: "Büyük Harf" } });
    await client.fail("validation_failed", "PATCH", "/v1/me", { body: { username: "1rakam" } });
  });

  it("kullanılan VADO kimliğini ikinci kişiye vermez", async () => {
    const first = await createUser(app, "Zeynep");
    const second = await createUser(app, "Can");
    const username = `zeynep_${first.id.slice(0, 8)}`;
    await as(app, first).ok(meSchema, "PATCH", "/v1/me", { body: { username } });
    await as(app, second).fail("username_taken", "PATCH", "/v1/me", { body: { username } });
  });

  it("başkasının yüklediği görseli profil fotoğrafı yapamaz", async () => {
    const owner = await createUser(app, "Elif");
    const other = await createUser(app, "Burak");
    const image = await uploadImage(app, owner);
    await as(app, other).fail("media_not_found", "PATCH", "/v1/me", {
      body: { avatarMediaId: image.id },
    });
  });

  it("telefon numarası ve VADO kimliğiyle tam eşleşme arar", async () => {
    const seeker = as(app, await createUser(app, "Arayan"));
    const target = await createUser(app, "Hedef");
    const username = `hedef_${target.id.slice(0, 8)}`;
    await as(app, target).ok(meSchema, "PATCH", "/v1/me", { body: { username } });

    const results = listOf(userProfileSchema);
    const byPhone = await seeker.ok(
      results,
      "GET",
      `/v1/users/search?q=${encodeURIComponent(target.phone)}`,
    );
    expect(byPhone.items.map((item) => item.id)).toEqual([target.id]);
    expect(byPhone.items[0]).not.toHaveProperty("phone");

    const byLocalFormat = await seeker.ok(
      results,
      "GET",
      `/v1/users/search?q=0${target.phone.slice(3)}`,
    );
    expect(byLocalFormat.items).toHaveLength(1);

    const byUsername = await seeker.ok(results, "GET", `/v1/users/search?q=@${username}`);
    expect(byUsername.items[0]?.relation).toBe("none");

    const partial = await seeker.ok(results, "GET", `/v1/users/search?q=${username.slice(0, 5)}`);
    expect(partial.items).toHaveLength(0);
  });

  it("numarayla bulunmayı kapatan kullanıcıyı telefon aramasında göstermez", async () => {
    const seeker = as(app, await createUser(app, "Arayan"));
    const hidden = await createUser(app, "Gizli");
    await as(app, hidden).ok(meSchema, "PATCH", "/v1/me", { body: { discoverableByPhone: false } });

    const found = await seeker.ok(
      listOf(userProfileSchema),
      "GET",
      `/v1/users/search?q=${encodeURIComponent(hidden.phone)}`,
    );
    expect(found.items).toHaveLength(0);
  });

  it("profilde görüntüleyene göre ilişkiyi bildirir", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    const client = as(app, ayse);

    const self = await client.ok(userProfileSchema, "GET", `/v1/users/${ayse.id}`);
    expect(self.relation).toBe("self");

    const stranger = await client.ok(userProfileSchema, "GET", `/v1/users/${mehmet.id}`);
    expect(stranger.relation).toBe("none");

    await makeContacts(app, ayse, mehmet);
    const contact = await client.ok(userProfileSchema, "GET", `/v1/users/${mehmet.id}`);
    expect(contact.relation).toBe("contact");

    await client.fail("user_not_found", "GET", "/v1/users/00000000-0000-4000-8000-000000000000");
  });

  it("hesabı siler: veriler temizlenir, numara yeniden kayıt olabilir", async () => {
    const leaving = await createUser(app, "Giden");
    const friend = await createUser(app, "Kalan");
    await makeContacts(app, leaving, friend);
    const conversation = await app.services.chat.openDirect(leaving.id, friend.id);
    const avatar = await uploadImage(app, leaving);
    const momentPhoto = await uploadImage(app, leaving);
    const chatPhoto = await uploadImage(app, leaving);
    await as(app, leaving).ok(meSchema, "PATCH", "/v1/me", { body: { avatarMediaId: avatar.id } });
    await app.services.moments.create(leaving.id, "Son paylaşım", [momentPhoto.id]);
    await app.services.chat.sendMessage(leaving.id, conversation.id, {
      kind: "image",
      clientId: "veda-fotografi",
      mediaId: chatPhoto.id,
    });
    await app.services.chat.sendMessage(leaving.id, conversation.id, {
      kind: "text",
      clientId: "veda-mesaji",
      body: "Hoşça kal",
    });

    await as(app, leaving).done("DELETE", "/v1/me");

    // Profil ve paylaşım fotoğrafları silinir; sohbete gönderilen fotoğraf karşı tarafta kalır.
    expect(await isServed(app, avatar.url)).toBe(false);
    expect(await isServed(app, momentPhoto.url)).toBe(false);
    expect(await isServed(app, chatPhoto.url)).toBe(true);

    await as(app, leaving).fail("unauthorized", "GET", "/v1/me");
    const row = await app.db.one<{
      phone: string | null;
      display_name: string | null;
      status: string;
    }>(sql`
      select phone, display_name, status from users where id = ${leaving.id}
    `);
    expect(row).toEqual({ phone: null, display_name: null, status: "deleted" });

    const contacts = await as(app, friend).ok(listOf(contactSchema), "GET", "/v1/contacts");
    expect(contacts.items).toHaveLength(0);

    const history = await app.services.chat.getConversation(friend.id, conversation.id);
    expect(history.title).toBe("Silinmiş Hesap");
    expect(history.lastMessage?.body).toBe("Hoşça kal");

    const guest = anonymous(app);
    await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", {
      body: { phone: leaving.phone },
    });
    const fresh = await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", {
      body: {
        phone: leaving.phone,
        code: "000000",
        acceptedTermsVersion: TERMS_VERSION,
        deviceName: "Yeni telefon",
        platform: "ios",
        deviceId: "test-cihazi-0000-0002",
      },
    });
    expect(fresh.user.id).not.toBe(leaving.id);
  });
});
