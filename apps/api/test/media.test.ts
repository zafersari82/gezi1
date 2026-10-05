import { MEDIA_MAX_BYTES, mediaSchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  as,
  createUser,
  multipartBody,
  startTestApp,
  type TestApp,
  type TestUser,
  TINY_PNG,
} from "./support/harness";

describe("medya", () => {
  let app: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    app = await startTestApp();
    user = await createUser(app, "Ayşe");
  });
  afterAll(() => app.stop());

  function upload(field: string, data: Buffer, token: string | null = user.token) {
    const { payload, headers } = multipartBody(field, "dosya.bin", data);
    return app.server.inject({
      method: "POST",
      url: "/v1/media",
      headers: token === null ? headers : { ...headers, authorization: `Bearer ${token}` },
      payload,
    });
  }

  it("görseli yükler ve herkese açık adresten sunar", async () => {
    const response = await upload("file", TINY_PNG);
    expect(response.statusCode).toBe(200);
    const media = mediaSchema.parse(response.json());
    expect(media).toMatchObject({ contentType: "image/png", byteSize: TINY_PNG.length });
    expect(media.url.startsWith(`${app.config.publicUrl}/media/`)).toBe(true);

    const served = await app.server.inject({
      method: "GET",
      url: media.url.slice(app.config.publicUrl.length),
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(served.rawPayload.equals(TINY_PNG)).toBe(true);
  });

  it("türü dosya adına değil içeriğe bakarak belirler", async () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
    const response = await upload("file", jpeg);
    expect(mediaSchema.parse(response.json()).contentType).toBe("image/jpeg");
  });

  it.each([
    ["HTML içeriği", Buffer.from("<html><script>alert(1)</script></html>")],
    ["SVG içeriği", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ["boş olmayan rastgele veri", Buffer.from("merhaba dünya")],
  ])("görsel olmayan dosyayı reddeder: %s", async (_label, data) => {
    const response = await upload("file", data);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "media_invalid" } });
  });

  it("boyut sınırını aşan dosyayı reddeder", async () => {
    const oversized = Buffer.concat([TINY_PNG, Buffer.alloc(MEDIA_MAX_BYTES)]);
    const response = await upload("file", oversized);
    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: { code: "media_too_large" } });
  });

  it("yanlış alan adıyla ve oturumsuz yüklemeyi reddeder", async () => {
    const wrongField = await upload("avatar", TINY_PNG);
    expect(wrongField.json()).toMatchObject({ error: { code: "media_invalid" } });

    const anonymous = await upload("file", TINY_PNG, null);
    expect(anonymous.statusCode).toBe(401);

    await as(app, user).fail("media_invalid", "POST", "/v1/media", { body: { file: "metin" } });
  });

  it("klasör dışına çıkan adresleri sunmaz", async () => {
    const response = await app.server.inject({
      method: "GET",
      url: "/media/..%2F..%2Fpackage.json",
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
