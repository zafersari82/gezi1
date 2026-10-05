import {
  ADMIN_ROLE_PERMISSIONS,
  adminAccountSchema,
  adminMiniAppSchema,
  adminMiniAppSummarySchema,
  adminTemporaryPasswordSchema,
  issuedQrSchema,
  listOf,
  SCOPED_PERMISSIONS,
  SCOPED_ROLES,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import {
  asAdmin,
  type Client,
  createBusiness,
  startTestApp,
  type TestApp,
} from "./support/harness";
import { publishSample, unique } from "./support/packages";

const CONFIG_FIELDS = [
  { key: "businessName", label: "İşletme adı", type: "text", required: true },
  { key: "seats", label: "Koltuk sayısı", type: "number", default: 2 },
];

describe("işletme hesabı", () => {
  let app: TestApp;
  let owner: Client;
  let business: Client;
  let otherBusinessId: string;
  /** İşletme hesabının işletmesine bağlı kayıt. */
  let own: string;
  /** Başka bir işletmeye bağlı kayıt. */
  let foreign: string;

  async function publishFor(businessId: string): Promise<string> {
    const { miniApp } = await publishSample(app, {
      manifest: { config: CONFIG_FIELDS },
      config: { businessName: "Örnek" },
    });
    await owner.done("PUT", `/v1/admin/miniapps/${miniApp.id}/merchants/${unique("satici")}`, {
      body: { displayName: "Örnek", businessId },
    });
    return miniApp.id;
  }

  beforeAll(async () => {
    app = await startTestApp();
    owner = asAdmin(app);
    business = asAdmin(app, "business");
    otherBusinessId = await createBusiness(app.db, "Başka İşletme");
    own = await publishFor(app.adminBusinessId);
    foreign = await publishFor(otherBusinessId);
    // Aynı kayda başka bir işletmenin satıcısı da bağlı: işletme hesabı onu görmez.
    await owner.done("PUT", `/v1/admin/miniapps/${own}/merchants/${unique("ortak")}`, {
      body: { displayName: "Ortak satıcı", businessId: otherBusinessId },
    });
  });
  afterAll(() => app.stop());

  it("izinleri yalnızca okumak ve ayarlamaktır; hepsi kapsamı uygulayan izinlerdir", () => {
    expect(SCOPED_ROLES).toEqual(["business"]);
    expect(ADMIN_ROLE_PERMISSIONS.business).toEqual(["miniapps.read", "miniapps.configure"]);
    for (const role of SCOPED_ROLES) {
      for (const permission of ADMIN_ROLE_PERMISSIONS[role]) {
        expect(SCOPED_PERMISSIONS).toContain(permission);
      }
    }
  });

  it("listede yalnızca kendi işletmesinin kayıtları ve kendi satıcıları görünür", async () => {
    const { items } = await business.ok(
      listOf(adminMiniAppSummarySchema),
      "GET",
      "/v1/admin/miniapps",
    );
    const ids = items.map((item) => item.id);
    expect(ids).toContain(own);
    expect(ids).not.toContain(foreign);
    const mine = items.find((item) => item.id === own);
    expect(mine?.merchants.map((merchant) => merchant.businessId)).toEqual([app.adminBusinessId]);

    const all = await owner.ok(listOf(adminMiniAppSummarySchema), "GET", "/v1/admin/miniapps");
    expect(all.items.map((item) => item.id)).toEqual(expect.arrayContaining([own, foreign]));
    expect(all.items.find((item) => item.id === own)?.merchants).toHaveLength(2);
  });

  it("kapsam dışındaki kayıt yokmuş gibi davranır", async () => {
    await business.fail("miniapp_not_found", "GET", `/v1/admin/miniapps/${foreign}`);
    await business.fail("miniapp_not_found", "PUT", `/v1/admin/miniapps/${foreign}/config`, {
      body: { config: { businessName: "Ele geçirildi" } },
    });
    await business.fail("miniapp_not_found", "POST", `/v1/admin/miniapps/${foreign}/qr`, {
      body: { params: { masa: "1" } },
    });
    const untouched = await owner.ok(adminMiniAppSchema, "GET", `/v1/admin/miniapps/${foreign}`);
    expect(untouched.config).toEqual({ businessName: "Örnek", seats: 2 });
  });

  it("kendi kaydının ayarlarını değiştirir ve QR kodu üretir; işlem kendi adıyla kaydedilir", async () => {
    const saved = await business.ok(adminMiniAppSchema, "PUT", `/v1/admin/miniapps/${own}/config`, {
      body: { config: { businessName: "Kendi Adım", seats: 5 } },
    });
    expect(saved.config).toEqual({ businessName: "Kendi Adım", seats: 5 });
    // Yayın geçmişinde VADO ekibinin adları görünmez; işletmenin kendi hesabı görünür.
    expect(saved.releases.map((release) => release.actor.name)).toEqual([
      "Sınama business",
      "VADO ekibi",
    ]);
    const forOwner = await owner.ok(adminMiniAppSchema, "GET", `/v1/admin/miniapps/${own}`);
    expect(forOwner.releases[1]?.actor.name).toBe("Sınama owner");

    await business.ok(issuedQrSchema, "POST", `/v1/admin/miniapps/${own}/qr`, {
      body: { params: { masa: "7" } },
    });
    const audit = await app.db.many<{ action: string; actor: string }>(sql`
      select action, actor from audit_log where target_id = ${own} and actor = ${app.admins.business.id}
      order by id
    `);
    expect(audit.map((row) => row.action)).toEqual(["miniapp.config_saved", "miniapp.qr_issued"]);
  });

  it("rol tablosu yanlışlıkla genişletilse bile kapsamsız uçlara giremez", async () => {
    const table = ADMIN_ROLE_PERMISSIONS;
    const original = table.business;
    table.business = [...original, "overview.read", "miniapps.manage"];
    try {
      await business.fail("forbidden", "GET", "/v1/admin/overview");
      await business.fail("forbidden", "PATCH", `/v1/admin/miniapps/${own}`, {
        body: { enabled: false },
      });
    } finally {
      table.business = original;
    }
  });

  it("vitrini, yayını, satıcıları ve kaydın durumunu değiştiremez; başka bölümlere giremez", async () => {
    const url = `/v1/admin/miniapps/${own}`;
    await business.fail("forbidden", "PATCH", url, { body: { enabled: false } });
    await business.fail("forbidden", "POST", `${url}/disable`);
    await business.fail("forbidden", "POST", `${url}/rollback`);
    await business.fail("forbidden", "PUT", `${url}/merchants/yeni-satici`, {
      body: { displayName: "Yeni", businessId: app.adminBusinessId },
    });
    for (const path of ["/v1/admin/overview", "/v1/admin/businesses", "/v1/admin/packages"]) {
      await business.fail("forbidden", "GET", path);
    }
  });
});

describe("işletme hesabı açmak", () => {
  let app: TestApp;
  let owner: Client;

  beforeAll(async () => {
    app = await startTestApp();
    owner = asAdmin(app);
  });
  afterAll(() => app.stop());

  it("işletme hesabı bir işletmeyle açılır; diğer roller işletmesiz", async () => {
    const username = unique("isletme");
    const created = await owner.ok(adminTemporaryPasswordSchema, "POST", "/v1/admin/accounts", {
      body: {
        username,
        displayName: "Kadıköy Berber",
        role: "business",
        businessId: app.adminBusinessId,
      },
    });
    expect(created.account).toMatchObject({
      role: "business",
      business: { id: app.adminBusinessId, name: "Sınama İşletmesi" },
    });

    await owner.fail("validation_failed", "POST", "/v1/admin/accounts", {
      body: { username: unique("isletmesiz"), displayName: "Eksik", role: "business" },
    });
    await owner.fail("validation_failed", "POST", "/v1/admin/accounts", {
      body: {
        username: unique("operator"),
        displayName: "Yanlış",
        role: "operator",
        businessId: app.adminBusinessId,
      },
    });
    await owner.fail("business_not_found", "POST", "/v1/admin/accounts", {
      body: {
        username: unique("yok"),
        displayName: "Olmayan",
        role: "business",
        businessId: "00000000-0000-4000-8000-000000000000",
      },
    });

    const accounts = await owner.ok(listOf(adminAccountSchema), "GET", "/v1/admin/accounts");
    expect(accounts.items.find((item) => item.username === username)?.business?.name).toBe(
      "Sınama İşletmesi",
    );
  });

  it("işletme hesabının rolü değişmez; ekip hesabı işletme hesabına çevrilemez", async () => {
    await owner.fail(
      "admin_scope_change_forbidden",
      "PATCH",
      `/v1/admin/accounts/${app.admins.business.id}`,
      {
        body: { role: "operator" },
      },
    );
    await owner.fail(
      "admin_scope_change_forbidden",
      "PATCH",
      `/v1/admin/accounts/${app.admins.support.id}`,
      {
        body: { role: "business" },
      },
    );
    // Adı ve durumu değişebilir.
    const renamed = await owner.ok(
      adminAccountSchema,
      "PATCH",
      `/v1/admin/accounts/${app.admins.business.id}`,
      { body: { displayName: "Yeni Ad" } },
    );
    expect(renamed.business?.id).toBe(app.adminBusinessId);
  });

  it("kural veritabanında da geçerlidir", async () => {
    const insert = (role: string, businessId: string | null) =>
      app.db.execute(sql`
        insert into admin_accounts (username, display_name, role, business_id, password_hash)
        values (${unique("sql")}, 'SQL', ${role}, ${businessId}, 'x')
      `);
    await expect(insert("business", null)).rejects.toThrow(/admin_accounts_business_scope_check/);
    await expect(insert("operator", app.adminBusinessId)).rejects.toThrow(
      /admin_accounts_business_scope_check/,
    );

    const other = await createBusiness(app.db, "Taşınacak İşletme");
    await expect(
      app.db.execute(
        sql`update admin_accounts set business_id = ${other} where id = ${app.admins.business.id}`,
      ),
    ).rejects.toThrow(/işletmesi değiştirilemez/);
    await expect(
      app.db.execute(sql`
        update admin_accounts set role = 'operator', business_id = null
        where id = ${app.admins.business.id}
      `),
    ).rejects.toThrow(/işletmesi değiştirilemez/);
    await expect(
      app.db.execute(sql`delete from businesses where id = ${app.adminBusinessId}`),
    ).rejects.toThrow(/foreign key/);
  });
});
