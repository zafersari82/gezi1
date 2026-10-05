import {
  adminMiniAppSchema,
  adminMiniAppSummarySchema,
  adminOverviewSchema,
  adminPackageVersionSchema,
  adminRolloutResultSchema,
  listOf,
  miniAppDetailSchema,
  miniAppIdentitySchema,
  miniAppSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { createAppKeys } from "../src/core/keys";
import { cspHash } from "../src/core/security";
import { WRAPPER_SCRIPT } from "../src/modules/miniapps/wrapper-document";
import {
  as,
  asAdmin,
  type Client,
  createUser,
  startTestApp,
  type TestApp,
  type TestUser,
} from "./support/harness";
import {
  approveVersion,
  createAppRecord,
  createPackage,
  expectUploadError,
  fetchPackageFile,
  packageArchive,
  publishApp,
  publishSample,
  unique,
  uploadVersion,
} from "./support/packages";

/** Kaydın yayındaki sürümünün sarmalayıcı belgesinin ve dosyalarının adresleri (yol kipi). */
function addresses(app: TestApp, miniApp: { id: string; release: { digest: string } | null }) {
  const root = `${app.config.publicUrl}/apps/${miniApp.id}`;
  const digest = miniApp.release?.digest ?? "";
  return { root, digest, wrapper: `${root}/wrapper/${digest}/`, files: `${root}/files/${digest}/` };
}

const CONFIG_FIELDS = [
  { key: "businessName", label: "İşletme adı", type: "text", required: true },
  { key: "seats", label: "Koltuk sayısı", type: "number", default: 2 },
];

describe("paketle yayınlanan uygulama kayıtları", () => {
  let app: TestApp;
  let admin: Client;
  let user: TestUser;

  beforeAll(async () => {
    app = await startTestApp();
    admin = asAdmin(app);
    user = await createUser(app, "Ayşe");
  });
  afterAll(() => app.stop());

  const versionUrl = (id: string, version: string) =>
    `/v1/admin/packages/${id}/versions/${version}`;
  const isListed = async (id: string) => {
    const list = await as(app, user).ok(listOf(miniAppSchema), "GET", "/v1/miniapps");
    return list.items.some((item) => item.id === id);
  };

  describe("yayınlama", () => {
    it("kayıt, onaylı bir sürüm yayınlanıp doğrulanana kadar kullanıcılara kapalıdır", async () => {
      const packageId = await createPackage(app);
      await approveVersion(app, { id: packageId, version: "1.0.0" });
      const id = await createAppRecord(app);
      const url = `/v1/admin/miniapps/${id}`;

      const created = await admin.ok(adminMiniAppSchema, "GET", url);
      expect(created).toMatchObject({
        source: "package",
        verified: false,
        offlineReason: "unpublished",
        version: null,
        entryUrl: null,
        release: null,
        releases: [],
      });

      const published = await admin.ok(adminMiniAppSchema, "POST", `${url}/releases`, {
        body: { packageId, version: "1.0.0" },
      });
      expect(published).toMatchObject({
        offlineReason: "unverified",
        version: "1.0.0",
        release: { packageId, version: "1.0.0", status: "approved" },
      });
      expect(published.releases).toMatchObject([
        { seq: 1, action: "publish", actor: { id: app.admins.owner.id } },
      ]);
      await as(app, user).fail("miniapp_not_found", "GET", `/v1/miniapps/${id}`);

      await admin.done("PATCH", url, { body: { verified: true } });
      const live = await as(app, user).ok(miniAppDetailSchema, "GET", `/v1/miniapps/${id}`);
      // Kabuk paketi değil, onu çerçeveleyen sarmalayıcı belgeyi açar.
      const { wrapper, files } = addresses(app, published);
      expect(live).toMatchObject({
        source: "package",
        version: "1.0.0",
        entryUrl: wrapper,
        scope: [wrapper, files],
        iconUrl: `${files}icon.png`,
        config: {},
      });
      expect(await isListed(id)).toBe(true);
    });

    it("yalnızca onaylı sürüm yayınlanır", async () => {
      const packageId = await createPackage(app);
      const id = await createAppRecord(app);
      const url = `/v1/admin/miniapps/${id}/releases`;
      const body = { packageId, version: "1.0.0" };

      await admin.fail("package_version_not_found", "POST", url, { body });
      await uploadVersion(app, { id: packageId, version: "1.0.0" });
      await admin.fail("miniapp_version_not_approved", "POST", url, { body });
      await admin.ok(adminPackageVersionSchema, "POST", `${versionUrl(packageId, "1.0.0")}/submit`);
      await admin.fail("miniapp_version_not_approved", "POST", url, { body });
      await admin.ok(
        adminPackageVersionSchema,
        "POST",
        `${versionUrl(packageId, "1.0.0")}/reject`,
        {
          body: { note: "Uygun değil" },
        },
      );
      await admin.fail("miniapp_version_not_approved", "POST", url, { body });
      await admin.fail(
        "miniapp_not_found",
        "POST",
        `/v1/admin/miniapps/${unique("yok")}/releases`,
        {
          body,
        },
      );
    });

    it("ayarlar sürümün bildirdiği alanlara göre doğrulanır", async () => {
      const packageId = await createPackage(app);
      await approveVersion(app, {
        id: packageId,
        version: "1.0.0",
        manifest: { config: CONFIG_FIELDS },
      });
      const id = await createAppRecord(app);
      const url = `/v1/admin/miniapps/${id}`;

      const missing = await admin.fail("miniapp_config_invalid", "POST", `${url}/releases`, {
        body: { packageId, version: "1.0.0" },
      });
      expect(missing.details).toEqual([{ key: "businessName", message: "Bu alan zorunlu." }]);
      await admin.fail("miniapp_config_invalid", "POST", `${url}/releases`, {
        body: { packageId, version: "1.0.0", config: { businessName: "Berber", logo: "x.png" } },
      });

      const published = await admin.ok(adminMiniAppSchema, "POST", `${url}/releases`, {
        body: { packageId, version: "1.0.0", config: { businessName: "Kadıköy Berber" } },
      });
      expect(published.config).toEqual({ businessName: "Kadıköy Berber", seats: 2 });

      await admin.fail("miniapp_config_invalid", "PUT", `${url}/config`, {
        body: { config: { businessName: "Kadıköy Berber", seats: "üç" } },
      });
      const changed = await admin.ok(adminMiniAppSchema, "PUT", `${url}/config`, {
        body: { config: { businessName: "Kadıköy Berber", seats: 4 } },
      });
      expect(changed.config).toEqual({ businessName: "Kadıköy Berber", seats: 4 });
      expect(changed.releases.map((release) => release.action)).toEqual(["config", "publish"]);
    });

    it("aynı paketi iki işletme ayrı ayarlarla ve ayrı kimliklerle kullanır", async () => {
      const packageId = await createPackage(app);
      await approveVersion(app, {
        id: packageId,
        version: "1.0.0",
        manifest: { config: CONFIG_FIELDS, permissions: ["identity.basic"] },
      });
      const release = { packageId, version: "1.0.0" };
      const first = await publishApp(app, {
        ...release,
        config: { businessName: "Kadıköy Berber" },
      });
      const second = await publishApp(app, {
        ...release,
        config: { businessName: "Elit Güzellik" },
      });
      const client = as(app, user);

      const a = await client.ok(miniAppDetailSchema, "GET", `/v1/miniapps/${first.id}`);
      const b = await client.ok(miniAppDetailSchema, "GET", `/v1/miniapps/${second.id}`);
      expect(a.config).toMatchObject({ businessName: "Kadıköy Berber" });
      expect(b.config).toMatchObject({ businessName: "Elit Güzellik" });
      expect(a.entryUrl).not.toBe(b.entryUrl);
      expect(a.consentKey).toBe(b.consentKey);

      const idA = await client.ok(
        miniAppIdentitySchema,
        "GET",
        `/v1/miniapps/${first.id}/identity`,
      );
      const idB = await client.ok(
        miniAppIdentitySchema,
        "GET",
        `/v1/miniapps/${second.id}/identity`,
      );
      expect(idA.openId).not.toBe(idB.openId);

      const version = await admin.ok(
        adminPackageVersionSchema,
        "GET",
        versionUrl(packageId, "1.0.0"),
      );
      expect(version.usedBy.map((item) => item.id).sort()).toEqual([first.id, second.id].sort());
    });

    it("bir kayıt başka bir pakete geçirilemez ve adresle açılan kayda çevrilemez", async () => {
      const { miniApp } = await publishSample(app);
      const other = await createPackage(app);
      await approveVersion(app, { id: other, version: "1.0.0" });
      const url = `/v1/admin/miniapps/${miniApp.id}`;

      await admin.fail("miniapp_package_mismatch", "POST", `${url}/releases`, {
        body: { packageId: other, version: "1.0.0" },
      });
      await admin.fail("miniapp_source_fixed", "PUT", url, {
        body: {
          name: "Kadıköy Berber",
          description: "Saç, sakal ve bakım randevuları için örnek kayıt",
          category: "beauty",
          developerName: "VADO",
          development: {
            entryUrl: "https://baska.example.com/",
            allowedOrigins: ["https://baska.example.com"],
            capabilities: [],
            version: "1.0.0",
          },
        },
      });
    });
  });

  describe("sarmalayıcı belgenin ve paket dosyalarının sunulması", () => {
    it("sarmalayıcı belge, çerçeveye yalnızca paketin giriş belgesinin yüklenmesine izin verir", async () => {
      const { miniApp } = await publishSample(app);
      const { wrapper, files } = addresses(app, miniApp);
      expect(miniApp.entryUrl).toBe(wrapper);

      const page = await fetchPackageFile(app, wrapper);
      expect(page.statusCode).toBe(200);
      expect(page.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(page.body).toContain(`<body data-entry="${files}index.html">`);
      expect(page.body).toContain("<title>Kadıköy Berber</title>");

      // Belgedeki betik ve stil, politikada özetiyle tanımlanandır; başkası çalışmaz.
      const script = /<script>([\s\S]*)<\/script>/.exec(page.body)?.[1] ?? "";
      const style = /<style>([\s\S]*)<\/style>/.exec(page.body)?.[1] ?? "";
      expect(script).toBe(WRAPPER_SCRIPT);
      expect(String(page.headers["content-security-policy"]).split("; ")).toEqual([
        "default-src 'none'",
        `frame-src ${files}index.html`,
        `script-src ${cspHash(script)}`,
        `style-src ${cspHash(style)}`,
        "base-uri 'none'",
        "form-action 'none'",
        `frame-ancestors ${app.config.corsOrigins.join(" ")}`,
      ]);
      expect(page.headers).toMatchObject({
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "cache-control": "no-cache",
      });
      expect(page.headers["x-frame-options"]).toBeUndefined();
      expect(String(page.headers["permissions-policy"])).toContain("camera=()");

      const etag = String(page.headers.etag);
      const cached = await fetchPackageFile(app, wrapper, { "if-none-match": etag });
      expect(cached.statusCode).toBe(304);
      expect(cached.body).toBe("");
      expect(cached.headers["content-security-policy"]).toBe(
        page.headers["content-security-policy"],
      );
    });

    it("sarmalayıcı belgede kaydın adı kod olarak yorumlanamaz", async () => {
      const { miniApp } = await publishSample(app);
      const name = `Ayşe & "Kuaför" <script>alert(1)</script>`;
      await admin.ok(adminMiniAppSchema, "PUT", `/v1/admin/miniapps/${miniApp.id}`, {
        body: { name, description: "Ad sınaması", category: "beauty", developerName: "VADO" },
      });

      const page = await fetchPackageFile(app, miniApp.entryUrl ?? "");
      expect(page.body).toContain(
        "<title>Ayşe &amp; &quot;Kuaför&quot; &lt;script&gt;alert(1)&lt;/script&gt;</title>",
      );
      expect(page.body.match(/<script>/g)).toHaveLength(1);
    });

    it("giriş belgesini kendi sınırlarıyla sunar ve her açılışta yeniden doğrulatır", async () => {
      const { miniApp } = await publishSample(app, {
        manifest: { network: ["https://api.ornek.com", "wss://canli.ornek.com"] },
      });
      const { files } = addresses(app, miniApp);

      const page = await fetchPackageFile(app, `${files}index.html`);
      expect(page.statusCode).toBe(200);
      expect(page.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(page.body).toContain('<div id="root"></div>');

      const media = `${app.config.publicUrl}/media/`;
      // Giriş belgesini sarmalayıcı çerçeveler; web önizlemesinde onu da kabuğun sayfası.
      const framers = [new URL(app.config.publicUrl).origin, ...app.config.corsOrigins];
      expect(String(page.headers["content-security-policy"]).split("; ")).toEqual([
        "default-src 'none'",
        `script-src ${files}`,
        `style-src ${files} 'unsafe-inline'`,
        `img-src ${files} ${media} data: blob: https://api.ornek.com`,
        `font-src ${files} data:`,
        `media-src ${files} blob: https://api.ornek.com`,
        `connect-src ${files} https://api.ornek.com wss://canli.ornek.com`,
        "worker-src 'none'",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        `frame-ancestors ${framers.join(" ")}`,
        "sandbox allow-scripts allow-forms",
      ]);
      expect(page.headers).toMatchObject({
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "access-control-allow-origin": "*",
        "cache-control": "no-cache",
      });
      expect(page.headers["x-frame-options"]).toBeUndefined();
      expect(String(page.headers["permissions-policy"])).toContain("camera=()");

      const etag = String(page.headers.etag);
      const cached = await fetchPackageFile(app, `${files}index.html`, { "if-none-match": etag });
      expect(cached.statusCode).toBe(304);
      expect(cached.body).toBe("");
    });

    it("belgelerin sürüm etiketi başlıkları da kapsar: politika değişirse belge baştan gönderilir", async () => {
      // Aynı paket sürümü iki kayıtta: içerik aynı, adresler (ve onlarla politika) farklı.
      const { packageId, miniApp: first } = await publishSample(app);
      const second = await publishApp(app, { packageId, version: "1.0.0" });
      const one = addresses(app, first);
      const two = addresses(app, second);
      expect(two.digest).toBe(one.digest);

      const entries = [
        await fetchPackageFile(app, `${one.files}index.html`),
        await fetchPackageFile(app, `${two.files}index.html`),
      ];
      expect(entries[0]?.body).toBe(entries[1]?.body);
      expect(entries[0]?.headers.etag).not.toBe(entries[1]?.headers.etag);
      // Birinin etiketiyle ötekini sormak "değişmedi" yanıtı almaz.
      const crossed = await fetchPackageFile(app, `${two.files}index.html`, {
        "if-none-match": String(entries[0]?.headers.etag),
      });
      expect(crossed.statusCode).toBe(200);

      // Değişmez dosyalarda etiket yalnızca içeriktir.
      const scripts = [
        await fetchPackageFile(app, `${one.files}assets/app.js`),
        await fetchPackageFile(app, `${two.files}assets/app.js`),
      ];
      expect(scripts[0]?.headers.etag).toBe(scripts[1]?.headers.etag);
    });

    it("giriş belgesi dışındaki dosyalar değişmez adresle sunulur ve belge olarak etkisizdir", async () => {
      const { miniApp } = await publishSample(app, {
        files: { "yardim.html": "<!doctype html><script src='./assets/app.js'></script>" },
      });
      const { files } = addresses(app, miniApp);
      const inert = "default-src 'none'; frame-ancestors 'none'; sandbox";

      const script = await fetchPackageFile(app, `${files}assets/app.js`);
      expect(script.statusCode).toBe(200);
      expect(script.headers).toMatchObject({
        "content-type": "text/javascript; charset=utf-8",
        "content-security-policy": inert,
        "cache-control": "public, max-age=31536000, immutable",
        "access-control-allow-origin": "*",
        "x-content-type-options": "nosniff",
      });
      const image = await fetchPackageFile(app, `${files}icon.png`);
      expect(image.headers["content-type"]).toBe("image/png");
      // Paketteki ikinci bir HTML dosyası çerçevede gösterilemez ve betik çalıştıramaz.
      const second = await fetchPackageFile(app, `${files}yardim.html`);
      expect(second.statusCode).toBe(200);
      expect(second.headers["content-security-policy"]).toBe(inert);

      const etag = String(script.headers.etag);
      const cached = await fetchPackageFile(app, `${files}assets/app.js`, {
        "if-none-match": etag,
      });
      expect(cached.statusCode).toBe(304);
      expect(cached.body).toBe("");
      const head = await fetchPackageFile(app, `${files}assets/app.js`, {}, "HEAD");
      expect(head.statusCode).toBe(200);
      expect(head.body).toBe("");
    });

    it("paketin dışına çıkan, bilinmeyen ya da başka özete ait adresleri sunmaz; yönlendirmez", async () => {
      const { miniApp } = await publishSample(app);
      const { root, digest, wrapper, files } = addresses(app, miniApp);
      const refused = [
        `${files}yok.js`,
        files,
        files.slice(0, -1),
        `${files}assets`,
        `${files}assets/`,
        `${files}..%2f..%2f..%2fv1/me`,
        `${files}%2e%2e/%2e%2e/health`,
        `${files}.env`,
        `${root}/files/${"0".repeat(64)}/index.html`,
        `${root}/files/${digest.toUpperCase()}/index.html`,
        `${app.config.publicUrl}/apps/${unique("yok")}/files/${digest}/index.html`,
        wrapper.slice(0, -1),
        `${wrapper}index.html`,
        `${root}/wrapper/${"0".repeat(64)}/`,
        `${app.config.publicUrl}/apps/${unique("yok")}/wrapper/${digest}/`,
        // 2.3.0'daki düzen: paket dosyaları doğrudan özetin altındaydı.
        `${root}/${digest}/index.html`,
      ];
      for (const url of refused) {
        const response = await fetchPackageFile(app, url);
        expect(response.statusCode, url).toBe(404);
        expect(response.headers.location, url).toBeUndefined();
      }
    });

    it("kapatılan ya da doğrulaması kaldırılan kaydın belgesi ve dosyaları hemen kapanır", async () => {
      const { miniApp } = await publishSample(app);
      const url = `/v1/admin/miniapps/${miniApp.id}`;
      const { wrapper, files } = addresses(app, miniApp);
      const statuses = async () => [
        (await fetchPackageFile(app, wrapper)).statusCode,
        (await fetchPackageFile(app, `${files}index.html`)).statusCode,
        (await fetchPackageFile(app, `${files}assets/app.js`)).statusCode,
      ];
      expect(await statuses()).toEqual([200, 200, 200]);

      await admin.done("PATCH", url, { body: { enabled: false } });
      expect(await statuses()).toEqual([404, 404, 404]);
      expect(await isListed(miniApp.id)).toBe(false);
      expect((await admin.ok(adminMiniAppSchema, "GET", url)).offlineReason).toBe("disabled");

      await admin.done("PATCH", url, { body: { enabled: true, verified: false } });
      expect(await statuses()).toEqual([404, 404, 404]);
      await admin.done("PATCH", url, { body: { verified: true } });
      expect(await statuses()).toEqual([200, 200, 200]);
    });
  });

  describe("yeni sürüm, geri alma ve geri çekme", () => {
    /** 1.0.0 ve 1.1.0 sürümleri onaylı bir paket ve 1.0.0'ı yayınlayan bir kayıt hazırlar. */
    async function twoVersions() {
      const packageId = await createPackage(app);
      await approveVersion(app, {
        id: packageId,
        version: "1.0.0",
        manifest: { config: CONFIG_FIELDS, permissions: ["identity.basic"] },
      });
      await approveVersion(app, {
        id: packageId,
        version: "1.1.0",
        manifest: {
          config: [...CONFIG_FIELDS, { key: "walkIn", label: "Randevusuz kabul", type: "boolean" }],
          permissions: ["identity.basic", "location.coarse"],
        },
        files: { "assets/app.js": "console.log('1.1.0');\n" },
      });
      const miniApp = await publishApp(app, {
        packageId,
        version: "1.0.0",
        config: { businessName: "Kadıköy Berber", seats: 3 },
      });
      return { packageId, miniApp, url: `/v1/admin/miniapps/${miniApp.id}` };
    }

    it("yeni sürüm yayınlanınca ayarlar taşınır, eski adres kapanır, izin özeti değişir", async () => {
      const { packageId, miniApp, url } = await twoVersions();
      const before = await as(app, user).ok(
        miniAppDetailSchema,
        "GET",
        `/v1/miniapps/${miniApp.id}`,
      );

      const next = await admin.ok(adminMiniAppSchema, "POST", `${url}/releases`, {
        body: { packageId, version: "1.1.0" },
      });
      expect(next).toMatchObject({
        version: "1.1.0",
        capabilities: ["identity.basic", "location.coarse"],
        config: { businessName: "Kadıköy Berber", seats: 3 },
      });

      const after = await as(app, user).ok(
        miniAppDetailSchema,
        "GET",
        `/v1/miniapps/${miniApp.id}`,
      );
      expect(after.entryUrl).not.toBe(before.entryUrl);
      expect(after.consentKey).not.toBe(before.consentKey);
      expect((await fetchPackageFile(app, before.entryUrl)).statusCode).toBe(404);
      expect((await fetchPackageFile(app, after.entryUrl)).statusCode).toBe(200);
    });

    it("izin özeti yalnızca yetkiler ya da bağlanılan adresler değişince değişir", async () => {
      const packageId = await createPackage(app);
      const manifest = { permissions: ["identity.basic"], network: ["https://api.ornek.com"] };
      await approveVersion(app, { id: packageId, version: "1.0.0", manifest });
      // Yalnızca kod değişti: kullanıcıya yeniden sorulacak bir şey yok.
      await approveVersion(app, {
        id: packageId,
        version: "1.1.0",
        manifest,
        files: { "assets/app.js": "console.log('yalnızca kod değişti');\n" },
      });
      // Yetkiler aynı, ama veri artık bir adrese daha gidebilir.
      await approveVersion(app, {
        id: packageId,
        version: "1.2.0",
        manifest: { ...manifest, network: [...manifest.network, "https://izleme.ornek.com"] },
      });
      const miniApp = await publishApp(app, { packageId, version: "1.0.0" });
      const keyOf = async () =>
        (await as(app, user).ok(miniAppDetailSchema, "GET", `/v1/miniapps/${miniApp.id}`))
          .consentKey;
      const publish = (version: string) =>
        admin.ok(adminMiniAppSchema, "POST", `/v1/admin/miniapps/${miniApp.id}/releases`, {
          body: { packageId, version },
        });

      const initial = await keyOf();
      await publish("1.1.0");
      expect(await keyOf()).toBe(initial);
      await publish("1.2.0");
      expect(await keyOf()).not.toBe(initial);
    });

    it("geri alma, önceki yayını o yayının ayarlarıyla geri getirir; ileri geri gidip gelmez", async () => {
      const { packageId, url } = await twoVersions();
      await admin.ok(adminMiniAppSchema, "POST", `${url}/releases`, {
        body: {
          packageId,
          version: "1.1.0",
          config: { businessName: "Kadıköy Berber", seats: 5, walkIn: true },
        },
      });

      const rolledBack = await admin.ok(adminMiniAppSchema, "POST", `${url}/rollback`);
      expect(rolledBack).toMatchObject({
        version: "1.0.0",
        config: { businessName: "Kadıköy Berber", seats: 3 },
        offlineReason: null,
      });
      expect(rolledBack.releases.map((release) => `${release.action} ${release.version}`)).toEqual([
        "rollback 1.0.0",
        "publish 1.1.0",
        "publish 1.0.0",
      ]);
      await admin.fail("miniapp_no_previous_release", "POST", `${url}/rollback`);
    });

    it("geri çekilen sürümü yayınlayan kayıtlar hemen kapanır; istenirse önceki yayına döner", async () => {
      const { packageId, miniApp, url } = await twoVersions();
      const stays = await publishApp(app, {
        packageId,
        version: "1.1.0",
        config: { businessName: "Yalnızca Yeni Sürüm" },
      });
      const upgraded = await admin.ok(adminMiniAppSchema, "POST", `${url}/releases`, {
        body: { packageId, version: "1.1.0" },
      });
      const entry = upgraded.entryUrl ?? "";

      await admin.fail("validation_failed", "POST", `${versionUrl(packageId, "1.1.0")}/revoke`, {
        body: {},
      });
      const revoked = await admin.ok(
        adminPackageVersionSchema,
        "POST",
        `${versionUrl(packageId, "1.1.0")}/revoke`,
        { body: { note: "Güvenlik sorunu bulundu.", rollback: true } },
      );
      expect(revoked.status).toBe("revoked");
      // Önceki yayını olan kayıt 1.0.0'a döndü; olmayan kayıt geri çekilen sürümde ve kapalı kaldı.
      expect(revoked.usedBy.map((item) => item.id)).toEqual([stays.id]);

      const restored = await admin.ok(adminMiniAppSchema, "GET", url);
      expect(restored).toMatchObject({ version: "1.0.0", offlineReason: null });
      expect(await isListed(miniApp.id)).toBe(true);
      expect((await fetchPackageFile(app, entry)).statusCode).toBe(404);

      const dark = await admin.ok(adminMiniAppSchema, "GET", `/v1/admin/miniapps/${stays.id}`);
      expect(dark).toMatchObject({ version: "1.1.0", offlineReason: "version_unavailable" });
      expect(await isListed(stays.id)).toBe(false);
      await as(app, user).fail("miniapp_not_found", "GET", `/v1/miniapps/${stays.id}`);
      await as(app, user).fail("miniapp_not_found", "GET", `/v1/miniapps/${stays.id}/identity`);
      expect((await fetchPackageFile(app, stays.entryUrl ?? "")).statusCode).toBe(404);
      await admin.fail("miniapp_version_not_approved", "POST", `${url}/releases`, {
        body: { packageId, version: "1.1.0" },
      });
    });

    it("toplu dağıtım, eski sürümdeki kayıtları yeni sürüme geçirir; ayarı uymayanı atlar", async () => {
      const packageId = await createPackage(app);
      await approveVersion(app, { id: packageId, version: "1.0.0" });
      await approveVersion(app, {
        id: packageId,
        version: "2.0.0",
        manifest: { config: [{ key: "city", label: "Şehir", type: "text" }] },
      });
      await approveVersion(app, {
        id: packageId,
        version: "2.1.0",
        manifest: { config: [{ key: "city", label: "Şehir", type: "text", required: true }] },
      });
      const ready = await publishApp(app, {
        packageId,
        version: "2.0.0",
        config: { city: "İzmir" },
      });
      const incomplete = await publishApp(app, { packageId, version: "1.0.0" });

      const result = await admin.ok(
        adminRolloutResultSchema,
        "POST",
        `${versionUrl(packageId, "2.1.0")}/rollout`,
      );
      expect(result.published).toEqual([ready.id]);
      expect(result.skipped).toEqual([
        {
          id: incomplete.id,
          name: "Kadıköy Berber",
          problems: [{ key: "city", message: "Bu alan zorunlu." }],
        },
      ]);
      const again = await admin.ok(
        adminRolloutResultSchema,
        "POST",
        `${versionUrl(packageId, "2.1.0")}/rollout`,
      );
      expect(again.published).toEqual([]);
    });
  });
});

describe("geliştirme kipi kapalıyken", () => {
  let strict: TestApp;
  let admin: Client;

  beforeAll(async () => {
    strict = await startTestApp({ VADO_MINIAPP_DEV_MODE: "false" });
    admin = asAdmin(strict);
  });
  afterAll(() => strict.stop());

  it("adresle açılan kayıt oluşturulamaz; şifresiz adres isteyen paket yüklenemez", async () => {
    await admin.fail("miniapp_url_mode_disabled", "PUT", `/v1/admin/miniapps/${unique("kayit")}`, {
      body: {
        name: "Geliştirme Kaydı",
        description: "Geliştiricinin sunucusundan açılan kayıt",
        category: "other",
        developerName: "VADO",
        development: {
          entryUrl: "https://gelistirici.example.com/",
          allowedOrigins: ["https://gelistirici.example.com"],
          capabilities: [],
          version: "1.0.0",
        },
      },
    });

    const packageId = await createPackage(strict);
    const error = await expectUploadError(
      strict,
      packageId,
      packageArchive({
        id: packageId,
        version: "1.0.0",
        manifest: { network: ["http://localhost:3001"] },
      }),
      "package_invalid",
    );
    expect(JSON.stringify(error.details)).toContain("şifreli");
  });

  it("2.2'den kalan adresli kayıt kullanıcılara kapalıdır; paket yayınlanınca aynı kimlikle açılır", async () => {
    const id = unique("eski-kayit");
    const user = await createUser(strict, "Eski Kullanıcı");
    // 2.2'nin veritabanında bulunan türden, doğrulanmış ve açık bir kayıt.
    await strict.db.execute(sql`
      insert into mini_apps (
        id, name, description, entry_url, allowed_origins, capabilities, version, category,
        developer_name, verified, source
      )
      values (
        ${id}, 'Eski Randevu', 'Sürüm 2.2 ile kaydedilmiş mini uygulama',
        'https://randevu.example.com/', '{https://randevu.example.com}', '{identity.basic}',
        '2.0.0', 'beauty', 'VADO', true, 'url'
      )
    `);
    const dormant = await admin.ok(adminMiniAppSchema, "GET", `/v1/admin/miniapps/${id}`);
    expect(dormant).toMatchObject({ source: "url", offlineReason: "url_mode_disabled" });
    await as(strict, user).fail("miniapp_not_found", "GET", `/v1/miniapps/${id}`);
    await as(strict, user).fail("miniapp_not_found", "GET", `/v1/miniapps/${id}/identity`);
    const overview = await admin.ok(adminOverviewSchema, "GET", "/v1/admin/overview");
    expect(overview.urlMiniApps).toBeGreaterThan(0);
    expect(overview.config.miniAppDevMode).toBe(false);

    const packageId = await createPackage(strict);
    await approveVersion(strict, {
      id: packageId,
      version: "1.0.0",
      manifest: { permissions: ["identity.basic"] },
    });
    const converted = await admin.ok(
      adminMiniAppSchema,
      "POST",
      `/v1/admin/miniapps/${id}/releases`,
      {
        body: { packageId, version: "1.0.0" },
      },
    );
    expect(converted).toMatchObject({ source: "package", offlineReason: null, development: null });

    const identity = await as(strict, user).ok(
      miniAppIdentitySchema,
      "GET",
      `/v1/miniapps/${id}/identity`,
    );
    // Kimlik, kaydın kimliğinden türediği için 2.2'deki değerle aynıdır.
    expect(identity.openId).toBe(createAppKeys(strict.config.keys).openId(id, user.id));

    const list = await admin.ok(
      listOf(adminMiniAppSummarySchema),
      "GET",
      `/v1/admin/miniapps?q=${id}`,
    );
    expect(list.items.map((item) => item.id)).toEqual([id]);
  });
});

describe("alt alan adı kipi", () => {
  let hosted: TestApp;

  beforeAll(async () => {
    hosted = await startTestApp({
      VADO_PUBLIC_URL: "https://api.vado.test",
      VADO_APPS_ORIGIN: "https://{app}.mini.vado.test",
    });
  });
  afterAll(() => hosted.stop());

  it("her kayıt kendi alan adından sunulur; o alan adından API'ye ve başka kayda ulaşılamaz", async () => {
    const { miniApp } = await publishSample(hosted);
    const other = (await publishSample(hosted)).miniApp;
    const digest = miniApp.release?.digest ?? "";
    const origin = `https://${miniApp.id}.mini.vado.test`;
    const wrapper = `${origin}/wrapper/${digest}/`;
    const files = `${origin}/files/${digest}/`;
    expect(miniApp.entryUrl).toBe(wrapper);

    const frame = await fetchPackageFile(hosted, wrapper);
    expect(frame.statusCode).toBe(200);
    expect(String(frame.headers["content-security-policy"])).toContain(
      `frame-src ${files}index.html;`,
    );
    const page = await fetchPackageFile(hosted, `${files}index.html`);
    expect(page.statusCode).toBe(200);
    const policy = String(page.headers["content-security-policy"]);
    expect(policy).toContain(`script-src ${files};`);
    // Giriş belgesini kaydın kendi alan adındaki sarmalayıcı çerçeveler; API'nin adresi değil.
    expect(policy).toContain(`frame-ancestors ${origin} ${hosted.config.corsOrigins.join(" ")};`);

    const host = `${miniApp.id}.mini.vado.test`;
    const onAppHost = (path: string) =>
      hosted.server.inject({ method: "GET", url: path, headers: { host } });
    expect((await onAppHost("/health")).statusCode).toBe(404);
    expect((await onAppHost("/v1/admin/overview")).statusCode).toBe(404);
    // Başka kaydın belgesi ve dosyaları, yol kipindeki adresler bu alan adından açılmaz.
    const foreign = other.release?.digest ?? "";
    for (const path of [
      `/wrapper/${foreign}/`,
      `/files/${foreign}/index.html`,
      `/apps/${other.id}/wrapper/${foreign}/`,
      `/apps/${other.id}/files/${foreign}/index.html`,
      `/apps/${miniApp.id}/files/${digest}/index.html`,
    ]) {
      expect((await onAppHost(path)).statusCode, path).toBe(404);
    }

    // API'nin kendi alan adından kaydın yolları açılmaz; API ise çalışır.
    const onApiHost = (path: string) =>
      hosted.server.inject({ method: "GET", url: path, headers: { host: "api.vado.test" } });
    expect((await onApiHost(`/apps/${miniApp.id}/wrapper/${digest}/`)).statusCode).toBe(404);
    expect((await onApiHost(`/apps/${miniApp.id}/files/${digest}/index.html`)).statusCode).toBe(
      404,
    );
    expect((await onApiHost("/health")).statusCode).toBe(200);
  });
});
