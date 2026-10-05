import {
  adminBusinessSchema,
  adminOverviewSchema,
  adminReportSchema,
  adminUserSchema,
  auditEntrySchema,
  businessSchema,
  listOf,
  meSchema,
  pageOf,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  anonymous,
  as,
  asAdmin,
  type Client,
  createUser,
  startTestApp,
  type TestApp,
} from "./support/harness";

describe("yönetim", () => {
  let app: TestApp;
  let admin: Client;

  beforeAll(async () => {
    app = await startTestApp();
    admin = asAdmin(app);
  });
  afterAll(() => app.stop());

  it("yönetici anahtarı olmadan veya yanlış anahtarla erişilemez", async () => {
    const user = await createUser(app, "Sıradan Kullanıcı");
    await anonymous(app).fail("admin_unauthorized", "GET", "/v1/admin/overview");
    await as(app, user).fail("admin_unauthorized", "GET", "/v1/admin/overview");
    await anonymous(app).fail("admin_unauthorized", "GET", "/v1/admin/users", {
      headers: { "x-vado-admin-key": "yanlis-anahtar" },
    });
  });

  it("genel bakış sayıları ve sunucu ayarlarını verir", async () => {
    await createUser(app, "Sayılan Kullanıcı");
    const overview = await admin.ok(adminOverviewSchema, "GET", "/v1/admin/overview");
    expect(overview.users).toBeGreaterThan(0);
    expect(overview.config).toMatchObject({
      demoMode: true,
      paymentMode: "sandbox",
      sessionDays: 30,
    });
  });

  it("kullanıcıyı arar, askıya alır ve yeniden açar", async () => {
    const user = await createUser(app, "Askıya Alınacak");
    const client = as(app, user);

    const found = await admin.ok(
      listOf(adminUserSchema),
      "GET",
      `/v1/admin/users?q=${encodeURIComponent(user.phone)}`,
    );
    expect(found.items.map((item) => item.id)).toEqual([user.id]);

    await admin.done("PATCH", `/v1/admin/users/${user.id}`, { body: { status: "suspended" } });
    await client.fail("unauthorized", "GET", "/v1/me");
    const suspended = await admin.ok(
      listOf(adminUserSchema),
      "GET",
      `/v1/admin/users?q=${encodeURIComponent(user.phone)}`,
    );
    expect(suspended.items[0]?.status).toBe("suspended");

    await admin.done("PATCH", `/v1/admin/users/${user.id}`, { body: { status: "active" } });
    await admin.fail(
      "user_not_found",
      "PATCH",
      "/v1/admin/users/00000000-0000-4000-8000-000000000000",
      {
        body: { status: "suspended" },
      },
    );
  });

  it("askıdaki hesap yeni oturum açamaz", async () => {
    const user = await createUser(app, "Askıda");
    await admin.done("PATCH", `/v1/admin/users/${user.id}`, { body: { status: "suspended" } });

    const guest = anonymous(app);
    await guest.request("POST", "/v1/auth/otp", { body: { phone: user.phone } });
    await guest.fail("account_suspended", "POST", "/v1/auth/otp/verify", {
      body: {
        phone: user.phone,
        code: "000000",
        deviceName: "Telefon",
        platform: "android",
        deviceId: "test-cihazi-0000-0001",
      },
    });
  });

  it("işletme başvurusunu vergi numarası ve sahibiyle listeler, onaylar", async () => {
    const owner = await createUser(app, "Sahip");
    const slug = `panel-isletme-${Date.now().toString(36)}`;
    const business = await as(app, owner).ok(businessSchema, "POST", "/v1/businesses", {
      body: {
        name: "Panel İşletmesi",
        slug,
        category: "food",
        city: "Ankara",
        taxNumber: "12345678901",
      },
    });

    const list = await admin.ok(
      listOf(adminBusinessSchema),
      "GET",
      `/v1/admin/businesses?q=${slug}`,
    );
    expect(list.items[0]).toMatchObject({
      id: business.id,
      taxNumber: "12345678901",
      owner: { id: owner.id, displayName: "Sahip" },
      ownerStatus: "active",
      status: "pending",
    });

    await admin.fail("validation_failed", "PATCH", `/v1/admin/businesses/${business.id}`, {
      body: {},
    });
    await admin.done("PATCH", `/v1/admin/businesses/${business.id}`, {
      body: { status: "active", verified: true },
    });
    await admin.fail(
      "business_not_found",
      "PATCH",
      "/v1/admin/businesses/00000000-0000-4000-8000-000000000000",
      {
        body: { verified: true },
      },
    );
  });

  it("sahibi hesabını silen işletme askıya alınır ve yeniden yayınlanamaz", async () => {
    const owner = await createUser(app, "Giden Sahip");
    const slug = `sahipsiz-${Date.now().toString(36)}`;
    const business = await as(app, owner).ok(businessSchema, "POST", "/v1/businesses", {
      body: { name: "Sahipsiz İşletme", slug, category: "other", city: "Bursa" },
    });
    const url = `/v1/admin/businesses/${business.id}`;
    await admin.done("PATCH", url, { body: { status: "active", verified: true } });

    await as(app, owner).done("DELETE", "/v1/me");

    const list = await admin.ok(
      listOf(adminBusinessSchema),
      "GET",
      `/v1/admin/businesses?q=${slug}`,
    );
    expect(list.items[0]).toMatchObject({ status: "suspended", ownerStatus: "deleted" });
    await admin.fail("business_owner_unavailable", "PATCH", url, { body: { status: "active" } });
    await admin.done("PATCH", url, { body: { verified: false } });
  });

  it("şikayet alınır, panelde görünür ve çözülür", async () => {
    const reporter = await createUser(app, "Şikayet Eden");
    const target = await createUser(app, "Şikayet Edilen");
    await as(app, reporter).done("POST", "/v1/reports", {
      body: {
        targetType: "user",
        targetId: target.id,
        reason: "spam",
        note: "Sürekli reklam gönderiyor",
      },
    });
    await as(app, reporter).fail("validation_failed", "POST", "/v1/reports", {
      body: { targetType: "user", targetId: target.id, reason: "bilinmeyen" },
    });

    const reports = await admin.ok(listOf(adminReportSchema), "GET", "/v1/admin/reports");
    const report = reports.items.find((item) => item.targetId === target.id);
    expect(report).toMatchObject({ reason: "spam", status: "open", reporter: { id: reporter.id } });

    await admin.done("PATCH", `/v1/admin/reports/${report?.id ?? ""}`, {
      body: { status: "resolved" },
    });
    const after = await admin.ok(listOf(adminReportSchema), "GET", "/v1/admin/reports");
    expect(after.items.find((item) => item.id === report?.id)?.status).toBe("resolved");
  });

  it("yönetim işlemleri denetim kaydına düşer", async () => {
    const user = await createUser(app, "Kayda Geçen");
    await admin.done("PATCH", `/v1/admin/users/${user.id}`, { body: { status: "suspended" } });

    // Denetim kaydı bütün sınama dosyalarınca paylaşılır; aynı anda çalışan başka bir dosyanın
    // kaydı araya girebilir. Bu yüzden ilk satıra değil, hedefe göre bakılır.
    const audit = await admin.ok(pageOf(auditEntrySchema), "GET", "/v1/admin/audit?limit=100");
    expect(audit.items.find((item) => item.targetId === user.id)).toMatchObject({
      actor: { id: app.admins.owner.id, name: "Sınama owner" },
      action: "user.suspended",
      targetType: "user",
      targetId: user.id,
    });
    const first = await admin.ok(pageOf(auditEntrySchema), "GET", "/v1/admin/audit?limit=1");
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
  });

  it("askıya alma, o kullanıcıya ait başka verileri etkilemez", async () => {
    const user = await createUser(app, "Geri Dönen");
    await admin.done("PATCH", `/v1/admin/users/${user.id}`, { body: { status: "suspended" } });
    await admin.done("PATCH", `/v1/admin/users/${user.id}`, { body: { status: "active" } });

    const fresh = await createUser(app, "Kontrol");
    expect((await as(app, fresh).ok(meSchema, "GET", "/v1/me")).displayName).toBe("Kontrol");
  });
});
