import { momentSchema, pageOf } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  as,
  createUser,
  isServed,
  makeContacts,
  startTestApp,
  type TestApp,
  type TestUser,
  uploadImage,
} from "./support/harness";

const feed = pageOf(momentSchema);

describe("Anlar", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.stop());

  function share(user: TestUser, body: string) {
    return as(app, user).ok(momentSchema, "POST", "/v1/moments", { body: { body } });
  }

  it("metin ve fotoğraflı paylaşım oluşturur", async () => {
    const ayse = await createUser(app, "Ayşe");
    const first = await uploadImage(app, ayse);
    const second = await uploadImage(app, ayse);

    const moment = await as(app, ayse).ok(momentSchema, "POST", "/v1/moments", {
      body: { body: "Kadıköy'de gün batımı", mediaIds: [second.id, first.id] },
    });
    expect(moment).toMatchObject({
      author: { id: ayse.id, displayName: "Ayşe" },
      body: "Kadıköy'de gün batımı",
      imageUrls: [second.url, first.url],
      likedByMe: false,
      likes: [],
      comments: [],
    });
  });

  it("boş paylaşımı ve başkasının görselini reddeder", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    const image = await uploadImage(app, mehmet);

    await as(app, ayse).fail("moment_empty", "POST", "/v1/moments", { body: {} });
    await as(app, ayse).fail("moment_empty", "POST", "/v1/moments", { body: { body: "   " } });
    await as(app, ayse).fail("media_not_found", "POST", "/v1/moments", {
      body: { mediaIds: [image.id] },
    });
  });

  it("akışta kendi paylaşımları ve kişilerinin paylaşımları görünür", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    const stranger = await createUser(app, "Yabancı");
    await makeContacts(app, ayse, mehmet);

    await share(ayse, "Ayşe'den");
    await share(mehmet, "Mehmet'ten");
    await share(stranger, "Yabancıdan");

    const items = (await as(app, ayse).ok(feed, "GET", "/v1/moments")).items;
    expect(items.map((moment) => moment.body)).toEqual(["Mehmet'ten", "Ayşe'den"]);
    expect((await as(app, stranger).ok(feed, "GET", "/v1/moments")).items).toHaveLength(1);
  });

  it("akışı sayfalar", async () => {
    const ayse = await createUser(app, "Ayşe");
    for (const text of ["1", "2", "3"]) await share(ayse, text);

    const first = await as(app, ayse).ok(feed, "GET", "/v1/moments?limit=2");
    expect(first.items.map((moment) => moment.body)).toEqual(["3", "2"]);
    const rest = await as(app, ayse).ok(
      feed,
      "GET",
      `/v1/moments?limit=2&cursor=${first.nextCursor}`,
    );
    expect(rest.items.map((moment) => moment.body)).toEqual(["1"]);
    expect(rest.nextCursor).toBeNull();
  });

  it("beğeni eklenir ve geri alınır", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    await makeContacts(app, ayse, mehmet);
    const moment = await share(ayse, "Beğenilecek");
    const url = `/v1/moments/${moment.id}/like`;

    const liked = await as(app, mehmet).ok(momentSchema, "PUT", url);
    expect(liked.likedByMe).toBe(true);
    expect(liked.likes.map((user) => user.id)).toEqual([mehmet.id]);

    await as(app, mehmet).ok(momentSchema, "PUT", url);
    const seenByAuthor = (await as(app, ayse).ok(feed, "GET", "/v1/moments")).items[0];
    expect(seenByAuthor?.likes).toHaveLength(1);
    expect(seenByAuthor?.likedByMe).toBe(false);

    const unliked = await as(app, mehmet).ok(momentSchema, "DELETE", url);
    expect(unliked.likes).toHaveLength(0);
  });

  it("göremediği paylaşımla etkileşime giremez", async () => {
    const ayse = await createUser(app, "Ayşe");
    const stranger = await createUser(app, "Yabancı");
    const moment = await share(ayse, "Yalnızca kişilerime");

    await as(app, stranger).fail("moment_not_found", "PUT", `/v1/moments/${moment.id}/like`);
    await as(app, stranger).fail("moment_not_found", "POST", `/v1/moments/${moment.id}/comments`, {
      body: { body: "İzinsiz yorum" },
    });
  });

  it("ortak kişi olmayanların beğeni ve yorumlarını gizler", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    const zeynep = await createUser(app, "Zeynep");
    await makeContacts(app, ayse, mehmet);
    await makeContacts(app, ayse, zeynep);
    const moment = await share(ayse, "İki ayrı çevre");

    await as(app, mehmet).ok(momentSchema, "PUT", `/v1/moments/${moment.id}/like`);
    await as(app, mehmet).ok(momentSchema, "POST", `/v1/moments/${moment.id}/comments`, {
      body: { body: "Mehmet'in yorumu" },
    });
    await as(app, ayse).ok(momentSchema, "POST", `/v1/moments/${moment.id}/comments`, {
      body: { body: "Ayşe'nin yanıtı" },
    });

    const seenByZeynep = (await as(app, zeynep).ok(feed, "GET", "/v1/moments")).items[0];
    expect(seenByZeynep?.likes).toHaveLength(0);
    expect(seenByZeynep?.comments.map((comment) => comment.body)).toEqual(["Ayşe'nin yanıtı"]);

    const seenByAyse = (await as(app, ayse).ok(feed, "GET", "/v1/moments")).items[0];
    expect(seenByAyse?.likes).toHaveLength(1);
    expect(seenByAyse?.comments).toHaveLength(2);
  });

  it("yorumu sahibi veya paylaşım sahibi siler; başkası silemez", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    const zeynep = await createUser(app, "Zeynep");
    await makeContacts(app, ayse, mehmet);
    await makeContacts(app, ayse, zeynep);
    await makeContacts(app, mehmet, zeynep);
    const moment = await share(ayse, "Yorumlu");

    const commented = await as(app, mehmet).ok(
      momentSchema,
      "POST",
      `/v1/moments/${moment.id}/comments`,
      {
        body: { body: "Silinecek" },
      },
    );
    const commentId = commented.comments[0]?.id ?? "";
    const url = `/v1/moments/${moment.id}/comments/${commentId}`;

    await as(app, zeynep).fail("moment_not_found", "DELETE", url);
    const cleaned = await as(app, ayse).ok(momentSchema, "DELETE", url);
    expect(cleaned.comments).toHaveLength(0);
  });

  it("paylaşımı yalnızca sahibi siler", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    await makeContacts(app, ayse, mehmet);
    const moment = await share(ayse, "Silinecek paylaşım");

    await as(app, mehmet).fail("moment_not_found", "DELETE", `/v1/moments/${moment.id}`);
    await as(app, ayse).done("DELETE", `/v1/moments/${moment.id}`);
    expect((await as(app, ayse).ok(feed, "GET", "/v1/moments")).items).toHaveLength(0);
  });

  it("paylaşım silinince fotoğrafı da silinir; mesajda da kullanılan fotoğraf kalır", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    await makeContacts(app, ayse, mehmet);
    const onlyInMoment = await uploadImage(app, ayse);
    const alsoInChat = await uploadImage(app, ayse);
    const conversation = await app.services.chat.openDirect(ayse.id, mehmet.id);
    await app.services.chat.sendMessage(ayse.id, conversation.id, {
      kind: "image",
      clientId: "paylasilan-foto",
      mediaId: alsoInChat.id,
    });
    const moment = await as(app, ayse).ok(momentSchema, "POST", "/v1/moments", {
      body: { mediaIds: [onlyInMoment.id, alsoInChat.id] },
    });

    await as(app, ayse).done("DELETE", `/v1/moments/${moment.id}`);

    expect(await isServed(app, onlyInMoment.url)).toBe(false);
    expect(await isServed(app, alsoInChat.url)).toBe(true);
  });
});
