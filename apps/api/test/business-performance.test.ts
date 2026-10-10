import { randomUUID } from "node:crypto";

import {
  branchPerformanceSchema,
  businessMembershipSchema,
  businessRegionBranchSchema,
  businessRegionSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createOrderingFixture } from "./support/ordering-fixture";
import { createTenantFixture } from "./support/tenant-fixture";

const roster = z.object({ items: z.array(businessMembershipSchema) });

describe("İşletme performansı: şube ve bölge kapsamı", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("verilmeyen izin, başka şirket ve bölge taşıma rapora veri sızdırmaz", async () => {
    const fixture = await createOrderingFixture(app);
    const other = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const staff = await createUser(app, "Rapor personeli");
    const member = as(app, staff);
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    const path = `/v1/business/${fixture.businessId}/orders/performance`;
    const grants = `/v1/business/${fixture.businessId}/branches/${fixture.branchId}/order-grants`;
    const regions = `/v1/business/${fixture.businessId}/regions`;
    const ownerReport = await owner.ok(branchPerformanceSchema, "GET", `${path}?days=7`);
    expect(ownerReport.days).toBe(7);
    expect(
      ownerReport.items.find((item) => item.branchId === fixture.branchId)?.orderCount,
    ).toBeGreaterThan(0);
    expect((await member.ok(branchPerformanceSchema, "GET", path)).items).toEqual([]);
    await member.fail("forbidden", "GET", `/v1/business/${other.businessId}/orders/performance`);
    await owner.ok(z.object({ userId: z.string(), access: z.string() }), "PUT", grants, {
      body: { userId: staff.id, access: "view" },
    });
    expect(
      (await member.ok(branchPerformanceSchema, "GET", `${path}?days=30`)).items.some(
        (item) => item.branchId === fixture.branchId,
      ),
    ).toBe(true);
    await owner.ok(z.object({ userId: z.string(), access: z.string() }), "PUT", grants, {
      body: { userId: staff.id, access: "none" },
    });
    expect((await member.ok(branchPerformanceSchema, "GET", path)).items).toEqual([]);
    const region = await owner.ok(businessRegionSchema, "POST", regions, {
      body: { name: `Sorumlu-${randomUUID().slice(0, 6)}` },
    });
    await owner.ok(businessRegionBranchSchema, "PUT", `${regions}/branches/${fixture.branchId}`, {
      body: { regionId: region.id, expectedRegionId: null },
    });
    await owner.ok(
      z.object({ userId: z.string(), access: z.string() }),
      "PUT",
      `${regions}/${region.id}/order-grants`,
      { body: { userId: staff.id, access: "view" } },
    );
    expect((await member.ok(branchPerformanceSchema, "GET", path)).items.length).toBeGreaterThan(0);
    await owner.ok(businessRegionBranchSchema, "PUT", `${regions}/branches/${fixture.branchId}`, {
      body: { regionId: null, expectedRegionId: region.id },
    });
    expect((await member.ok(branchPerformanceSchema, "GET", path)).items).toEqual([]);
    await member.fail("validation_failed", "GET", `${path}?days=365`);
  });

  it("ekip yönetiminde işletme sahibi yetkili, personel yetkisiz ve iptal edilen üyelik erişimsiz kalır", async () => {
    const fixture = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const staff = await createUser(app, "Üye personel");
    const person = as(app, staff);
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    const path = `/v1/business/${fixture.businessId}/members`;
    const listing = await owner.ok(roster, "GET", path);
    expect(listing.items.find((row) => row.userId === staff.id)?.displayName).toBeTruthy();
    await person.fail("forbidden", "GET", path);
    await person.fail("forbidden", "PUT", path, {
      body: { userId: staff.id, role: "manager", active: true },
    });
    await owner.done("PUT", path, { body: { userId: staff.id, role: "staff", active: false } });
    await person.fail("forbidden", "GET", `/v1/business/${fixture.businessId}/orders/performance`);
  });
});
