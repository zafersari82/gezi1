import {
  conversationDetailSchema,
  conversationSchema,
  listOf,
  meSchema,
  messageSchema,
  pageOf,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  as,
  createUser,
  makeContacts,
  startTestApp,
  type TestApp,
  type TestUser,
  uploadImage,
} from "./support/harness";

const conversations = listOf(conversationSchema);
const messages = pageOf(messageSchema);
let clientIdCounter = 0;
const nextClientId = () => `test-client-${(clientIdCounter += 1)}`;

describe("sohbet", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.stop());

  async function contactsPair(): Promise<[TestUser, TestUser]> {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    await makeContacts(app, ayse, mehmet);
    return [ayse, mehmet];
  }

  function sendText(user: TestUser, conversationId: string, body: string) {
    return as(app, user).ok(messageSchema, "POST", `/v1/conversations/${conversationId}/messages`, {
      body: { kind: "text", clientId: nextClientId(), body },
    });
  }

  describe("birebir", () => {
    it("yalnızca kişiler arasında açılır ve aynı çift için tek sohbet vardır", async () => {
      const [ayse, mehmet] = await contactsPair();
      const stranger = await createUser(app, "Yabancı");

      await as(app, ayse).fail("not_contacts", "POST", "/v1/conversations/direct", {
        body: { userId: stranger.id },
      });
      await as(app, ayse).fail("cannot_target_self", "POST", "/v1/conversations/direct", {
        body: { userId: ayse.id },
      });

      const first = await as(app, ayse).ok(
        conversationDetailSchema,
        "POST",
        "/v1/conversations/direct",
        {
          body: { userId: mehmet.id },
        },
      );
      const second = await as(app, mehmet).ok(
        conversationDetailSchema,
        "POST",
        "/v1/conversations/direct",
        {
          body: { userId: ayse.id },
        },
      );
      expect(second.id).toBe(first.id);
      expect(first).toMatchObject({
        kind: "direct",
        title: "Mehmet",
        peerId: mehmet.id,
        memberCount: 2,
      });
      expect(second.title).toBe("Ayşe");
    });

    it("mesaj yazılmamış sohbet listede görünmez; ilk mesajla görünür", async () => {
      const [ayse, mehmet] = await contactsPair();
      const conversation = await app.services.chat.openDirect(ayse.id, mehmet.id);
      expect(
        (await as(app, ayse).ok(conversations, "GET", "/v1/conversations")).items,
      ).toHaveLength(0);

      await sendText(ayse, conversation.id, "Selam");
      const list = await as(app, mehmet).ok(conversations, "GET", "/v1/conversations");
      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({
        id: conversation.id,
        unreadCount: 1,
        lastMessage: { body: "Selam", senderId: ayse.id, senderName: "Ayşe" },
      });
    });

    it("okunmamış sayısını tutar ve okundu bilgisi geriye gitmez", async () => {
      const [ayse, mehmet] = await contactsPair();
      const conversation = await app.services.chat.openDirect(ayse.id, mehmet.id);
      const first = await sendText(ayse, conversation.id, "Bir");
      const second = await sendText(ayse, conversation.id, "İki");
      await sendText(ayse, conversation.id, "Üç");

      const unreadOf = async (user: TestUser) =>
        (
          await as(app, user).ok(
            conversationDetailSchema,
            "GET",
            `/v1/conversations/${conversation.id}`,
          )
        ).unreadCount;
      expect(await unreadOf(mehmet)).toBe(3);
      expect(await unreadOf(ayse)).toBe(0);

      await as(app, mehmet).done("POST", `/v1/conversations/${conversation.id}/read`, {
        body: { seq: second.seq },
      });
      expect(await unreadOf(mehmet)).toBe(1);

      await as(app, mehmet).done("POST", `/v1/conversations/${conversation.id}/read`, {
        body: { seq: first.seq },
      });
      expect(await unreadOf(mehmet)).toBe(1);

      await as(app, mehmet).done("POST", `/v1/conversations/${conversation.id}/read`, {
        body: { seq: 9_999_999 },
      });
      const detail = await as(app, ayse).ok(
        conversationDetailSchema,
        "GET",
        `/v1/conversations/${conversation.id}`,
      );
      const reader = detail.members.find((member) => member.id === mehmet.id);
      expect(reader?.lastReadSeq).toBe(detail.lastMessage?.seq);
    });

    it("aynı istemci kimliğiyle yinelenen gönderim mesajı çoğaltmaz", async () => {
      const [ayse, mehmet] = await contactsPair();
      const conversation = await app.services.chat.openDirect(ayse.id, mehmet.id);
      const body = { kind: "text", clientId: nextClientId(), body: "Tek mesaj" };
      const url = `/v1/conversations/${conversation.id}/messages`;

      const first = await as(app, ayse).ok(messageSchema, "POST", url, { body });
      const retry = await as(app, ayse).ok(messageSchema, "POST", url, { body });
      expect(retry.id).toBe(first.id);
      expect((await as(app, ayse).ok(messages, "GET", url)).items).toHaveLength(1);
    });

    it("mesajları yeniden eskiye sayfalar", async () => {
      const [ayse, mehmet] = await contactsPair();
      const conversation = await app.services.chat.openDirect(ayse.id, mehmet.id);
      for (const text of ["1", "2", "3", "4", "5"]) await sendText(ayse, conversation.id, text);
      const url = `/v1/conversations/${conversation.id}/messages`;

      const newest = await as(app, mehmet).ok(messages, "GET", `${url}?limit=2`);
      expect(newest.items.map((message) => message.body)).toEqual(["5", "4"]);
      const older = await as(app, mehmet).ok(
        messages,
        "GET",
        `${url}?limit=2&cursor=${newest.nextCursor}`,
      );
      expect(older.items.map((message) => message.body)).toEqual(["3", "2"]);
      const oldest = await as(app, mehmet).ok(
        messages,
        "GET",
        `${url}?limit=2&cursor=${older.nextCursor}`,
      );
      expect(oldest.items.map((message) => message.body)).toEqual(["1"]);
      expect(oldest.nextCursor).toBeNull();
    });

    it("fotoğraf mesajı gönderir; başkasının görselini kullanamaz", async () => {
      const [ayse, mehmet] = await contactsPair();
      const conversation = await app.services.chat.openDirect(ayse.id, mehmet.id);
      const url = `/v1/conversations/${conversation.id}/messages`;
      const image = await uploadImage(app, ayse);

      const sent = await as(app, ayse).ok(messageSchema, "POST", url, {
        body: { kind: "image", clientId: nextClientId(), mediaId: image.id },
      });
      expect(sent).toMatchObject({ kind: "image", imageUrl: image.url, body: "" });
      await as(app, mehmet).fail("media_not_found", "POST", url, {
        body: { kind: "image", clientId: nextClientId(), mediaId: image.id },
      });
    });

    it("boş ve çok uzun mesajı reddeder", async () => {
      const [ayse, mehmet] = await contactsPair();
      const conversation = await app.services.chat.openDirect(ayse.id, mehmet.id);
      const url = `/v1/conversations/${conversation.id}/messages`;
      await as(app, ayse).fail("validation_failed", "POST", url, {
        body: { kind: "text", clientId: nextClientId(), body: "   " },
      });
      await as(app, ayse).fail("validation_failed", "POST", url, {
        body: { kind: "text", clientId: nextClientId(), body: "a".repeat(4001) },
      });
    });

    it("üye olmayan kişi sohbeti okuyamaz ve yazamaz", async () => {
      const [ayse, mehmet] = await contactsPair();
      const outsider = await createUser(app, "Yabancı");
      const conversation = await app.services.chat.openDirect(ayse.id, mehmet.id);
      const url = `/v1/conversations/${conversation.id}`;

      await as(app, outsider).fail("conversation_not_found", "GET", url);
      await as(app, outsider).fail("conversation_not_found", "GET", `${url}/messages`);
      await as(app, outsider).fail("conversation_not_found", "POST", `${url}/messages`, {
        body: { kind: "text", clientId: nextClientId(), body: "İzinsiz" },
      });
      await as(app, outsider).fail("conversation_not_found", "POST", `${url}/read`, {
        body: { seq: 1 },
      });
    });

    it("kişilikten çıkarılınca geçmiş okunur ama yeni mesaj gönderilemez", async () => {
      const [ayse, mehmet] = await contactsPair();
      const conversation = await app.services.chat.openDirect(ayse.id, mehmet.id);
      await sendText(ayse, conversation.id, "Önceki mesaj");
      await as(app, mehmet).done("PUT", `/v1/blocks/${ayse.id}`);

      const url = `/v1/conversations/${conversation.id}/messages`;
      expect((await as(app, ayse).ok(messages, "GET", url)).items).toHaveLength(1);
      await as(app, ayse).fail("not_contacts", "POST", url, {
        body: { kind: "text", clientId: nextClientId(), body: "Ulaşmamalı" },
      });
    });
  });

  describe("grup", () => {
    async function groupOf(owner: TestUser, members: TestUser[], title = "Hafta Sonu") {
      for (const member of members) await makeContacts(app, owner, member);
      return as(app, owner).ok(conversationDetailSchema, "POST", "/v1/conversations/group", {
        body: { title, memberIds: members.map((member) => member.id) },
      });
    }

    it("kurucu sahip olur ve kuruluş sistem mesajıyla duyurulur", async () => {
      const owner = await createUser(app, "Ayşe");
      const member = await createUser(app, "Mehmet");
      const group = await groupOf(owner, [member]);

      expect(group).toMatchObject({
        kind: "group",
        title: "Hafta Sonu",
        memberCount: 2,
        peerId: null,
      });
      expect(group.members.find((item) => item.id === owner.id)?.role).toBe("owner");
      expect(group.lastMessage).toMatchObject({
        kind: "system",
        body: "Ayşe grubu oluşturdu",
        senderId: null,
      });

      const list = await as(app, member).ok(conversations, "GET", "/v1/conversations");
      expect(list.items[0]).toMatchObject({ id: group.id, unreadCount: 0 });
    });

    it("sistem mesajları ad değişikliğini ve hesap silmeyi yansıtır", async () => {
      const owner = await createUser(app, "Ayşe");
      const member = await createUser(app, "Mehmet");
      const group = await groupOf(owner, [member]);
      const url = `/v1/conversations/${group.id}/messages`;

      await as(app, owner).ok(meSchema, "PATCH", "/v1/me", {
        body: { displayName: "Ayşe Yılmaz" },
      });
      const renamed = await as(app, member).ok(messages, "GET", url);
      expect(renamed.items.map((item) => item.body)).toEqual(["Ayşe Yılmaz grubu oluşturdu"]);

      await as(app, owner).done("DELETE", "/v1/me");
      const afterDeletion = await as(app, member).ok(messages, "GET", url);
      expect(afterDeletion.items.map((item) => item.body)).toEqual([
        "Silinmiş Hesap gruptan ayrıldı",
        "Silinmiş Hesap grubu oluşturdu",
      ]);
      const list = await as(app, member).ok(conversations, "GET", "/v1/conversations");
      expect(list.items.find((item) => item.id === group.id)?.lastMessage?.body).toBe(
        "Silinmiş Hesap gruptan ayrıldı",
      );
    });

    it("yalnızca kurucunun kişileri eklenebilir", async () => {
      const owner = await createUser(app, "Ayşe");
      const stranger = await createUser(app, "Yabancı");
      await as(app, owner).fail("not_contacts", "POST", "/v1/conversations/group", {
        body: { title: "Olmaz", memberIds: [stranger.id] },
      });
    });

    it("grup mesajı tüm üyelere okunmamış olarak düşer", async () => {
      const owner = await createUser(app, "Ayşe");
      const first = await createUser(app, "Mehmet");
      const second = await createUser(app, "Zeynep");
      const group = await groupOf(owner, [first, second]);
      await sendText(first, group.id, "Herkese merhaba");

      for (const [user, unread] of [
        [owner, 1],
        [second, 1],
        [first, 0],
      ] as const) {
        const list = await as(app, user).ok(conversations, "GET", "/v1/conversations");
        expect(list.items[0]?.unreadCount).toBe(unread);
      }
    });

    it("adı yalnızca sahip değiştirir", async () => {
      const owner = await createUser(app, "Ayşe");
      const member = await createUser(app, "Mehmet");
      const group = await groupOf(owner, [member]);
      const url = `/v1/conversations/${group.id}`;

      await as(app, member).fail("not_group_owner", "PATCH", url, { body: { title: "Yeni Ad" } });
      const renamed = await as(app, owner).ok(conversationDetailSchema, "PATCH", url, {
        body: { title: "Yeni Ad" },
      });
      expect(renamed.title).toBe("Yeni Ad");
      expect(renamed.lastMessage?.body).toBe('Ayşe grup adını "Yeni Ad" olarak değiştirdi');
    });

    it("her üye kendi kişisini ekleyebilir; zaten üye olan yinelenmez", async () => {
      const owner = await createUser(app, "Ayşe");
      const member = await createUser(app, "Mehmet");
      const friend = await createUser(app, "Zeynep");
      const group = await groupOf(owner, [member]);
      await makeContacts(app, member, friend);
      const url = `/v1/conversations/${group.id}/members`;

      await as(app, owner).fail("not_contacts", "POST", url, { body: { userIds: [friend.id] } });
      const updated = await as(app, member).ok(conversationDetailSchema, "POST", url, {
        body: { userIds: [friend.id, owner.id] },
      });
      expect(updated.memberCount).toBe(3);
      expect(updated.lastMessage?.body).toBe("Mehmet şu kişileri ekledi: Zeynep");
    });

    it("sahip üye çıkarabilir, üye çıkaramaz", async () => {
      const owner = await createUser(app, "Ayşe");
      const first = await createUser(app, "Mehmet");
      const second = await createUser(app, "Zeynep");
      const group = await groupOf(owner, [first, second]);
      const url = `/v1/conversations/${group.id}/members`;

      await as(app, first).fail("not_group_owner", "DELETE", `${url}/${second.id}`);
      await as(app, owner).done("DELETE", `${url}/${second.id}`);
      await as(app, second).fail("conversation_not_found", "GET", `/v1/conversations/${group.id}`);

      const detail = await as(app, owner).ok(
        conversationDetailSchema,
        "GET",
        `/v1/conversations/${group.id}`,
      );
      expect(detail.memberCount).toBe(2);
      expect(detail.lastMessage?.body).toBe("Ayşe, Zeynep adlı üyeyi gruptan çıkardı");
    });

    it("sahip ayrılınca sahiplik en eski üyeye geçer; son üye ayrılınca grup silinir", async () => {
      const owner = await createUser(app, "Ayşe");
      const member = await createUser(app, "Mehmet");
      const group = await groupOf(owner, [member]);
      const url = `/v1/conversations/${group.id}/members`;

      await as(app, owner).done("DELETE", `${url}/${owner.id}`);
      const detail = await as(app, member).ok(
        conversationDetailSchema,
        "GET",
        `/v1/conversations/${group.id}`,
      );
      expect(detail.members).toHaveLength(1);
      expect(detail.members[0]).toMatchObject({ id: member.id, role: "owner" });

      await as(app, member).done("DELETE", `${url}/${member.id}`);
      await as(app, member).fail("conversation_not_found", "GET", `/v1/conversations/${group.id}`);
    });

    it("grup işlemleri birebir sohbette yapılamaz", async () => {
      const [ayse, mehmet] = await contactsPair();
      const direct = await app.services.chat.openDirect(ayse.id, mehmet.id);
      await as(app, ayse).fail("group_only", "PATCH", `/v1/conversations/${direct.id}`, {
        body: { title: "Ad" },
      });
      await as(app, ayse).fail(
        "group_only",
        "DELETE",
        `/v1/conversations/${direct.id}/members/${ayse.id}`,
      );
    });
  });
});
