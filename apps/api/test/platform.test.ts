import {
  adminMiniAppSchema,
  adminOverviewSchema,
  type AdminSaveMiniAppBody,
  businessDetailSchema,
  businessSchema,
  issuedQrSchema,
  listOf,
  miniAppDetailSchema,
  miniAppIdentitySchema,
  miniAppSchema,
  pageOf,
  paymentSchema,
  QR_PREFIX,
  qrTargetSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { createAppKeys } from "../src/core/keys";
import {
  as,
  asAdmin,
  type Client,
  createUser,
  startTestApp,
  type TestApp,
  type TestUser,
} from "./support/harness";
import { unique } from "./support/packages";

type Development = NonNullable<AdminSaveMiniAppBody["development"]>;

/**
 * Geliştiricinin kendi sunucusundan açılan bir kaydın gövdesi. Bu dosyadaki sınamalar kaydın
 * kodunun nereden geldiğiyle ilgilenmez; paketle yayınlanan kayıtlar miniapp-packages.test.ts
 * dosyasında sınanır.
 */
function record(
  development: Partial<Development> = {},
  showcase: Partial<AdminSaveMiniAppBody> = {},
): AdminSaveMiniAppBody {
  return {
    name: "VADO Randevu",
    description: "Kuaför ve bakım randevuları için örnek mini uygulama",
    category: "beauty",
    developerName: "VADO",
    ...showcase,
    development: {
      entryUrl: "https://randevu.example.com/",
      allowedOrigins: ["https://randevu.example.com"],
      capabilities: ["identity.basic", "payment.request", "storage.local"],
      version: "1.0.0",
      ...development,
    },
  };
}

describe("mini uygulamalar, işletmeler, QR ve ödemeler", () => {
  let app: TestApp;
  let admin: Client;
  let user: TestUser;

  beforeAll(async () => {
    app = await startTestApp();
    admin = asAdmin(app);
    user = await createUser(app, "Ayşe");
  });
  afterAll(() => app.stop());

  /** Doğrulanmış, yayında bir mini uygulama ve ona bağlı satıcı oluşturur. */
  async function publishMiniApp(development: Partial<Development> = {}) {
    const id = unique("uygulama");
    await admin.ok(adminMiniAppSchema, "PUT", `/v1/admin/miniapps/${id}`, {
      body: record(development),
    });
    await admin.done("PATCH", `/v1/admin/miniapps/${id}`, { body: { verified: true } });
    const merchantId = unique("satici");
    await admin.done("PUT", `/v1/admin/miniapps/${id}/merchants/${merchantId}`, {
      body: { displayName: "Kadıköy Berber" },
    });
    return { id, merchantId };
  }

  describe("mini uygulama kaydı", () => {
    it("yeni kayıt doğrulanana kadar kullanıcılara görünmez", async () => {
      const id = unique("uygulama");
      const saved = await admin.ok(adminMiniAppSchema, "PUT", `/v1/admin/miniapps/${id}`, {
        body: record(),
      });
      expect(saved).toMatchObject({
        source: "url",
        verified: false,
        enabled: true,
        offlineReason: "unverified",
      });
      const overview = await admin.ok(adminOverviewSchema, "GET", "/v1/admin/overview");
      expect(overview.unverifiedMiniApps).toBeGreaterThan(0);

      const client = as(app, user);
      await client.fail("miniapp_not_found", "GET", `/v1/miniapps/${id}`);

      await admin.done("PATCH", `/v1/admin/miniapps/${id}`, { body: { verified: true } });
      const visible = await client.ok(miniAppDetailSchema, "GET", `/v1/miniapps/${id}`);
      expect(visible).toMatchObject({
        source: "url",
        entryUrl: "https://randevu.example.com/",
        scope: ["https://randevu.example.com/"],
        config: {},
      });
      const list = await client.ok(listOf(miniAppSchema), "GET", "/v1/miniapps?category=beauty");
      expect(list.items.some((item) => item.id === id)).toBe(true);

      await admin.done("PATCH", `/v1/admin/miniapps/${id}`, { body: { enabled: false } });
      await client.fail("miniapp_not_found", "GET", `/v1/miniapps/${id}`);
    });

    it("adres veya yetki değişince doğrulama sıfırlanır; ad değişince sıfırlanmaz", async () => {
      const { id } = await publishMiniApp();
      const url = `/v1/admin/miniapps/${id}`;

      const renamed = await admin.ok(adminMiniAppSchema, "PUT", url, {
        body: record({}, { name: "Yeni Ad" }),
      });
      expect(renamed.verified).toBe(true);

      const moreAccess = await admin.ok(adminMiniAppSchema, "PUT", url, {
        body: record({
          capabilities: ["identity.basic", "payment.request", "storage.local", "location.coarse"],
        }),
      });
      expect(moreAccess.verified).toBe(false);

      await admin.done("PATCH", url, { body: { verified: true } });
      const moved = await admin.ok(adminMiniAppSchema, "PUT", url, {
        body: record({
          capabilities: ["identity.basic", "payment.request", "storage.local", "location.coarse"],
          entryUrl: "https://baska.example.com/",
          allowedOrigins: ["https://baska.example.com"],
        }),
      });
      expect(moved.verified).toBe(false);
    });

    it("giriş adresi izinli kaynaklarda değilse kaydı reddeder", async () => {
      await admin.fail(
        "miniapp_origin_invalid",
        "PUT",
        `/v1/admin/miniapps/${unique("uygulama")}`,
        {
          body: record({
            entryUrl: "https://kotu.example.com/",
            allowedOrigins: ["https://randevu.example.com"],
          }),
        },
      );
    });

    it("kimlik her mini uygulama için farklı, aynı uygulama için sabittir", async () => {
      const first = await publishMiniApp();
      const second = await publishMiniApp();
      const client = as(app, user);

      const a1 = await client.ok(miniAppIdentitySchema, "GET", `/v1/miniapps/${first.id}/identity`);
      const a2 = await client.ok(miniAppIdentitySchema, "GET", `/v1/miniapps/${first.id}/identity`);
      const b = await client.ok(miniAppIdentitySchema, "GET", `/v1/miniapps/${second.id}/identity`);
      expect(a1.openId).toBe(a2.openId);
      expect(a1.openId).not.toBe(b.openId);
      expect(a1.openId).not.toContain(user.id);
      expect(a1).not.toHaveProperty("phone");
      expect(a1.displayName).toBe("Ayşe");

      const noIdentity = await publishMiniApp({ capabilities: ["storage.local"] });
      await client.fail("forbidden", "GET", `/v1/miniapps/${noIdentity.id}/identity`);
    });
  });

  describe("geliştirme kipinde mini uygulama kaydı", () => {
    it("geliştiricinin bilgisayarındaki şifresiz adresi kabul eder", async () => {
      const saved = await admin.ok(
        adminMiniAppSchema,
        "PUT",
        `/v1/admin/miniapps/${unique("uygulama")}`,
        {
          body: record({
            entryUrl: "http://localhost:5173/",
            allowedOrigins: ["http://localhost:5173"],
          }),
        },
      );
      expect(saved.development).toEqual({
        entryUrl: "http://localhost:5173/",
        allowedOrigins: ["http://localhost:5173"],
      });
    });
  });

  describe("işletmeler", () => {
    it("başvuru onaylanana kadar listelenmez; onaydan sonra mini uygulamalarıyla görünür", async () => {
      const owner = await createUser(app, "İşletme Sahibi");
      const client = as(app, owner);
      const slug = unique("kadikoy-berber");

      const created = await client.ok(businessSchema, "POST", "/v1/businesses", {
        body: {
          name: "Kadıköy Berber",
          slug,
          category: "beauty",
          city: "İstanbul",
          taxNumber: "1234567890",
        },
      });
      expect(created).toMatchObject({ status: "pending", verified: false });
      await client.fail("slug_taken", "POST", "/v1/businesses", {
        body: { name: "Kopya", slug, category: "beauty", city: "İstanbul" },
      });

      await client.fail("business_not_found", "GET", `/v1/businesses/${created.id}`);
      const mine = await client.ok(listOf(businessSchema), "GET", "/v1/businesses/mine");
      expect(mine.items.map((item) => item.id)).toEqual([created.id]);

      await admin.done("PATCH", `/v1/admin/businesses/${created.id}`, {
        body: { verified: true, status: "active" },
      });
      const { id: miniAppId, merchantId } = await publishMiniApp();
      await admin.done("PUT", `/v1/admin/miniapps/${miniAppId}/merchants/${merchantId}`, {
        body: { displayName: "Kadıköy Berber", businessId: created.id },
      });

      const detail = await as(app, user).ok(
        businessDetailSchema,
        "GET",
        `/v1/businesses/${created.id}`,
      );
      expect(detail.miniApps.map((item) => item.id)).toEqual([miniAppId]);
      expect(detail).not.toHaveProperty("taxNumber");
      const listed = await as(app, user).ok(
        listOf(businessSchema),
        "GET",
        "/v1/businesses?category=beauty",
      );
      expect(listed.items.some((item) => item.id === created.id)).toBe(true);
    });
  });

  describe("QR", () => {
    it("kişisel kod başka kullanıcıda profili açar", async () => {
      const scanner = await createUser(app, "Okutan");
      const issued = await as(app, user).ok(issuedQrSchema, "POST", "/v1/qr", {
        body: { type: "user" },
      });
      expect(issued.value.startsWith(QR_PREFIX)).toBe(true);
      expect(issued.expiresAt).not.toBeNull();

      const target = await as(app, scanner).ok(qrTargetSchema, "POST", "/v1/qr/resolve", {
        body: { value: issued.value },
      });
      expect(target).toMatchObject({ type: "user", user: { id: user.id, relation: "none" } });
    });

    it("değiştirilmiş, bozuk ve süresi dolmuş kodu reddeder", async () => {
      const client = as(app, user);
      const issued = await client.ok(issuedQrSchema, "POST", "/v1/qr", { body: { type: "user" } });
      // Kod `<veri>.<anahtar kimliği>.<imza>` biçimindedir; veriden sonrası imzadır.
      const body = issued.value.slice(QR_PREFIX.length);
      const data = body.slice(0, body.indexOf("."));
      const signature = body.slice(body.indexOf(".") + 1);

      const forged = Buffer.from(JSON.stringify({ t: "user", id: user.id, exp: null })).toString(
        "base64url",
      );
      await client.fail("qr_invalid", "POST", "/v1/qr/resolve", {
        body: { value: `${QR_PREFIX}${forged}.${signature}` },
      });
      await client.fail("qr_invalid", "POST", "/v1/qr/resolve", {
        body: { value: `${QR_PREFIX}${data}.` },
      });
      await client.fail("qr_invalid", "POST", "/v1/qr/resolve", {
        body: { value: "https://example.com/q" },
      });

      const expired = Buffer.from(JSON.stringify({ t: "user", id: user.id, exp: 1 })).toString(
        "base64url",
      );
      const expiredSignature = createAppKeys(app.config.keys).qr.sign(expired);
      await client.fail("qr_expired", "POST", "/v1/qr/resolve", {
        body: { value: `${QR_PREFIX}${expired}.${expiredSignature}` },
      });
    });

    it("mini uygulama kodu süresizdir ve uygulama kapatılınca geçersizleşir", async () => {
      const { id } = await publishMiniApp();
      const client = as(app, user);
      const issued = await client.ok(issuedQrSchema, "POST", "/v1/qr", {
        body: { type: "miniapp", id },
      });
      expect(issued.expiresAt).toBeNull();

      const target = await client.ok(qrTargetSchema, "POST", "/v1/qr/resolve", {
        body: { value: issued.value },
      });
      expect(target).toMatchObject({ type: "miniapp", miniApp: { id } });

      await admin.done("PATCH", `/v1/admin/miniapps/${id}`, { body: { enabled: false } });
      await client.fail("qr_target_unavailable", "POST", "/v1/qr/resolve", {
        body: { value: issued.value },
      });
    });

    it("panel parametreli kod üretir; parametreler imzalıdır ve okutulunca kayıtla birlikte döner", async () => {
      const { id } = await publishMiniApp();
      const client = as(app, user);
      const params = { masa: "12", sube: "kadikoy" };
      const issued = await admin.ok(issuedQrSchema, "POST", `/v1/admin/miniapps/${id}/qr`, {
        body: { params },
      });
      expect(issued.expiresAt).toBeNull();
      const target = await client.ok(qrTargetSchema, "POST", "/v1/qr/resolve", {
        body: { value: issued.value },
      });
      expect(target).toMatchObject({ type: "miniapp", miniApp: { id }, params });

      // Parametreyi değiştirmek imzayı bozar.
      const body = issued.value.slice(QR_PREFIX.length);
      const signature = body.slice(body.indexOf(".") + 1);
      const forged = Buffer.from(
        JSON.stringify({ t: "miniapp", id, exp: null, p: { masa: "99" } }),
      ).toString("base64url");
      await client.fail("qr_invalid", "POST", "/v1/qr/resolve", {
        body: { value: `${QR_PREFIX}${forged}.${signature}` },
      });

      // Kullanıcının ürettiği kod parametre taşımaz; gövdeye yazılan parametre yok sayılır.
      const plain = await client.ok(issuedQrSchema, "POST", "/v1/qr", {
        body: { type: "miniapp", id, params },
      });
      const plainTarget = await client.ok(qrTargetSchema, "POST", "/v1/qr/resolve", {
        body: { value: plain.value },
      });
      expect(plainTarget).toMatchObject({ type: "miniapp", params: {} });

      const [audit] = await app.db.many<{ metadata: unknown }>(sql`
        select metadata from audit_log
        where action = 'miniapp.qr_issued' and target_id = ${id}
      `);
      expect(audit?.metadata).toEqual({ params });
    });

    it("parametresiz panel kodu önceki sürümlerin ürettiği kodla aynı biçimdedir", async () => {
      const { id } = await publishMiniApp();
      const fromPanel = await admin.ok(issuedQrSchema, "POST", `/v1/admin/miniapps/${id}/qr`, {
        body: { params: {} },
      });
      const fromUser = await as(app, user).ok(issuedQrSchema, "POST", "/v1/qr", {
        body: { type: "miniapp", id },
      });
      expect(fromPanel.value).toBe(fromUser.value);
    });

    it("parametre sayısı, adı ve uzunluğu sınırlıdır; kayıt yoksa kod üretilmez", async () => {
      const { id } = await publishMiniApp();
      const url = `/v1/admin/miniapps/${id}/qr`;
      const six = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((key) => [key, "1"]));
      for (const params of [
        six,
        { Masa: "1" },
        { "masa-no": "1" },
        { ["a".repeat(21)]: "1" },
        { masa: "x".repeat(65) },
        { masa: "" },
      ]) {
        await admin.fail("validation_failed", "POST", url, { body: { params } });
      }
      const five = Object.fromEntries(
        ["a", "b", "c", "d", "e"].map((key) => [key, "x".repeat(64)]),
      );
      await admin.ok(issuedQrSchema, "POST", url, { body: { params: five } });
      await admin.fail("miniapp_not_found", "POST", `/v1/admin/miniapps/${unique("yok")}/qr`, {
        body: { params: {} },
      });
    });

    it("yayında olmayan kayda kod üretilir; okutulunca açılamadığı söylenir", async () => {
      const id = unique("uygulama");
      await admin.ok(adminMiniAppSchema, "PUT", `/v1/admin/miniapps/${id}`, { body: record({}) });
      const issued = await admin.ok(issuedQrSchema, "POST", `/v1/admin/miniapps/${id}/qr`, {
        body: { params: { masa: "1" } },
      });
      await as(app, user).fail("qr_target_unavailable", "POST", "/v1/qr/resolve", {
        body: { value: issued.value },
      });
    });

    it("işletme kodunu yalnızca işletmenin sahibi üretir", async () => {
      const owner = await createUser(app, "Sahip");
      const business = await as(app, owner).ok(businessSchema, "POST", "/v1/businesses", {
        body: {
          name: "Moda Kahve",
          slug: unique("moda-kahve"),
          category: "food",
          city: "İstanbul",
        },
      });
      const body = { type: "business", id: business.id };

      await as(app, owner).fail("business_not_found", "POST", "/v1/qr", { body });
      await admin.done("PATCH", `/v1/admin/businesses/${business.id}`, {
        body: { verified: true, status: "active" },
      });
      await as(app, user).fail("business_not_found", "POST", "/v1/qr", { body });

      const issued = await as(app, owner).ok(issuedQrSchema, "POST", "/v1/qr", { body });
      const target = await as(app, user).ok(qrTargetSchema, "POST", "/v1/qr/resolve", {
        body: { value: issued.value },
      });
      expect(target).toMatchObject({
        type: "business",
        business: { id: business.id, name: "Moda Kahve" },
      });
    });
  });

  describe("ödemeler", () => {
    function order(miniAppId: string, merchantId: string, amountMinor = 65_000) {
      return {
        miniAppId,
        merchantId,
        orderId: unique("siparis"),
        description: "Saç kesimi",
        amountMinor,
      };
    }

    it("oturum açılır, kullanıcı onaylar ve ödeme tamamlanır", async () => {
      const { id, merchantId } = await publishMiniApp();
      const client = as(app, user);

      const created = await client.ok(paymentSchema, "POST", "/v1/payments", {
        body: order(id, merchantId),
      });
      expect(created).toMatchObject({
        status: "created",
        sandbox: true,
        currency: "TRY",
        amountMinor: 65_000,
        merchantName: "Kadıköy Berber",
        miniAppName: "VADO Randevu",
      });

      // Kimlik yakın zamanda kanıtlanmamışsa ödeme onaylanmaz.
      await app.db.execute(sql`
        update sessions set verified_at = now() - interval '11 minutes' where id = ${user.sessionId}
      `);
      await client.fail("verification_required", "POST", `/v1/payments/${created.id}/confirm`);
      await app.db.execute(
        sql`update sessions set verified_at = now() where id = ${user.sessionId}`,
      );

      const paid = await client.ok(paymentSchema, "POST", `/v1/payments/${created.id}/confirm`);
      expect(paid.status).toBe("paid");
      const again = await client.ok(paymentSchema, "POST", `/v1/payments/${created.id}/confirm`);
      expect(again.status).toBe("paid");
      await client.fail("payment_state_invalid", "POST", `/v1/payments/${created.id}/cancel`);

      const history = await client.ok(pageOf(paymentSchema), "GET", "/v1/payments");
      expect(history.items[0]?.id).toBe(created.id);
    });

    it("aynı sipariş için ikinci oturum açmaz; tutar farklıysa reddeder", async () => {
      const { id, merchantId } = await publishMiniApp();
      const client = as(app, user);
      const body = order(id, merchantId);

      const first = await client.ok(paymentSchema, "POST", "/v1/payments", { body });
      const second = await client.ok(paymentSchema, "POST", "/v1/payments", { body });
      expect(second.id).toBe(first.id);
      await client.fail("payment_state_invalid", "POST", "/v1/payments", {
        body: { ...body, amountMinor: 1 },
      });
    });

    it("yetkisi veya satıcı eşleştirmesi olmayan mini uygulamaya ödeme açmaz", async () => {
      const client = as(app, user);
      const withoutPayment = await publishMiniApp({ capabilities: ["identity.basic"] });
      await client.fail("payment_not_allowed", "POST", "/v1/payments", {
        body: order(withoutPayment.id, withoutPayment.merchantId),
      });

      const { id, merchantId } = await publishMiniApp();
      await client.fail("merchant_not_bound", "POST", "/v1/payments", {
        body: order(id, "baska-satici"),
      });

      await admin.done("PUT", `/v1/admin/miniapps/${id}/merchants/${merchantId}`, {
        body: { displayName: "Kadıköy Berber", active: false },
      });
      await client.fail("merchant_not_bound", "POST", "/v1/payments", {
        body: order(id, merchantId),
      });
    });

    it("iptal edilen ve süresi dolan ödeme onaylanamaz", async () => {
      const { id, merchantId } = await publishMiniApp();
      const client = as(app, user);

      const cancelled = await client.ok(paymentSchema, "POST", "/v1/payments", {
        body: order(id, merchantId),
      });
      expect(
        (await client.ok(paymentSchema, "POST", `/v1/payments/${cancelled.id}/cancel`)).status,
      ).toBe("cancelled");
      await client.fail("payment_state_invalid", "POST", `/v1/payments/${cancelled.id}/confirm`);

      const stale = await client.ok(paymentSchema, "POST", "/v1/payments", {
        body: order(id, merchantId),
      });
      await app.db.execute(sql`
        update payments set expires_at = now() - interval '1 minute' where id = ${stale.id}
      `);
      expect((await client.ok(paymentSchema, "GET", `/v1/payments/${stale.id}`)).status).toBe(
        "expired",
      );
      await client.fail("payment_expired", "POST", `/v1/payments/${stale.id}/confirm`);
    });

    it("başkasının ödemesini göremez ve onaylayamaz", async () => {
      const { id, merchantId } = await publishMiniApp();
      const other = await createUser(app, "Başkası");
      const payment = await as(app, user).ok(paymentSchema, "POST", "/v1/payments", {
        body: order(id, merchantId),
      });

      await as(app, other).fail("payment_not_found", "GET", `/v1/payments/${payment.id}`);
      await as(app, other).fail("payment_not_found", "POST", `/v1/payments/${payment.id}/confirm`);
    });

    it("tutar kuruş cinsinden pozitif tam sayı olmalıdır", async () => {
      const { id, merchantId } = await publishMiniApp();
      const client = as(app, user);
      await client.fail("validation_failed", "POST", "/v1/payments", {
        body: order(id, merchantId, 0),
      });
      await client.fail("validation_failed", "POST", "/v1/payments", {
        body: order(id, merchantId, 12.5),
      });
    });
  });

  describe("sağlayıcı modunda ödemeler", () => {
    let provider: TestApp;

    beforeAll(async () => {
      provider = await startTestApp({ VADO_PAYMENT_MODE: "provider" });
    });
    afterAll(() => provider.stop());

    it("lisanslı sağlayıcı bağlanmadan ödeme oturumu açmaz", async () => {
      const payer = await createUser(provider, "Ödeyen");
      const response = await as(provider, payer).request("POST", "/v1/payments", {
        body: {
          miniAppId: "herhangi-uygulama",
          merchantId: "herhangi-satici",
          orderId: "s-1",
          description: "Deneme",
          amountMinor: 100,
        },
      });
      expect(response.status).toBe(501);
      expect(response.body).toMatchObject({ error: { code: "payment_provider_unavailable" } });
    });
  });
});
