import { randomBytes } from "node:crypto";
import { chmod, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  adminOverviewSchema,
  adminPackageSchema,
  adminPackageVersionSchema,
  listOf,
  packageDigestInput,
  packageFileContentSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { sha256 } from "../src/core/security";
import {
  createLocalPackageStore,
  type LocalPackageStore,
  PackageStoreError,
} from "../src/providers/package-store";
import {
  anonymous,
  as,
  asAdmin,
  type Client,
  createUser,
  startTestApp,
  type TestApp,
} from "./support/harness";
import {
  approveVersion,
  createPackage,
  expectUploadError,
  packageArchive,
  packageFiles,
  publishApp,
  sendArchive,
  unique,
  uploadVersion,
} from "./support/packages";

describe("paketler", () => {
  let app: TestApp;
  let admin: Client;

  beforeAll(async () => {
    app = await startTestApp();
    admin = asAdmin(app);
  });
  afterAll(() => app.stop());

  const versionUrl = (id: string, version: string) =>
    `/v1/admin/packages/${id}/versions/${version}`;

  describe("yükleme", () => {
    it("yönetici anahtarı olmadan paket uç noktalarına erişilemez", async () => {
      const user = await createUser(app, "Sıradan Kullanıcı");
      await anonymous(app).fail("admin_unauthorized", "GET", "/v1/admin/packages");
      await as(app, user).fail("admin_unauthorized", "PUT", "/v1/admin/packages/herhangi", {
        body: { name: "Paket", developerName: "Biri" },
      });
      await as(app, user).fail(
        "admin_unauthorized",
        "POST",
        "/v1/admin/packages/herhangi/versions/1.0.0/approve",
      );
    });

    it("yüklenen sürüm taslak olur; dosyaları, özeti ve bildirimi kaydedilir", async () => {
      const id = await createPackage(app);
      const source = {
        id,
        version: "1.0.0",
        manifest: {
          name: "Randevu",
          permissions: ["identity.basic", "storage.local"],
          network: ["https://api.ornek.com"],
          config: [{ key: "businessName", label: "İşletme adı", type: "text", required: true }],
        },
      };
      const version = await uploadVersion(app, source);

      expect(version).toMatchObject({
        packageId: id,
        version: "1.0.0",
        name: "Randevu",
        status: "draft",
        entry: "index.html",
        icon: "icon.png",
        permissions: ["identity.basic", "storage.local"],
        network: ["https://api.ornek.com"],
        fileCount: 5,
        uploadedBy: { id: app.admins.operator.id, name: "Sınama operator" },
        submittedAt: null,
        reviewedBy: null,
        diff: null,
        usedBy: [],
      });
      expect(version.configFields).toEqual([
        { key: "businessName", label: "İşletme adı", type: "text", required: true },
      ]);

      const files = packageFiles(source);
      expect(version.files.map((file) => file.path)).toEqual(Object.keys(files).sort());
      for (const file of version.files) {
        expect(file.sha256).toBe(sha256(files[file.path] ?? Buffer.alloc(0)));
        expect(file.size).toBe(files[file.path]?.length);
      }
      expect(version.digest).toBe(sha256(packageDigestInput(version.files)));
      expect(version.sizeBytes).toBe(version.files.reduce((total, file) => total + file.size, 0));

      const listed = await admin.ok(adminPackageSchema, "GET", `/v1/admin/packages/${id}`);
      expect(listed).toMatchObject({ id, name: "Örnek Paket", developerName: "VADO", appCount: 0 });
      expect(listed.versions).toHaveLength(1);
      expect(listed.versions[0]).toMatchObject({ version: "1.0.0", status: "draft" });
    });

    it("sürümleri sayısal sıraya göre, en yenisi başta listeler", async () => {
      const id = await createPackage(app);
      for (const version of ["1.2.0", "1.9.0", "1.10.0"]) await uploadVersion(app, { id, version });

      const one = await admin.ok(adminPackageSchema, "GET", `/v1/admin/packages/${id}`);
      expect(one.versions.map((version) => version.version)).toEqual(["1.10.0", "1.9.0", "1.2.0"]);
      const all = await admin.ok(listOf(adminPackageSchema), "GET", "/v1/admin/packages");
      expect(all.items.find((item) => item.id === id)?.versions).toHaveLength(3);
    });

    it("yüklenmiş sürüm numarasını, içerik aynı da olsa farklı da olsa yeniden kabul etmez", async () => {
      const id = await createPackage(app);
      const first = await uploadVersion(app, { id, version: "1.0.0" });

      await expectUploadError(
        app,
        id,
        packageArchive({ id, version: "1.0.0" }),
        "package_version_exists",
      );
      const changed = packageArchive({ id, version: "1.0.0", files: { "assets/app.js": "yeni" } });
      await expectUploadError(app, id, changed, "package_version_exists");

      const after = await admin.ok(adminPackageVersionSchema, "GET", versionUrl(id, "1.0.0"));
      expect(after.digest).toBe(first.digest);
      expect(after.files).toEqual(first.files);
    });

    it("sürüm numarası, vazgeçilenler dahil yüklenmiş bütün sürümlerden büyük olmalıdır", async () => {
      const id = await createPackage(app);
      await uploadVersion(app, { id, version: "1.4.0" });
      await admin.ok(adminPackageVersionSchema, "POST", `${versionUrl(id, "1.4.0")}/withdraw`);

      for (const version of ["1.3.9", "0.9.0"]) {
        await expectUploadError(
          app,
          id,
          packageArchive({ id, version }),
          "package_version_not_newer",
        );
      }
      await expectUploadError(
        app,
        id,
        packageArchive({ id, version: "1.4.0" }),
        "package_version_exists",
      );
      await uploadVersion(app, { id, version: "1.4.1" });
    });

    it("kayıtlı olmayan pakete ve başka paketin bildirimiyle yüklemeyi reddeder", async () => {
      const missing = unique("yok");
      await expectUploadError(
        app,
        missing,
        packageArchive({ id: missing, version: "1.0.0" }),
        "package_not_found",
      );

      const id = await createPackage(app);
      const error = await expectUploadError(
        app,
        id,
        packageArchive({ id: "baska-paket", version: "1.0.0" }),
        "package_invalid",
      );
      expect(error.details).toEqual([
        {
          file: "vado.app.json",
          message: `Bildirim dosyasındaki kimlik (baska-paket) bu paketin kimliğiyle (${id}) eşleşmiyor.`,
        },
      ]);
    });

    it("kurallara uymayan arşivi nedenleriyle reddeder ve hiçbir şey kaydetmez", async () => {
      const id = await createPackage(app);
      const error = await expectUploadError(
        app,
        id,
        packageArchive({
          id,
          version: "1.0.0",
          files: { "sunucu.php": "<?php", ".env": "GIZLI=1" },
        }),
        "package_invalid",
      );
      expect(error.message).toBe("Paket kurallara uymuyor.");
      expect(error.details).toEqual(
        expect.arrayContaining([{ file: "sunucu.php", message: "Bu dosya türü pakete giremez." }]),
      );
      expect(error.details).toHaveLength(2);

      await expectUploadError(app, id, Buffer.from("zip değil"), "package_invalid");
      const listed = await admin.ok(adminPackageSchema, "GET", `/v1/admin/packages/${id}`);
      expect(listed.versions).toEqual([]);
    });

    it("çok parçalı olmayan ya da yanlış alanla gelen isteği reddeder", async () => {
      const id = await createPackage(app);
      await admin.fail("validation_failed", "POST", `/v1/admin/packages/${id}/versions`, {
        body: { archive: "base64" },
      });
      const wrongField = await sendArchive(
        app,
        id,
        packageArchive({ id, version: "1.0.0" }),
        "file",
      );
      expect(wrongField).toMatchObject({
        status: 400,
        body: { error: { code: "validation_failed" } },
      });
    });

    it("geçersiz kimlik ve sürüm numarasını adreste reddeder", async () => {
      await admin.fail("validation_failed", "PUT", "/v1/admin/packages/Büyük_Harf", {
        body: { name: "Paket", developerName: "VADO" },
      });
      const id = await createPackage(app);
      await admin.fail("validation_failed", "GET", versionUrl(id, "1.0"));
      await admin.fail("package_version_not_found", "GET", versionUrl(id, "9.9.9"));
      await admin.fail("package_not_found", "GET", `/v1/admin/packages/${unique("yok")}`);
    });
  });

  describe("boyut sınırı", () => {
    let small: TestApp;

    beforeAll(async () => {
      small = await startTestApp({ VADO_PACKAGE_MAX_MB: "1" });
    });
    afterAll(() => small.stop());

    it("sınırı aşan arşivi belleğe almadan reddeder; sınırı genel bakışta bildirir", async () => {
      const id = await createPackage(small);
      const big = packageArchive({
        id,
        version: "1.0.0",
        files: { "assets/veri.png": randomBytes(1024 * 1024 + 4096) },
      });
      const response = await sendArchive(small, id, big);
      expect(response).toMatchObject({
        status: 413,
        body: { error: { code: "package_too_large" } },
      });

      const overview = await asAdmin(small).ok(adminOverviewSchema, "GET", "/v1/admin/overview");
      expect(overview.config.packageMaxBytes).toBe(1024 * 1024);
    });

    it("küçük arşive sığdırılmış büyük içeriği reddeder", async () => {
      const id = await createPackage(small);
      const bomb = packageArchive({
        id,
        version: "1.0.0",
        files: { "assets/veri.js": Buffer.alloc(4 * 1024 * 1024 + 1) },
      });
      expect(bomb.length).toBeLessThan(100_000);
      const error = await expectUploadError(small, id, bomb, "package_invalid");
      expect(error.details).toEqual([
        { file: null, message: "Arşivin açılmış boyutu sınırı aşıyor." },
      ]);
    });
  });

  describe("inceleme", () => {
    it("taslak → incelemede → onaylı; her adım kimin, ne zaman yaptığıyla kaydedilir", async () => {
      const id = await createPackage(app);
      await uploadVersion(app, { id, version: "1.0.0" });
      const url = versionUrl(id, "1.0.0");

      const { operator, reviewer } = app.admins;
      const submitted = await asAdmin(app, "operator").ok(
        adminPackageVersionSchema,
        "POST",
        `${url}/submit`,
      );
      expect(submitted).toMatchObject({ status: "in_review", reviewedBy: null });
      expect(submitted.submittedAt).not.toBeNull();
      const overview = await admin.ok(adminOverviewSchema, "GET", "/v1/admin/overview");
      expect(overview.packagesInReview).toBeGreaterThan(0);

      const approved = await asAdmin(app, "reviewer").ok(
        adminPackageVersionSchema,
        "POST",
        `${url}/approve`,
        {
          body: { note: "Bildirilen adresler ve yetkiler uygun." },
        },
      );
      expect(approved).toMatchObject({
        status: "approved",
        reviewedBy: { id: reviewer.id, name: "Sınama reviewer" },
        reviewNote: "Bildirilen adresler ve yetkiler uygun.",
      });
      expect(approved.reviewedAt).not.toBeNull();

      const audit = await app.db.many<{ actor: string; action: string }>(sql`
        select actor, action from audit_log
        where target_type = 'package' and target_id = ${id}
        order by id
      `);
      expect(audit).toEqual([
        { actor: operator.id, action: "package.saved" },
        { actor: operator.id, action: "package.version_uploaded" },
        { actor: operator.id, action: "package.version_submitted" },
        { actor: reviewer.id, action: "package.version_approved" },
      ]);
    });

    it("ret gerekçe ister; reddedilen sürüm yeniden gönderilemez, düzeltme yeni sürümle gelir", async () => {
      const id = await createPackage(app);
      await uploadVersion(app, { id, version: "1.0.0" });
      const url = versionUrl(id, "1.0.0");
      await admin.ok(adminPackageVersionSchema, "POST", `${url}/submit`);

      await admin.fail("validation_failed", "POST", `${url}/reject`, { body: {} });
      await admin.fail("validation_failed", "POST", `${url}/reject`, { body: { note: "x" } });
      const rejected = await admin.ok(adminPackageVersionSchema, "POST", `${url}/reject`, {
        body: { note: "Bildirilmemiş bir adrese veri gönderiyor." },
      });
      expect(rejected).toMatchObject({
        status: "rejected",
        reviewedBy: { id: app.admins.owner.id },
        reviewNote: "Bildirilmemiş bir adrese veri gönderiyor.",
      });

      await admin.fail("package_state_invalid", "POST", `${url}/submit`);
      await admin.fail("package_state_invalid", "POST", `${url}/approve`);
      await uploadVersion(app, { id, version: "1.0.1" });
    });

    it("durum geçişleri yalnızca izin verilen yönde yapılır", async () => {
      const id = await createPackage(app);
      await uploadVersion(app, { id, version: "1.0.0" });
      const url = versionUrl(id, "1.0.0");
      const note = { body: { note: "Gerekçe metni" } };

      // Taslak: onaylanamaz, reddedilemez, geri çekilemez.
      await admin.fail("package_state_invalid", "POST", `${url}/approve`);
      await admin.fail("package_state_invalid", "POST", `${url}/reject`, note);
      await admin.fail("package_state_invalid", "POST", `${url}/revoke`, note);

      await asAdmin(app, "operator").ok(adminPackageVersionSchema, "POST", `${url}/submit`);
      await admin.fail("package_state_invalid", "POST", `${url}/submit`);
      await admin.fail("package_state_invalid", "POST", `${url}/revoke`, note);

      await admin.ok(adminPackageVersionSchema, "POST", `${url}/approve`);
      for (const action of ["submit", "approve", "withdraw"]) {
        await admin.fail("package_state_invalid", "POST", `${url}/${action}`);
      }
      await admin.fail("package_state_invalid", "POST", `${url}/reject`, note);

      const revoked = await admin.ok(adminPackageVersionSchema, "POST", `${url}/revoke`, note);
      expect(revoked).toMatchObject({ status: "revoked", reviewNote: "Gerekçe metni" });
      for (const action of ["submit", "approve", "withdraw"]) {
        await admin.fail("package_state_invalid", "POST", `${url}/${action}`);
      }
      await admin.fail("package_state_invalid", "POST", `${url}/revoke`, note);

      await admin.fail("package_version_not_found", "POST", `${versionUrl(id, "7.0.0")}/submit`);
      await admin.fail("package_version_not_found", "POST", `${versionUrl(id, "7.0.0")}/withdraw`);
    });

    it("yükleyen, karara bağlanmamış sürümden vazgeçebilir", async () => {
      const id = await createPackage(app);
      await uploadVersion(app, { id, version: "1.0.0" });
      const draft = await admin.ok(
        adminPackageVersionSchema,
        "POST",
        `${versionUrl(id, "1.0.0")}/withdraw`,
      );
      expect(draft).toMatchObject({ status: "withdrawn", reviewedBy: null });

      await uploadVersion(app, { id, version: "1.1.0" });
      await admin.ok(adminPackageVersionSchema, "POST", `${versionUrl(id, "1.1.0")}/submit`);
      const inReview = await admin.ok(
        adminPackageVersionSchema,
        "POST",
        `${versionUrl(id, "1.1.0")}/withdraw`,
      );
      expect(inReview.status).toBe("withdrawn");
      await admin.fail("package_state_invalid", "POST", `${versionUrl(id, "1.1.0")}/approve`);
    });

    it("otomatik bulguları sürümle birlikte saklar ve özetler", async () => {
      const id = await createPackage(app);
      const version = await uploadVersion(app, {
        id,
        version: "1.0.0",
        files: {
          "assets/app.js":
            'eval("1"); localStorage.clear(); location.href = "https://x.ornek.net";',
        },
      });
      expect(version.findingCounts).toEqual({ blocked: 2, review: 1, info: 1 });
      expect(version.findings.map((finding) => finding.code)).toEqual([
        "dynamic_code",
        "web_storage",
        "navigation",
        "undeclared_host",
      ]);
      const listed = await admin.ok(adminPackageSchema, "GET", `/v1/admin/packages/${id}`);
      expect(listed.versions[0]?.findingCounts).toEqual({ blocked: 2, review: 1, info: 1 });
    });

    it("sürüm farkı: önceki onaylı sürüme göre dosya, yetki, adres ve ayar değişiklikleri", async () => {
      const id = await createPackage(app);
      await approveVersion(app, {
        id,
        version: "1.0.0",
        manifest: {
          permissions: ["identity.basic"],
          network: ["https://api.ornek.com"],
          config: [
            { key: "businessName", label: "İşletme adı", type: "text", required: true },
            { key: "seats", label: "Koltuk", type: "number" },
          ],
        },
        files: { "assets/eski.js": "export {};" },
      });
      // Arada reddedilen sürüm karşılaştırmaya girmez.
      await uploadVersion(app, { id, version: "1.0.5", files: { "assets/hatali.js": "x" } });
      await admin.ok(adminPackageVersionSchema, "POST", `${versionUrl(id, "1.0.5")}/submit`);
      await admin.ok(adminPackageVersionSchema, "POST", `${versionUrl(id, "1.0.5")}/reject`, {
        body: { note: "Hatalı sürüm" },
      });

      const next = await uploadVersion(app, {
        id,
        version: "1.1.0",
        manifest: {
          entry: "app.html",
          permissions: ["payment.request"],
          network: ["https://api.ornek.com", "wss://canli.ornek.com"],
          config: [
            { key: "businessName", label: "İşletmenin adı", type: "text", required: true },
            { key: "walkIn", label: "Randevusuz kabul", type: "boolean" },
          ],
        },
        files: {
          "index.html": null,
          "app.html": "<!doctype html><title>Yeni</title>",
          "assets/app.js": "console.log('yeni sürüm');\n",
          "assets/yeni.js": "export {};",
        },
      });

      expect(next.diff).toMatchObject({
        base: "1.0.0",
        files: {
          added: ["app.html", "assets/yeni.js"],
          removed: ["assets/eski.js", "index.html"],
          changed: ["assets/app.js", "vado.app.json"],
          unchanged: 2,
        },
        permissions: { added: ["payment.request"], removed: ["identity.basic"] },
        network: { added: ["wss://canli.ornek.com"], removed: [] },
        configFields: { added: ["walkIn"], removed: ["seats"], changed: ["businessName"] },
        entryChanged: true,
      });
      expect(next.diff?.sizeDelta).toBe(
        next.sizeBytes -
          (await admin.ok(adminPackageVersionSchema, "GET", versionUrl(id, "1.0.0"))).sizeBytes,
      );
    });

    it("inceleyen, metin dosyalarının içeriğini açabilir", async () => {
      const id = await createPackage(app);
      await uploadVersion(app, { id, version: "1.0.0" });
      const url = `${versionUrl(id, "1.0.0")}/files`;

      const script = await admin.ok(packageFileContentSchema, "GET", `${url}/assets/app.js`);
      expect(script).toMatchObject({
        path: "assets/app.js",
        contentType: "text/javascript; charset=utf-8",
        text: 'document.getElementById("root").textContent = "Merhaba";\n',
      });
      const image = await admin.ok(packageFileContentSchema, "GET", `${url}/icon.png`);
      expect(image).toMatchObject({ contentType: "image/png", text: null });

      await admin.fail("package_version_not_found", "GET", `${url}/assets/yok.js`);
      await admin.fail("validation_failed", "GET", `${url}/..%2f..%2fetc%2fpasswd`);
    });
  });

  describe("dört göz ilkesi", () => {
    const reviewer = () => asAdmin(app, "reviewer");

    it("sürümü yükleyen ya da incelemeye gönderen hesap onaylayamaz; başka bir hesap onaylar", async () => {
      const id = await createPackage(app);
      // Sahip yükler, operatör gönderir: ikisi de onaylayamaz (operatörün onay izni de yoktur).
      await uploadVersion(app, { id, version: "1.0.0" }, "owner");
      const url = versionUrl(id, "1.0.0");
      const submitted = await asAdmin(app, "operator").ok(
        adminPackageVersionSchema,
        "POST",
        `${url}/submit`,
      );
      expect(submitted).toMatchObject({
        uploadedBy: { id: app.admins.owner.id },
        submittedBy: { id: app.admins.operator.id, name: "Sınama operator" },
      });
      await admin.fail("package_self_review", "POST", `${url}/approve`);
      await asAdmin(app, "operator").fail("forbidden", "POST", `${url}/approve`);
      const approved = await reviewer().ok(adminPackageVersionSchema, "POST", `${url}/approve`);
      expect(approved.reviewedBy).toEqual({ id: app.admins.reviewer.id, name: "Sınama reviewer" });

      // Operatör yükler, sahip gönderir: sahip onaylayamaz, inceleyen onaylar.
      await uploadVersion(app, { id, version: "1.1.0" });
      const next = versionUrl(id, "1.1.0");
      await admin.ok(adminPackageVersionSchema, "POST", `${next}/submit`);
      await admin.fail("package_self_review", "POST", `${next}/approve`);
      await reviewer().ok(adminPackageVersionSchema, "POST", `${next}/approve`);
    });

    it("sürümü yükleyen hesap kendi sürümünü reddedebilir ve sürümden vazgeçebilir", async () => {
      const id = await createPackage(app);
      await uploadVersion(app, { id, version: "1.0.0" }, "owner");
      await admin.ok(adminPackageVersionSchema, "POST", `${versionUrl(id, "1.0.0")}/submit`);
      await admin.ok(adminPackageVersionSchema, "POST", `${versionUrl(id, "1.0.0")}/reject`, {
        body: { note: "Yanlış sürümü yükledim." },
      });
    });

    it("kural veritabanında da durur: yükleyen ya da gönderen elle yazılmış SQL ile de onaylayamaz", async () => {
      const id = await createPackage(app);
      await uploadVersion(app, { id, version: "1.0.0" });
      const where = sql`package_id = ${id} and version = '1.0.0'`;
      await expect(
        app.db.execute(sql`update package_versions set status = 'in_review' where ${where}`),
      ).rejects.toThrow(/gönderen hesap yazılmadan/);
      await asAdmin(app, "reviewer").fail("forbidden", "POST", `${versionUrl(id, "1.0.0")}/submit`);
      await asAdmin(app, "operator").ok(
        adminPackageVersionSchema,
        "POST",
        `${versionUrl(id, "1.0.0")}/submit`,
      );

      const approveAs = (reviewedBy: string | null) =>
        app.db.execute(sql`
          update package_versions
          set status = 'approved', reviewed_by = ${reviewedBy}, reviewed_at = now()
          where ${where}
        `);
      for (const reviewedBy of [app.admins.operator.id, null]) {
        await expect(approveAs(reviewedBy)).rejects.toThrow(/yükleyen ya da incelemeye gönderen/);
      }
      await expect(
        app.db.execute(sql`update package_versions set submitted_by = 'baskasi' where ${where}`),
      ).rejects.toThrow(/gönderen değiştirilemez/);
      await expect(
        app.db.execute(sql`update package_versions set submitted_by = null where ${where}`),
      ).rejects.toThrow(/gönderen değiştirilemez/);
      expect(await approveAs(app.admins.reviewer.id)).toBe(1);
    });

    it("2.4'ten önce incelemeye gönderilmiş sürüm, bir hesap onu yeniden göndermeden onaylanamaz", async () => {
      const id = await createPackage(app);
      await uploadVersion(app, { id, version: "1.0.0" });
      const url = versionUrl(id, "1.0.0");
      // 2.3.1 veritabanındaki durum: ortak hesapla yüklenmiş ve incelemeye gönderilmiş, göndereni
      // yazılmamış sürüm. 0005'ten önceki durumu kurmak için tetikleyiciler bu işlemde kapatılır.
      await app.migrationDb.transaction(async (tx) => {
        await tx.execute(sql`alter table package_versions disable trigger user`);
        await tx.execute(sql`
          update package_versions
          set uploaded_by = 'admin', status = 'in_review', submitted_at = now()
          where package_id = ${id} and version = '1.0.0'
        `);
        await tx.execute(sql`alter table package_versions enable trigger user`);
      });

      const legacy = await reviewer().ok(adminPackageVersionSchema, "GET", url);
      expect(legacy).toMatchObject({
        status: "in_review",
        uploadedBy: { id: "admin", name: "Ortak panel hesabı (2.3)" },
        submittedBy: null,
      });
      await reviewer().fail("package_resubmit_required", "POST", `${url}/approve`);
      await expect(
        app.db.execute(sql`
          update package_versions
          set status = 'approved', reviewed_by = ${app.admins.reviewer.id}
          where package_id = ${id} and version = '1.0.0'
        `),
      ).rejects.toThrow(/göndereni bilinmeyen/);

      // Operatör yeniden gönderir: durum değişmez, gönderen yazılır; ikinci kez gönderilemez.
      const claimed = await asAdmin(app, "operator").ok(
        adminPackageVersionSchema,
        "POST",
        `${url}/submit`,
      );
      expect(claimed).toMatchObject({
        status: "in_review",
        submittedBy: { id: app.admins.operator.id },
      });
      await asAdmin(app, "owner").fail("package_state_invalid", "POST", `${url}/submit`);
      await reviewer().ok(adminPackageVersionSchema, "POST", `${url}/approve`);

      const audit = await app.db.many<{ action: string }>(sql`
        select action from audit_log where target_type = 'package' and target_id = ${id}
        order by id
      `);
      expect(audit.map((row) => row.action)).toContain("package.version_resubmitted");
    });
  });

  describe("değişmezlik", () => {
    /** Veritabanının işlemi verilen gerekçeyle reddettiğini doğrular. */
    async function expectRefused(run: Promise<unknown>, reason: RegExp): Promise<void> {
      await expect(run).rejects.toThrow(reason);
    }

    it("yüklenmiş sürümün dosyaları veritabanında değiştirilemez, silinemez ve artırılamaz", async () => {
      const id = await createPackage(app);
      await approveVersion(app, { id, version: "1.0.0" });
      const where = sql`package_id = ${id} and version = '1.0.0'`;

      await expectRefused(
        app.db.execute(sql`
          update package_files set sha256 = ${"0".repeat(64)} where ${where} and path = 'index.html'
        `),
        /değiştirilemez ve silinemez/,
      );
      await expectRefused(
        app.db.execute(sql`delete from package_files where ${where} and path = 'assets/app.js'`),
        /değiştirilemez ve silinemez/,
      );
      await expectRefused(
        app.db.execute(sql`
          insert into package_files (package_id, version, path, sha256, size, content_type)
          values (${id}, '1.0.0', 'assets/sonradan.js', ${"a".repeat(64)}, 1, 'text/javascript')
        `),
        /yalnızca taslak sürüme eklenebilir/,
      );
      await expect(app.db.execute(sql`truncate package_files`)).rejects.toMatchObject({
        code: "42501",
      });
      await expectRefused(app.migrationDb.execute(sql`truncate package_files`), /boşaltılamaz/);
    });

    it("sürümün içerik alanları ve özeti değiştirilemez; sürüm silinemez", async () => {
      const id = await createPackage(app);
      await approveVersion(app, { id, version: "1.0.0" });
      const where = sql`package_id = ${id} and version = '1.0.0'`;
      const changes = [
        sql`digest = ${"f".repeat(64)}`,
        sql`name = 'Başka Ad'`,
        sql`permissions = '{payment.request}'`,
        sql`network = '{https://kotu.ornek.net}'`,
        sql`entry = 'baska.html'`,
        sql`icon = null`,
        sql`config_fields = '[{"key": "x", "label": "X", "type": "text"}]'`,
        sql`findings = '[{"level": "info", "code": "x", "file": null, "message": "x"}]'`,
        sql`size_bytes = size_bytes + 1`,
        sql`file_count = file_count + 1`,
        sql`uploaded_by = 'baskasi'`,
        sql`created_at = now() + interval '1 day'`,
        sql`version = '9.9.9'`,
      ];
      for (const change of changes) {
        await expectRefused(
          app.db.execute(sql`update package_versions set ${change} where ${where}`),
          /içeriği değiştirilemez/,
        );
      }
      // İçeriğe dokunmayan bir güncelleme (aynı değeri yeniden yazmak) reddedilmez.
      expect(
        await app.db.execute(sql`update package_versions set findings = findings where ${where}`),
      ).toBe(1);
      await expectRefused(
        app.db.execute(sql`delete from package_versions where ${where}`),
        /silinemez/,
      );
      await expectRefused(
        app.db.execute(sql`delete from packages where id = ${id}`),
        /foreign key/,
      );
    });

    it("durum geriye alınamaz: onaylı sürüm taslağa ya da incelemeye dönemez", async () => {
      const id = await createPackage(app);
      await approveVersion(app, { id, version: "1.0.0" });
      for (const status of ["draft", "in_review", "rejected", "withdrawn"]) {
        await expectRefused(
          app.db.execute(sql`
            update package_versions set status = ${status}
            where package_id = ${id} and version = '1.0.0'
          `),
          /durumuna geçemez/,
        );
      }
    });

    it("dosya listesi özetiyle eşleşmeyen taslak, veritabanında incelemeye geçemez", async () => {
      const id = await createPackage(app);
      await uploadVersion(app, { id, version: "1.0.0" });
      // Uygulamanın dışından, taslağa fazladan bir dosya satırı eklenir.
      await app.db.execute(sql`
        insert into package_files (package_id, version, path, sha256, size, content_type)
        values (${id}, '1.0.0', 'assets/gizli.js', ${"a".repeat(64)}, 10, 'text/javascript')
      `);

      await expectRefused(
        app.db.execute(sql`
          update package_versions set status = 'in_review'
          where package_id = ${id} and version = '1.0.0'
        `),
        /özetiyle eşleşmiyor/,
      );
      // Uygulama da aynı tutarsızlığı görür ve sürümü incelemeye göndermez.
      const response = await admin.request("POST", `${versionUrl(id, "1.0.0")}/submit`);
      expect(response).toMatchObject({
        status: 500,
        body: { error: { code: "package_integrity_failed" } },
      });
      expect(app.logs.at(-1)).toMatchObject({
        level: "error",
        message: "Paket sürümünün dosya listesi özetiyle eşleşmiyor",
      });
    });

    it("yayın geçmişi satırları güncellenemez", async () => {
      const id = await createPackage(app);
      await approveVersion(app, { id, version: "1.0.0" });
      const record = await publishApp(app, { packageId: id, version: "1.0.0" });
      await expectRefused(
        app.db.execute(sql`
          update mini_app_releases set version = '1.0.0', actor = 'baskasi'
          where mini_app_id = ${record.id}
        `),
        /Yayın geçmişi değiştirilemez/,
      );
    });
  });

  describe("paket deposu", () => {
    let store: LocalPackageStore;

    beforeAll(async () => {
      store = await createLocalPackageStore(join(app.config.packageDir, "..", "ayri-depo"));
    });

    /** Uygulamanın kendi deposunda, verilen içeriğin durduğu dosya. */
    const blobOf = (content: string) =>
      join(app.config.packageDir, "blobs", sha256(content).slice(0, 2), sha256(content));

    it("içeriği özetiyle adlandırır, salt okunur yazar ve aynı içeriği bir kez saklar", async () => {
      const data = Buffer.from("console.log('depo');");
      const first = await store.put(data);
      expect(first).toBe(sha256(data));
      expect(await store.put(data)).toBe(first);

      const path = store.pathOf(first);
      expect(path).toBe(join(store.root, "blobs", first.slice(0, 2), first));
      expect((await stat(path)).mode & 0o777).toBe(0o444);
      expect((await store.read(first)).equals(data)).toBe(true);
      expect(await readdir(join(store.root, "incoming"))).toEqual([]);
    });

    it("var olan içeriğin üzerine yazmaz: bozulmuş dosya yeniden yüklemeyle düzelmez, bildirilir", async () => {
      const data = Buffer.from("asıl içerik");
      const digest = await store.put(data);
      const path = store.pathOf(digest);
      await chmod(path, 0o644);
      await writeFile(path, "değiştirilmiş içerik");

      await expect(store.read(digest)).rejects.toThrow(PackageStoreError);
      await expect(store.read(digest)).rejects.toMatchObject({ reason: "corrupt", sha256: digest });
      await expect(store.put(data)).rejects.toMatchObject({ reason: "corrupt" });
      expect((await readFile(path)).toString()).toBe("değiştirilmiş içerik");
    });

    it("olmayan içeriği ve özet biçiminde olmayan adı reddeder", async () => {
      await expect(store.read("0".repeat(64))).rejects.toMatchObject({ reason: "missing" });
      await expect(store.read("../../etc/passwd")).rejects.toMatchObject({ reason: "missing" });
    });

    it("depodaki dosyası bozulan sürüm onaylanamaz", async () => {
      const id = await createPackage(app);
      const marker = `export const sürüm = "${unique("bozulacak")}";\n`;
      await uploadVersion(app, { id, version: "1.0.0", files: { "assets/app.js": marker } });
      await asAdmin(app, "operator").ok(
        adminPackageVersionSchema,
        "POST",
        `${versionUrl(id, "1.0.0")}/submit`,
      );

      await chmod(blobOf(marker), 0o644);
      await writeFile(blobOf(marker), "export const sürüm = 'değiştirildi';\n");

      const response = await admin.request("POST", `${versionUrl(id, "1.0.0")}/approve`);
      expect(response).toMatchObject({
        status: 500,
        body: { error: { code: "package_integrity_failed" } },
      });
      expect(app.logs.at(-1)).toMatchObject({
        level: "error",
        fields: { packageId: id, path: "assets/app.js", reason: "corrupt" },
      });
      const version = await admin.ok(adminPackageVersionSchema, "GET", versionUrl(id, "1.0.0"));
      expect(version.status).toBe("in_review");
    });

    it("açılışta yalnızca eskimiş geçici dosyaları siler; süren bir yazmaya dokunmaz", async () => {
      const incoming = join(store.root, "incoming");
      const fresh = join(incoming, "suren-yazma");
      const stale = join(incoming, "yarim-kalmis");
      await writeFile(fresh, "yazılıyor");
      await writeFile(stale, "artık");
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(stale, twoHoursAgo, twoHoursAgo);

      // Aynı depoyu ikinci bir süreç açar: çalışan API'nin yanında depo denetimi gibi.
      await createLocalPackageStore(store.root);
      expect(await readdir(incoming)).toEqual(["suren-yazma"]);
      await rm(fresh);
    });

    it("depo denetimi eksilen, bozulan ve listesi değişen sürümleri yollarıyla bildirir", async () => {
      const id = await createPackage(app);
      const lost = `export const durum = "${unique("kayip")}";\n`;
      const broken = `export const durum = "${unique("bozuk")}";\n`;
      await approveVersion(app, {
        id,
        version: "1.0.0",
        files: { "assets/kayip.js": lost, "assets/bozuk.js": broken },
      });
      // İkinci sürüm aynı dosyalardan birini taşır: eksik içerik iki sürümde de bildirilmelidir.
      await uploadVersion(app, { id, version: "1.1.0", files: { "assets/kayip.js": lost } });
      const ownProblems = async () => {
        const report = await app.services.packages.verifyStore();
        return report.problems.filter((problem) => problem.packageId === id);
      };

      const before = await app.services.packages.verifyStore();
      expect(before.problems.filter((problem) => problem.packageId === id)).toEqual([]);
      expect(before.versions).toBeGreaterThanOrEqual(2);
      // Örnek paketin ortak dosyaları iki sürümde de vardır ama depodan bir kez okunur.
      expect(before.contents).toBeLessThan(before.files);

      await rm(blobOf(lost), { force: true });
      await chmod(blobOf(broken), 0o644);
      await writeFile(blobOf(broken), "export const durum = 'değişti';\n");
      // Taslağın dosya listesine uygulamanın dışından bir satır eklenir.
      await app.db.execute(sql`
        insert into package_files (package_id, version, path, sha256, size, content_type)
        values (${id}, '1.1.0', 'assets/gizli.js', ${"b".repeat(64)}, 10, 'text/javascript')
      `);

      const approved = { packageId: id, version: "1.0.0", status: "approved" };
      const draft = { packageId: id, version: "1.1.0", status: "draft" };
      expect(await ownProblems()).toEqual([
        { ...approved, path: "assets/bozuk.js", reason: "corrupt" },
        { ...approved, path: "assets/kayip.js", reason: "missing" },
        { ...draft, path: null, reason: "digest_mismatch" },
        { ...draft, path: "assets/gizli.js", reason: "missing" },
        { ...draft, path: "assets/kayip.js", reason: "missing" },
      ]);
    });
  });
});
