import { randomUUID } from "node:crypto";

import {
  accessibleBranchesSchema,
  branchAvailabilityBatchResultSchema,
  branchHoursBodySchema,
  branchSchema,
  businessRegionBranchesSchema,
  businessRegionBranchSchema,
  businessRegionOperatorSchema,
  businessRegionOperatorsSchema,
  businessRegionSchema,
  businessRegionsSchema,
  catalogItemBodySchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

describe("İşletme bölgesi ve yetki kapsamı", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("bölgeye şube atanır ve başka işletmenin şubesi veya bölgesi reddedilir", async () => {
    const first = await createTenantFixture(app);
    const second = await createTenantFixture(app);
    const owner = as(app, first.owner);
    const root = `/v1/business/${first.businessId}/regions`;
    const region = await owner.ok(businessRegionSchema, "POST", root, {
      body: { name: "Marmara" },
    });
    expect(region).toEqual({ id: expect.any(String), name: "Marmara", version: 1 });
    await owner.fail("validation_failed", "POST", root, { body: { name: "Marmara" } });
    expect((await owner.ok(businessRegionsSchema, "GET", root)).items).toContainEqual(region);
    const endpoint = `${root}/branches/${first.branchId}`;
    expect(
      await owner.ok(businessRegionBranchSchema, "PUT", endpoint, {
        body: { regionId: region.id, expectedRegionId: null },
      }),
    ).toEqual({
      branchId: first.branchId,
      regionId: region.id,
    });
    await owner.fail("record_version_conflict", "PUT", endpoint, {
      body: { regionId: null, expectedRegionId: null },
    });
    expect(
      (await owner.ok(businessRegionBranchesSchema, "GET", `${root}/branches`)).items,
    ).toContainEqual({ branchId: first.branchId, regionId: region.id });
    await owner.fail("not_found", "PUT", `${root}/branches/${second.branchId}`, {
      body: { regionId: region.id, expectedRegionId: null },
    });
    await owner.fail("not_found", "PUT", endpoint, {
      body: { regionId: randomUUID(), expectedRegionId: region.id },
    });
    await owner.fail("record_version_conflict", "PUT", `${root}/${region.id}`, {
      body: { name: "Batı", expectedVersion: 8 },
    });
    expect(
      (
        await owner.ok(businessRegionSchema, "PUT", `${root}/${region.id}`, {
          body: { name: "Batı", expectedVersion: 1 },
        })
      ).version,
    ).toBe(2);
    expect(
      await scoped(app.db, second.businessId, (tx) =>
        tx.many(sql`
      select * from business_region_branches where business_id=${first.businessId}
    `),
      ),
    ).toEqual([]);
  });

  it("bölge görevlisi yalnız kendi şubesini açıp kapatır; taşımada erişim kaybolur", async () => {
    const fixture = await createTenantFixture(app);
    const other = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const staff = await createUser(app, "Bölge sorumlusu");
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    const secondBranch = await app.services.businessManagement.saveBranch(fixture.scope, {
      name: "İkinci Şube",
      timezone: "Europe/Istanbul",
      address: "",
      active: true,
    });
    const root = `/v1/business/${fixture.businessId}/regions`;
    const region = await owner.ok(businessRegionSchema, "POST", root, { body: { name: "Güney" } });
    const otherRegion = await owner.ok(businessRegionSchema, "POST", root, {
      body: { name: "Kuzey" },
    });
    await owner.ok(businessRegionBranchSchema, "PUT", `${root}/branches/${fixture.branchId}`, {
      body: { regionId: region.id, expectedRegionId: null },
    });
    const staffClient = as(app, staff);
    const access = `/v1/business/${fixture.businessId}/branches/availability-access/me`;
    expect((await staffClient.ok(accessibleBranchesSchema, "GET", access)).items).toEqual([]);
    await staffClient.fail("forbidden", "POST", root, { body: { name: "Yetkisiz" } });
    await staffClient.fail("forbidden", "PUT", `${root}/${region.id}/operators`, {
      body: { userId: staff.id, allowed: true },
    });
    const operators = `${root}/${region.id}/operators`;
    expect((await owner.ok(businessRegionOperatorsSchema, "GET", operators)).items).toContainEqual(
      expect.objectContaining({ userId: staff.id, allowed: false }),
    );
    expect(
      (
        await owner.ok(
          businessRegionOperatorSchema.pick({ userId: true, allowed: true }),
          "PUT",
          operators,
          { body: { userId: staff.id, allowed: true } },
        )
      ).allowed,
    ).toBe(true);
    expect((await staffClient.ok(accessibleBranchesSchema, "GET", access)).items).toEqual([
      fixture.branchId,
    ]);
    await staffClient.fail("forbidden", "GET", `${root}/branches`);
    const visibleBranches = await staffClient.ok(
      z.object({ items: z.array(branchSchema) }),
      "GET",
      `/v1/business/${fixture.businessId}/branches`,
    );
    expect(visibleBranches.items.map((branch) => branch.id)).toEqual([fixture.branchId]);
    await staffClient.fail(
      "forbidden",
      "GET",
      `/v1/business/${fixture.businessId}/branches/${secondBranch.id}/hours`,
    );
    expect(
      (
        await staffClient.ok(
          branchHoursBodySchema,
          "GET",
          `/v1/business/${fixture.businessId}/branches/${fixture.branchId}/hours`,
        )
      ).hours,
    ).toEqual([]);
    const item = await app.services.catalog.saveItem(
      fixture.scope,
      catalogItemBodySchema.parse({
        name: "Pilav",
        price: { amountMinor: 1000, vatBasisPoints: 1000 },
      }),
    );
    const batch = `/v1/business/${fixture.businessId}/branches/availability-batch`;
    expect(
      await staffClient.ok(branchAvailabilityBatchResultSchema, "PUT", batch, {
        body: {
          branchId: fixture.branchId,
          changes: [{ itemId: item.id, expectedVersion: 0, available: false }],
        },
      }),
    ).toEqual({ updated: 1 });
    await staffClient.fail("forbidden", "PUT", batch, {
      body: {
        branchId: secondBranch.id,
        changes: [{ itemId: item.id, expectedVersion: 0, available: false }],
      },
    });
    await staffClient.fail("not_found", "PUT", batch, {
      body: {
        branchId: other.branchId,
        changes: [{ itemId: item.id, expectedVersion: 0, available: false }],
      },
    });
    await staffClient.fail(
      "forbidden",
      "PUT",
      `/v1/business/${fixture.businessId}/catalog/branch-prices`,
      { body: { branchId: fixture.branchId, changes: [] } },
    );
    await owner.ok(businessRegionBranchSchema, "PUT", `${root}/branches/${fixture.branchId}`, {
      body: { regionId: otherRegion.id, expectedRegionId: region.id },
    });
    expect((await staffClient.ok(accessibleBranchesSchema, "GET", access)).items).toEqual([]);
    await staffClient.fail("forbidden", "PUT", batch, {
      body: {
        branchId: fixture.branchId,
        changes: [{ itemId: item.id, expectedVersion: 1, available: true }],
      },
    });
    await owner.ok(businessRegionBranchSchema, "PUT", `${root}/branches/${fixture.branchId}`, {
      body: { regionId: region.id, expectedRegionId: otherRegion.id },
    });
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: staff.id,
      role: "staff",
      active: false,
    });
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    expect((await staffClient.ok(accessibleBranchesSchema, "GET", access)).items).toEqual([]);
  });
});
