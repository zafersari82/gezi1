import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { withTenant } from "../src/core/tenant-scope";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

describe("İşletme kapsamının veritabanında zorlanması", () => {
  test("geçerli üyeliğin kopyalanan kapsam nesnesi motor işlemine giremez", async () => {
    const f = await createTenantFixture(app);
    await expect(
      Promise.resolve().then(() =>
        withTenant(app.db, { ...f.scope }, (tx) => tx.many(sql`select * from branches`)),
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      await withTenant(app.db, f.scope, (tx) => tx.many(sql`select * from branches`)),
    ).toHaveLength(1);
  });

  test("API rolü sahip, süper kullanıcı veya RLS atlayan rol değildir", async () => {
    const role = await app.db.one(sql`
      select current_user as name, rolsuper, rolbypassrls,
        pg_has_role(current_user, 'vado_owner', 'MEMBER') as owner_member,
        pg_has_role(current_user, 'vado_platform', 'MEMBER') as platform_member
      from pg_roles where rolname = current_user
    `);
    expect(role).toMatchObject({
      name: "vado_app",
      rolsuper: false,
      rolbypassrls: false,
      owner_member: false,
      platform_member: false,
    });
  });

  test("her yeni işletme tablosunda RLS ve FORCE açıktır", async () => {
    const rows = await app.db.many<{ name: string; enabled: boolean; forced: boolean }>(sql`
      select relname as name, relrowsecurity as enabled, relforcerowsecurity as forced
      from pg_class where relnamespace = 'public'::regnamespace
        and relname in ('business_members', 'branches', 'branch_hours',
          'business_customers', 'app_instances')
      order by relname
    `);
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row).toMatchObject({ enabled: true, forced: true });
  });

  test("kapsamsız okuma boş, kapsamsız yazma yasaktır", async () => {
    expect(await app.db.many(sql`select * from business_members`)).toEqual([]);
    expect(await app.db.many(sql`select * from branches`)).toEqual([]);
    await expect(
      app.db.execute(sql`
      insert into branches (id, business_id, name)
      values (${randomUUID()}, ${app.adminBusinessId}, 'Kapsamsız şube')
    `),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("Şema sahibinin yalıtımı", () => {
  test("FORCE şema sahibini de sınırlar; sahip yalnızca açık kapsamda işletme verisini görür", async () => {
    const f = await createTenantFixture(app);
    expect(await app.migrationDb.many(sql`select * from branches`)).toEqual([]);
    expect(
      await scoped(app.migrationDb, f.businessId, (tx) => tx.many(sql`select * from branches`)),
    ).toHaveLength(1);
  });
});

describe("VADO hesabıyla işletme üyeliği", () => {
  test("başvuru sahibi otomatik sahip üyeliği alır; yabancı hesap şubeyi göremez", async () => {
    const owner = await createUser(app, "Yeni işletme sahibi");
    const outsider = await createUser(app, "Başka hesap");
    const created = await as(app, owner).request("POST", "/v1/businesses", {
      body: { name: "Yeni işletme", slug: `yeni-${randomUUID()}`, category: "food", city: "İzmir" },
    });
    expect(created.status).toBe(200);
    const business = created.body as { id: string };
    const mine = await as(app, owner).request("GET", "/v1/business/memberships");
    expect(mine).toMatchObject({
      status: 200,
      body: { items: [{ businessId: business.id, role: "owner" }] },
    });
    const branch = await as(app, owner).request("POST", `/v1/business/${business.id}/branches`, {
      body: { name: "Merkez", timezone: "Europe/Istanbul" },
    });
    expect(branch).toMatchObject({ status: 200, body: { name: "Merkez" } });
    const foreign = await as(app, outsider).request("GET", `/v1/business/${business.id}/branches`);
    expect(foreign).toMatchObject({ status: 403, body: { error: { code: "forbidden" } } });
  });

  test("personel ürün veya şube yönetemez; üyeliği kapatılınca erişimi kesilir", async () => {
    const fixture = await createTenantFixture(app);
    const staff = await createUser(app, "Personel");
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    const url = `/v1/business/${fixture.businessId}/branches`;
    expect(await as(app, staff).request("GET", url)).toMatchObject({ status: 200 });
    expect(
      await as(app, staff).request("POST", url, { body: { name: "Yetkisiz şube" } }),
    ).toMatchObject({ status: 403 });
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: staff.id,
      role: "staff",
      active: false,
    });
    expect(await as(app, staff).request("GET", url)).toMatchObject({ status: 403 });
  });

  test("müşteri kimliği işletmede sabittir, işletmeler arasında farklıdır ve hesap silinince bağ kopar", async () => {
    const a = await createTenantFixture(app);
    const b = await createTenantFixture(app);
    const repeated = await app.services.businessManagement.customerScope(
      a.customer.id,
      a.businessId,
      a.instanceId,
    );
    const other = await app.services.businessManagement.customerScope(
      a.customer.id,
      b.businessId,
      b.instanceId,
    );
    expect(repeated.businessCustomerId).toBe(a.customerScope.businessCustomerId);
    expect(other.businessCustomerId).not.toBe(repeated.businessCustomerId);
    const secondApp = await startTestApp();
    try {
      const fromOtherProcess = await secondApp.services.businessManagement.customerScope(
        a.customer.id,
        a.businessId,
        a.instanceId,
      );
      expect(fromOtherProcess.businessCustomerId).toBe(repeated.businessCustomerId);
    } finally {
      await secondApp.stop();
    }
    await as(app, a.customer).done("DELETE", "/v1/me");
    const row = await scoped(app.db, a.businessId, (tx) =>
      tx.one(sql`
      select id, user_id from business_customers where id = ${repeated.businessCustomerId}
    `),
    );
    expect(row).toMatchObject({ id: repeated.businessCustomerId, user_id: null });
  });

  test("hafta sınırını aşan çalışma saatleri çakışamaz; başarısız değişiklik eski saatleri korur", async () => {
    const f = await createTenantFixture(app);
    const url = `/v1/business/${f.businessId}/branches/${f.branchId}/hours`;
    await as(app, f.owner).done("PUT", url, {
      body: { hours: [{ weekday: 6, opensAt: 1380, closesAt: 1500 }] },
    });
    const invalid = {
      hours: [
        { weekday: 6, opensAt: 1380, closesAt: 1500 },
        { weekday: 0, opensAt: 0, closesAt: 60 },
      ],
    };
    expect(await as(app, f.owner).request("PUT", url, { body: invalid })).toMatchObject({
      status: 400,
    });
    expect(await as(app, f.owner).request("GET", url)).toMatchObject({
      status: 200,
      body: { hours: [{ weekday: 6, opensAt: 1380, closesAt: 1500 }] },
    });
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`
      insert into branch_hours(business_id, branch_id, weekday, opens_at, closes_at)
      values (${f.businessId}, ${f.branchId}, 0, 0, 60)
    `),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("Gerçek uygulama rolüyle saldırı denemeleri", () => {
  test("sahip üyeliğinin kimliği ve rolü doğrudan SQL ile değiştirilemez", async () => {
    const f = await createTenantFixture(app);
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`
      update business_members set role = 'staff' where business_id = ${f.businessId} and role = 'owner'
    `),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`
      delete from business_members where business_id = ${f.businessId} and role = 'owner'
    `),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  test("beş tablonun yabancı okuma, güncelleme, silme ve kapsam değiştirmesi engellenir", async () => {
    const a = await createTenantFixture(app);
    const b = await createTenantFixture(app);
    await scoped(app.db, b.businessId, (tx) =>
      tx.execute(sql`
      insert into branch_hours(business_id, branch_id, weekday, opens_at, closes_at)
      values (${b.businessId}, ${b.branchId}, 1, 540, 1020)
    `),
    );
    const cases = [
      {
        read: sql`select * from business_members where business_id = ${b.businessId}`,
        update: sql`update business_members set active = false where business_id = ${b.businessId}`,
        remove: sql`delete from business_members where business_id = ${b.businessId}`,
        pivot: sql`insert into business_members(business_id, user_id, role)
          values (${b.businessId}, ${b.customer.id}, 'staff')`,
      },
      {
        read: sql`select * from branches where business_id = ${b.businessId}`,
        update: sql`update branches set active = false where business_id = ${b.businessId}`,
        remove: sql`delete from branches where business_id = ${b.businessId}`,
        pivot: sql`update branches set business_id = ${b.businessId} where business_id = ${a.businessId}`,
      },
      {
        read: sql`select * from branch_hours where business_id = ${b.businessId}`,
        update: sql`update branch_hours set opens_at = 600 where business_id = ${b.businessId}`,
        remove: sql`delete from branch_hours where business_id = ${b.businessId}`,
        pivot: sql`insert into branch_hours(business_id, branch_id, weekday, opens_at, closes_at)
          values (${b.businessId}, ${b.branchId}, 1, 0, 60)`,
      },
      {
        read: sql`select * from business_customers where business_id = ${b.businessId}`,
        update: sql`update business_customers set user_id = null where business_id = ${b.businessId}`,
        remove: sql`delete from business_customers where business_id = ${b.businessId}`,
        pivot: sql`update business_customers set business_id = ${b.businessId} where business_id = ${a.businessId}`,
      },
      {
        read: sql`select * from app_instances where business_id = ${b.businessId}`,
        update: sql`update app_instances set active = false where business_id = ${b.businessId}`,
        remove: sql`delete from app_instances where business_id = ${b.businessId}`,
        pivot: sql`insert into app_instances(business_id, mini_app_id, merchant_id)
          values (${b.businessId}, ${b.miniAppId}, ${b.merchantId})`,
      },
    ];
    for (const entry of cases) {
      expect(
        (await scoped(app.db, b.businessId, (tx) => tx.many(entry.read))).length,
      ).toBeGreaterThan(0);
      expect(await app.db.many(entry.read)).toEqual([]);
      await scoped(app.db, a.businessId, async (tx) => {
        expect(await tx.many(entry.read)).toEqual([]);
        expect(await tx.execute(entry.update)).toBe(0);
        expect(await tx.execute(entry.remove)).toBe(0);
      });
      await expect(
        scoped(app.db, a.businessId, (tx) => tx.execute(entry.pivot)),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await expect(
      scoped(app.db, a.businessId, (tx) =>
        tx.execute(sql`
      insert into branch_hours(business_id, branch_id, weekday, opens_at, closes_at)
      values (${a.businessId}, ${b.branchId}, 1, 0, 60)
    `),
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      scoped(app.db, a.businessId, (tx) =>
        tx.execute(sql`
      insert into app_instances(business_id, mini_app_id, merchant_id)
      values (${a.businessId}, ${b.miniAppId}, ${b.merchantId})
    `),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  test("havuz ve iç içe işlemler işletme kapsamını sızdırmaz", async () => {
    const a = await createTenantFixture(app);
    const b = await createTenantFixture(app);
    await withTenant(app.db, a.scope, async (tx) => {
      expect(await tx.many(sql`select * from branches`)).toHaveLength(1);
      await expect(withTenant(tx, b.scope, () => Promise.resolve())).rejects.toMatchObject({
        code: "forbidden",
      });
    });
    expect(await app.db.many(sql`select * from branches`)).toEqual([]);
    await expect(
      withTenant(app.db, a.scope, () => Promise.reject(new Error("Geri alma denemesi"))),
    ).rejects.toThrow("Geri alma denemesi");
    expect(await app.db.many(sql`select * from branches`)).toEqual([]);
    await expect(
      app.db.execute(sql`alter table branches disable row level security`),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(app.db.execute(sql`set role vado_platform`)).rejects.toMatchObject({
      code: "42501",
    });
  });
});
