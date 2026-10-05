import { createHash, createPublicKey, verify } from "node:crypto";

import {
  IDENTITY_TOKEN_TTL_SECONDS,
  type IdentityKeySet,
  identityKeySetSchema,
  miniAppIdentitySchema,
  miniAppIdentityTokenSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIdentitySigner } from "../src/core/identity-tokens";
import { createAppKeys, type KeyEntry } from "../src/core/keys";
import {
  anonymous,
  as,
  asAdmin,
  createUser,
  startTestApp,
  type TestApp,
  type TestUser,
} from "./support/harness";
import { publishSample } from "./support/packages";

interface Claims {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Mini uygulamanın sunucusunun yapacağı doğrulama, yalnızca Node.js'in kendi modülleriyle:
 * başlıktaki `kid` ile anahtarı seçer, Ed25519 imzasını denetler, içeriği çözer.
 */
function verifyToken(token: string, keySet: IdentityKeySet): Claims | null {
  const [header = "", payload = "", signature = ""] = token.split(".");
  const { alg, kid } = JSON.parse(Buffer.from(header, "base64url").toString()) as {
    alg: string;
    kid: string;
  };
  const jwk = keySet.keys.find((candidate) => candidate.kid === kid);
  if (alg !== "EdDSA" || jwk === undefined) return null;
  const key = createPublicKey({ key: jwk, format: "jwk" });
  const valid = verify(
    null,
    Buffer.from(`${header}.${payload}`),
    key,
    Buffer.from(signature, "base64url"),
  );
  return valid ? (JSON.parse(Buffer.from(payload, "base64url").toString()) as Claims) : null;
}

const seed = (text: string) => createHash("sha256").update(text).digest();
const entry = (id: string, text: string, validThrough: string | null = null): KeyEntry => ({
  id,
  key: seed(text),
  validThrough,
});

describe("mini uygulama kimlik belirteci", () => {
  let app: TestApp;
  let user: TestUser;
  let keySet: IdentityKeySet;

  beforeAll(async () => {
    app = await startTestApp();
    user = await createUser(app, "Belirteç Sahibi");
    keySet = await anonymous(app).ok(identityKeySetSchema, "GET", "/v1/identity-keys");
  });
  afterAll(() => app.stop());

  it("açık anahtarlar oturumsuz ve önbelleklenebilir biçimde yayımlanır", async () => {
    expect(keySet.keys.map(({ x: _x, ...rest }) => rest)).toEqual([
      { kty: "OKP", crv: "Ed25519", kid: "dev", use: "sig", alg: "EdDSA" },
    ]);
    expect(keySet.keys[0]?.x).toMatch(/^[\w-]{43}$/);
    const response = await app.server.inject({ method: "GET", url: "/v1/identity-keys" });
    expect(response.headers["cache-control"]).toBe("public, max-age=600");
  });

  it("belirteç VADO'nun açık anahtarıyla doğrulanır; kaydı, takma kimliği ve süreyi taşır", async () => {
    const { miniApp } = await publishSample(app, { manifest: { permissions: ["identity.basic"] } });
    const client = as(app, user);
    const issued = await client.ok(
      miniAppIdentityTokenSchema,
      "POST",
      `/v1/miniapps/${miniApp.id}/identity-token`,
    );
    const identity = await client.ok(
      miniAppIdentitySchema,
      "GET",
      `/v1/miniapps/${miniApp.id}/identity`,
    );

    const claims = verifyToken(issued.token, keySet);
    expect(claims).toMatchObject({
      iss: app.config.publicUrl,
      aud: miniApp.id,
      sub: identity.openId,
    });
    expect(claims?.sub).not.toBe(user.id);
    expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBe(IDENTITY_TOKEN_TTL_SECONDS);
    expect(Date.parse(issued.expiresAt)).toBe((claims?.exp ?? 0) * 1000);
    // Belirteçte ad, telefon ya da gerçek kullanıcı kimliği yoktur.
    expect(Object.keys(claims ?? {}).sort()).toEqual(["aud", "exp", "iat", "iss", "jti", "sub"]);

    const second = await client.ok(
      miniAppIdentityTokenSchema,
      "POST",
      `/v1/miniapps/${miniApp.id}/identity-token`,
    );
    expect(verifyToken(second.token, keySet)?.jti).not.toBe(claims?.jti);
  });

  it("içeriği değiştirilmiş belirtecin imzası tutmaz", async () => {
    const { miniApp } = await publishSample(app, { manifest: { permissions: ["identity.basic"] } });
    const { token } = await as(app, user).ok(
      miniAppIdentityTokenSchema,
      "POST",
      `/v1/miniapps/${miniApp.id}/identity-token`,
    );
    const [header = "", payload = "", signature = ""] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Claims;
    const forged = Buffer.from(JSON.stringify({ ...claims, aud: "baska-kayit" })).toString(
      "base64url",
    );
    expect(verifyToken(`${header}.${forged}.${signature}`, keySet)).toBeNull();
  });

  it("aynı kullanıcı için iki kaydın belirteçleri birbirinin yerine geçmez", async () => {
    const permissions = { manifest: { permissions: ["identity.basic"] } };
    const first = (await publishSample(app, permissions)).miniApp;
    const second = (await publishSample(app, permissions)).miniApp;
    const token = (id: string) =>
      as(app, user).ok(miniAppIdentityTokenSchema, "POST", `/v1/miniapps/${id}/identity-token`);
    const a = verifyToken((await token(first.id)).token, keySet);
    const b = verifyToken((await token(second.id)).token, keySet);
    expect(a?.aud).toBe(first.id);
    expect(b?.aud).toBe(second.id);
    expect(a?.sub).not.toBe(b?.sub);
  });

  it("kimlik yetkisi istemeyen, kapalı ya da olmayan kayıt için belirteç verilmez; oturum gerekir", async () => {
    const { miniApp } = await publishSample(app);
    const client = as(app, user);
    await client.fail("forbidden", "POST", `/v1/miniapps/${miniApp.id}/identity-token`);

    const closed = (await publishSample(app, { manifest: { permissions: ["identity.basic"] } }))
      .miniApp;
    await asAdmin(app).done("PATCH", `/v1/admin/miniapps/${closed.id}`, {
      body: { enabled: false },
    });
    await client.fail("miniapp_not_found", "POST", `/v1/miniapps/${closed.id}/identity-token`);
    await client.fail("miniapp_not_found", "POST", "/v1/miniapps/olmayan-kayit/identity-token");
    await anonymous(app).fail("unauthorized", "POST", `/v1/miniapps/${closed.id}/identity-token`);
  });
});

describe("kimlik belirteci anahtar halkası", () => {
  const NOW = Date.parse("2026-10-05T12:00:00Z");

  it("güncel anahtarla imzalar; eski anahtar süresi dolana kadar yayımlanır, sonra çıkar", () => {
    const ring = [entry("k2", "yeni"), entry("k1", "eski", "2026-10-06")];
    const before = createIdentitySigner(ring, () => NOW);
    expect(before.publicKeys().map((key) => key.kid)).toEqual(["k2", "k1"]);

    const { token } = before.sign({
      issuer: "https://api",
      audience: "a",
      subject: "s",
      ttlSeconds: 60,
    });
    const header = JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString()) as {
      kid: string;
    };
    expect(header.kid).toBe("k2");
    expect(verifyToken(token, { keys: before.publicKeys() })).not.toBeNull();

    const after = createIdentitySigner(ring, () => Date.parse("2026-10-07T00:00:01Z"));
    expect(after.publicKeys().map((key) => key.kid)).toEqual(["k2"]);
  });

  it("eski anahtarın imzaladığı belirteç, eski anahtar listede kaldıkça doğrulanır", () => {
    const old = createIdentitySigner([entry("k1", "eski")], () => NOW);
    const { token } = old.sign({
      issuer: "https://api",
      audience: "a",
      subject: "s",
      ttlSeconds: 60,
    });
    const rotated = createIdentitySigner(
      [entry("k2", "yeni"), entry("k1", "eski", "2026-10-06")],
      () => NOW,
    );
    expect(verifyToken(token, { keys: rotated.publicKeys() })).not.toBeNull();
    const dropped = createIdentitySigner([entry("k2", "yeni")], () => NOW);
    expect(verifyToken(token, { keys: dropped.publicKeys() })).toBeNull();
  });

  it("kimlik belirteci anahtarı diğer ailelerden bağımsızdır", () => {
    const keys = createAppKeys({
      otp: [entry("k1", "otp")],
      qr: [entry("k1", "qr")],
      openId: seed("openid"),
      identity: [entry("k1", "kimlik")],
    });
    const other = createAppKeys({
      otp: [entry("k1", "otp")],
      qr: [entry("k1", "qr")],
      openId: seed("openid"),
      identity: [entry("k1", "baska")],
    });
    expect(keys.openId("a", "u")).toBe(other.openId("a", "u"));
    expect(keys.identity.publicKeys()[0]?.x).not.toBe(other.identity.publicKeys()[0]?.x);
  });
});
