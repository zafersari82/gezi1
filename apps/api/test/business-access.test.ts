import {
  type AccessGrant,
  branchHoursBodySchema,
  branchPerformanceSchema,
  branchSchema,
  businessRegionSchema,
  businessRegionsSchema,
  memberAccessListSchema,
  memberAccessSchema,
  myBusinessAccessSchema,
  orderSchema,
  orderSummarySchema,
  staffInvitationAcceptedSchema,
  staffInvitationCreatedSchema,
  staffInvitationPreviewSchema,
  staffInvitationsSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import {
  as,
  type Client,
  createUser,
  startTestApp,
  type TestApp,
  type TestUser,
} from "./support/harness";
import { createOrderingFixture } from "./support/ordering-fixture";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

const orderList = z.object({
  items: z.array(orderSummarySchema),
  nextCursor: z.string().nullable(),
});
const branchList = z.object({ items: z.array(branchSchema) });
const regionAssignment = z.object({ branchId: z.string(), regionId: z.string().nullable() });

type Fixture = Awaited<ReturnType<typeof createTenantFixture>>;

async function addStaff(app: TestApp, fixture: Fixture, name: string): Promise<TestUser> {
  const user = await createUser(app, name);
  await app.services.businessManagement.setMember(fixture.scope, {
    userId: user.id,
    role: "staff",
    active: true,
  });
  return user;
}

async function memberOf(owner: Client, businessId: string, user: TestUser) {
  const list = await owner.ok(
    memberAccessListSchema,
    "GET",
    `/v1/business/${businessId}/access/members`,
  );
  const member = list.items.find((item) => item.userId === user.id);
  if (member === undefined) throw new Error("Üye bulunamadı");
  return member;
}

async function setGrants(owner: Client, businessId: string, user: TestUser, grants: AccessGrant[]) {
  const member = await memberOf(owner, businessId, user);
  return owner.ok(
    memberAccessSchema,
    "PUT",
    `/v1/business/${businessId}/access/members/${member.memberId}`,
    {
      body: { grants, expectedVersion: member.version },
    },
  );
}

describe("işletme içi yetki", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.stop());

  it("bölge kurulur, yeniden adlandırılır, şube taşınır ve silinir; başka işletmenin kaydı yok sayılır", async () => {
    const first = await createTenantFixture(app);
    const second = await createTenantFixture(app);
    const owner = as(app, first.owner);
    const root = `/v1/business/${first.businessId}/regions`;
    const region = await owner.ok(businessRegionSchema, "POST", root, {
      body: { name: "Marmara" },
    });
    expect(region).toMatchObject({ name: "Marmara", version: 1, branchIds: [] });
    await owner.fail("region_name_taken", "POST", root, { body: { name: "Marmara" } });

    const assign = `/v1/business/${first.businessId}/branches/${first.branchId}/region`;
    expect(
      await owner.ok(regionAssignment, "PUT", assign, {
        body: { regionId: region.id, expectedRegionId: null },
      }),
    ).toEqual({ branchId: first.branchId, regionId: region.id });
    // Başka cihazın eski görüntüsüyle yapılan taşıma, son durumu ezmez.
    await owner.fail("record_version_conflict", "PUT", assign, {
      body: { regionId: null, expectedRegionId: null },
    });
    expect((await owner.ok(businessRegionsSchema, "GET", root)).items).toContainEqual({
      ...region,
      branchIds: [first.branchId],
    });
    await owner.fail(
      "not_found",
      "PUT",
      `/v1/business/${first.businessId}/branches/${second.branchId}/region`,
      {
        body: { regionId: region.id, expectedRegionId: null },
      },
    );
    await owner.fail("record_version_conflict", "PUT", `${root}/${region.id}`, {
      body: { name: "Batı", expectedVersion: 7 },
    });
    const renamed = await owner.ok(businessRegionSchema, "PUT", `${root}/${region.id}`, {
      body: { name: "Batı", expectedVersion: 1 },
    });
    expect(renamed).toMatchObject({ name: "Batı", version: 2 });

    // Başka işletmenin kapsamında bu işletmenin bölge satırları görünmez.
    expect(
      await scoped(app.db, second.businessId, (tx) =>
        tx.many(
          sql`select * from business_region_branches where business_id = ${first.businessId}`,
        ),
      ),
    ).toEqual([]);

    await owner.fail("record_version_conflict", "POST", `${root}/${region.id}/delete`, {
      body: { expectedVersion: 1 },
    });
    await owner.done("POST", `${root}/${region.id}/delete`, { body: { expectedVersion: 2 } });
    expect((await owner.ok(businessRegionsSchema, "GET", root)).items).toEqual([]);
  });

  it("personel izni olmayan şubede hiçbir siparişi, raporu ve şube bilgisini görmez", async () => {
    const fixture = await createOrderingFixture(app);
    const owner = as(app, fixture.owner);
    const staff = await addStaff(app, fixture, "Garson");
    const member = as(app, staff);
    const base = `/v1/business/${fixture.businessId}`;
    const second = await app.services.businessManagement.saveBranch(fixture.scope, {
      name: "Kadıköy",
      timezone: "Europe/Istanbul",
      address: null,
      active: true,
    });

    expect((await member.ok(orderList, "GET", `${base}/orders`)).items).toEqual([]);
    await member.fail("not_found", "GET", `${base}/orders/${fixture.order.id}`);
    expect(
      (await member.ok(branchPerformanceSchema, "GET", `${base}/orders/performance`)).items,
    ).toEqual([]);
    expect((await member.ok(branchList, "GET", `${base}/branches`)).items).toEqual([]);
    await member.fail("forbidden", "GET", `${base}/branches/${fixture.branchId}/hours`);
    expect(await member.ok(myBusinessAccessSchema, "GET", `${base}/access/me`)).toEqual({
      role: "staff",
      permissions: [],
    });

    // Yalnız ikinci şubeye izin: birinci şubenin siparişi yine görünmez.
    await setGrants(owner, fixture.businessId, staff, [
      { permission: "orders.view", scope: { kind: "branch", branchId: second.id } },
    ]);
    expect((await member.ok(orderList, "GET", `${base}/orders`)).items).toEqual([]);
    expect((await member.ok(branchList, "GET", `${base}/branches`)).items.map((b) => b.id)).toEqual(
      [second.id],
    );

    await setGrants(owner, fixture.businessId, staff, [
      { permission: "orders.view", scope: { kind: "branch", branchId: fixture.branchId } },
    ]);
    expect((await member.ok(orderList, "GET", `${base}/orders`)).items.map((o) => o.id)).toEqual([
      fixture.order.id,
    ]);
    expect((await member.ok(orderSchema, "GET", `${base}/orders/${fixture.order.id}`)).id).toBe(
      fixture.order.id,
    );
    expect(
      (await member.ok(branchHoursBodySchema, "GET", `${base}/branches/${fixture.branchId}/hours`))
        .hours,
    ).toEqual([]);
    await member.fail("forbidden", "GET", `${base}/branches/${second.id}/hours`);
    // Sipariş görmek rapor iznini içermez.
    expect(
      (await member.ok(branchPerformanceSchema, "GET", `${base}/orders/performance`)).items,
    ).toEqual([]);
    expect(await member.ok(myBusinessAccessSchema, "GET", `${base}/access/me`)).toEqual({
      role: "staff",
      permissions: [{ permission: "orders.view", branchIds: [fixture.branchId] }],
    });
  });

  it("sipariş görme tahsilat açmaz, işleme izni açar; iptal yalnız sahip ve yöneticidedir", async () => {
    const fixture = await createOrderingFixture(app);
    const owner = as(app, fixture.owner);
    const staff = await addStaff(app, fixture, "Kasiyer");
    const member = as(app, staff);
    const order = `/v1/business/${fixture.businessId}/orders/${fixture.order.id}`;
    const payment = { expectedPaymentVersion: 0, place: "counter", method: "cash" };

    await setGrants(owner, fixture.businessId, staff, [
      { permission: "orders.view", scope: { kind: "business" } },
    ]);
    await member.fail("not_found", "POST", `${order}/payment`, { body: payment });

    const saved = await setGrants(owner, fixture.businessId, staff, [
      { permission: "orders.manage", scope: { kind: "business" } },
    ]);
    // İşleme izni görmeyi de içerir; sunucu tek biçimde saklar.
    expect(saved.grants.map((grant) => grant.permission)).toEqual(["orders.manage", "orders.view"]);
    await member.fail("order_state_invalid", "POST", `${order}/payment`, { body: payment });
    await member.fail("forbidden", "PUT", `${order}/status`, {
      body: { status: "cancelled", expectedVersion: fixture.order.version },
    });
  });

  it("bölge izni şubenin o anki bölgesine göre çözülür; şube taşınınca erişim düşer", async () => {
    const fixture = await createOrderingFixture(app);
    const owner = as(app, fixture.owner);
    const staff = await addStaff(app, fixture, "Bölge sorumlusu");
    const member = as(app, staff);
    const base = `/v1/business/${fixture.businessId}`;
    const south = await owner.ok(businessRegionSchema, "POST", `${base}/regions`, {
      body: { name: "Güney" },
    });
    const north = await owner.ok(businessRegionSchema, "POST", `${base}/regions`, {
      body: { name: "Kuzey" },
    });
    const assign = `${base}/branches/${fixture.branchId}/region`;
    await owner.ok(regionAssignment, "PUT", assign, {
      body: { regionId: south.id, expectedRegionId: null },
    });

    await setGrants(owner, fixture.businessId, staff, [
      { permission: "reports.view", scope: { kind: "region", regionId: south.id } },
      { permission: "orders.view", scope: { kind: "region", regionId: south.id } },
    ]);
    expect((await member.ok(orderList, "GET", `${base}/orders`)).items).toHaveLength(1);
    expect(
      (
        await member.ok(branchPerformanceSchema, "GET", `${base}/orders/performance?days=30`)
      ).items.map((item) => item.branchId),
    ).toEqual([fixture.branchId]);

    await owner.ok(regionAssignment, "PUT", assign, {
      body: { regionId: north.id, expectedRegionId: south.id },
    });
    expect((await member.ok(orderList, "GET", `${base}/orders`)).items).toEqual([]);
    expect(
      (await member.ok(branchPerformanceSchema, "GET", `${base}/orders/performance`)).items,
    ).toEqual([]);

    // Bölge silinince ona verilmiş izinler de kalkar.
    await owner.done("POST", `${base}/regions/${south.id}/delete`, {
      body: { expectedVersion: 1 },
    });
    expect((await memberOf(owner, fixture.businessId, staff)).grants).toEqual([]);
  });

  it("izinleri yalnız sahip değiştirir; yönetici görür; sahip, yönetici ve pasif üyeye izin verilmez", async () => {
    const fixture = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const staff = await addStaff(app, fixture, "Personel");
    const managerUser = await createUser(app, "Yönetici");
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: managerUser.id,
      role: "manager",
      active: true,
    });
    const manager = as(app, managerUser);
    const base = `/v1/business/${fixture.businessId}/access/members`;
    const target = await memberOf(owner, fixture.businessId, staff);
    const body = {
      grants: [{ permission: "orders.view", scope: { kind: "business" } }],
      expectedVersion: target.version,
    };

    expect(
      (await manager.ok(memberAccessListSchema, "GET", base)).items.length,
    ).toBeGreaterThanOrEqual(3);
    await manager.fail("forbidden", "PUT", `${base}/${target.memberId}`, { body });
    await as(app, staff).fail("forbidden", "GET", base);
    await owner.fail("record_version_conflict", "PUT", `${base}/${target.memberId}`, {
      body: { ...body, expectedVersion: target.version + 5 },
    });
    await owner.fail("not_found", "PUT", `${base}/${target.memberId}`, {
      body: {
        ...body,
        grants: [
          {
            permission: "orders.view",
            scope: { kind: "branch", branchId: "3a3344da-d7bc-4764-ab2b-f22961d67e68" },
          },
        ],
      },
    });
    const managerMember = await memberOf(owner, fixture.businessId, managerUser);
    await owner.fail("validation_failed", "PUT", `${base}/${managerMember.memberId}`, {
      body: { ...body, expectedVersion: managerMember.version },
    });
    expect(
      await manager.ok(
        myBusinessAccessSchema,
        "GET",
        `/v1/business/${fixture.businessId}/access/me`,
      ),
    ).toMatchObject({
      role: "manager",
    });
    expect(
      (
        await manager.ok(
          myBusinessAccessSchema,
          "GET",
          `/v1/business/${fixture.businessId}/access/me`,
        )
      ).permissions,
    ).toContainEqual({ permission: "orders.manage", branchIds: null });

    const saved = await owner.ok(memberAccessSchema, "PUT", `${base}/${target.memberId}`, { body });
    expect(saved.version).toBe(target.version + 1);
    const audit = await app.db.many<{ action: string }>(sql`
      select action from audit_log where target_id = ${target.memberId} order by id
    `);
    expect(audit.map((row) => row.action)).toContain("business.member_access_changed");
  });

  it("üyelik kapanınca ya da rol değişince izinler silinir; yeniden açılmak geri getirmez", async () => {
    const fixture = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const staff = await addStaff(app, fixture, "Geçici personel");
    await setGrants(owner, fixture.businessId, staff, [
      { permission: "catalog.availability", scope: { kind: "branch", branchId: fixture.branchId } },
    ]);
    for (const change of [
      { role: "staff", active: false },
      { role: "staff", active: true },
    ] as const)
      await app.services.businessManagement.setMember(fixture.scope, {
        userId: staff.id,
        ...change,
      });
    expect((await memberOf(owner, fixture.businessId, staff)).grants).toEqual([]);

    await setGrants(owner, fixture.businessId, staff, [
      { permission: "orders.view", scope: { kind: "business" } },
    ]);
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: staff.id,
      role: "manager",
      active: true,
    });
    expect((await memberOf(owner, fixture.businessId, staff)).grants).toEqual([]);
  });

  it("veritabanı da kuralı uygular: izin yalnız etkin personele, değiştirilemez, işletmeler arası görünmez", async () => {
    const fixture = await createTenantFixture(app);
    const other = await createTenantFixture(app);
    const staff = await addStaff(app, fixture, "SQL personeli");
    const owner = as(app, fixture.owner);
    await setGrants(owner, fixture.businessId, staff, [
      { permission: "orders.view", scope: { kind: "business" } },
    ]);
    const ownerMember = await scoped(app.db, fixture.businessId, (tx) =>
      tx.one<{ id: string }>(sql`
        select id from business_members where business_id = ${fixture.businessId} and role = 'owner'
      `),
    );
    await expect(
      scoped(app.db, fixture.businessId, (tx) =>
        tx.execute(sql`
          insert into business_member_grants (business_id, member_id, permission, granted_by)
          values (${fixture.businessId}, ${ownerMember.id}, 'orders.view', ${fixture.owner.id})
        `),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      scoped(app.db, fixture.businessId, (tx) =>
        tx.execute(sql`update business_member_grants set permission = 'reports.view'
          where business_id = ${fixture.businessId}`),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      await scoped(app.db, other.businessId, (tx) =>
        tx.many(
          sql`select * from business_member_grants where business_id = ${fixture.businessId}`,
        ),
      ),
    ).toEqual([]);
  });

  it("personel canlı olay bileti alabilir; işletme dışı kişi alamaz", async () => {
    const fixture = await createTenantFixture(app);
    const staff = await addStaff(app, fixture, "Canlı personel");
    const outsider = await createUser(app, "Dışarıdan");
    const ticket = `/v1/business/${fixture.businessId}/socket-ticket`;
    const ticketSchema = z.object({
      ticket: z.string(),
      expiresAt: z.string(),
      socketUrl: z.string(),
    });
    await as(app, staff).ok(ticketSchema, "POST", ticket, { body: {} });
    await as(app, outsider).fail("forbidden", "POST", ticket, { body: {} });
  });
});

describe("personel daveti", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.stop());

  it("yalnız davetteki telefona, bir kez ve seçilen izinlerle uygulanır", async () => {
    const fixture = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const recipient = await createUser(app, "Davetli");
    const stranger = await createUser(app, "Yanlış kişi");
    const person = as(app, recipient);
    const path = `/v1/business/${fixture.businessId}/invitations`;
    const body = {
      phone: recipient.phone,
      grants: [
        { permission: "orders.manage", scope: { kind: "branch", branchId: fixture.branchId } },
      ],
    };
    await person.fail("forbidden", "POST", path, { body });
    const created = await owner.ok(staffInvitationCreatedSchema, "POST", path, { body });
    expect(created.invitation).toMatchObject({ status: "pending" });
    expect(created.invitation.grants.map((grant) => grant.permission)).toEqual([
      "orders.manage",
      "orders.view",
    ]);
    const list = await owner.ok(staffInvitationsSchema, "GET", path);
    expect(JSON.stringify(list)).not.toContain(created.token);

    const preview = "/v1/business/invitations/preview";
    const accept = "/v1/business/invitations/accept";
    await as(app, stranger).fail("not_found", "POST", preview, { body: { token: created.token } });
    await as(app, stranger).fail("not_found", "POST", accept, { body: { token: created.token } });
    expect(
      await person.ok(staffInvitationPreviewSchema, "POST", preview, {
        body: { token: created.token },
      }),
    ).toMatchObject({
      businessName: "Kapsam işletmesi",
      grants: [
        {
          permission: "orders.manage",
          scope: { kind: "branch", branchId: fixture.branchId },
          scopeName: "Merkez",
        },
        {
          permission: "orders.view",
          scope: { kind: "branch", branchId: fixture.branchId },
          scopeName: "Merkez",
        },
      ],
    });
    expect(
      await person.ok(staffInvitationAcceptedSchema, "POST", accept, {
        body: { token: created.token },
      }),
    ).toEqual({
      businessId: fixture.businessId,
    });
    await person.fail("not_found", "POST", accept, { body: { token: created.token } });
    expect(
      await person.ok(
        myBusinessAccessSchema,
        "GET",
        `/v1/business/${fixture.businessId}/access/me`,
      ),
    ).toEqual({
      role: "staff",
      permissions: [
        { permission: "orders.manage", branchIds: [fixture.branchId] },
        { permission: "orders.view", branchIds: [fixture.branchId] },
      ],
    });
    // Etkin üyeye yeni davet açılmaz.
    await owner.fail("already_member", "POST", path, { body });
  });

  it("iptal edilmiş, süresi dolmuş ve başka işletmenin şubesini içeren davet reddedilir", async () => {
    const fixture = await createTenantFixture(app);
    const other = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const recipient = await createUser(app, "İptal edilen");
    const person = as(app, recipient);
    const path = `/v1/business/${fixture.businessId}/invitations`;
    const body = {
      phone: recipient.phone,
      grants: [{ permission: "orders.view", scope: { kind: "business" } }],
    };
    await owner.fail("not_found", "POST", path, {
      body: {
        ...body,
        grants: [
          { permission: "orders.view", scope: { kind: "branch", branchId: other.branchId } },
        ],
      },
    });
    const revoked = await owner.ok(staffInvitationCreatedSchema, "POST", path, { body });
    await owner.done("POST", `${path}/${revoked.invitation.id}/revoke`, { body: {} });
    await person.fail("not_found", "POST", "/v1/business/invitations/accept", {
      body: { token: revoked.token },
    });

    const expired = await owner.ok(staffInvitationCreatedSchema, "POST", path, { body });
    await scoped(app.migrationDb, fixture.businessId, (tx) =>
      tx.execute(sql`
      update business_staff_invitations set expires_at = now() - interval '1 minute', created_at = now() - interval '2 minutes'
      where id = ${expired.invitation.id}
    `),
    );
    await person.fail("not_found", "POST", "/v1/business/invitations/accept", {
      body: { token: expired.token },
    });
    expect(
      (await owner.ok(staffInvitationsSchema, "GET", path)).items.map((item) => item.status).sort(),
    ).toEqual(["expired", "revoked"]);
  });
});
