import { randomUUID } from "node:crypto";

import {
  type AccessGrant,
  branchAvailabilityBatchResultSchema,
  branchAvailabilityListSchema,
  catalogItemBodySchema,
  memberAccessListSchema,
  memberAccessSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

describe("Şube bazlı bulunurluk ve kısıtlı personel yetkisi", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("iki ürün tek seferde güncellenir ve eski sürüm yüzünden tüm işlem geri alınır", async () => {
    const f = await createTenantFixture(app);
    const a = await app.services.catalog.saveItem(
      f.scope,
      catalogItemBodySchema.parse({
        name: "Pilav",
        price: { amountMinor: 10000, vatBasisPoints: 1000 },
      }),
    );
    const b = await app.services.catalog.saveItem(
      f.scope,
      catalogItemBodySchema.parse({
        name: "Ayran",
        price: { amountMinor: 2500, vatBasisPoints: 1000 },
      }),
    );
    const url = `/v1/business/${f.businessId}/branches/availability-batch`;
    const read = `/v1/business/${f.businessId}/branches/${f.branchId}/availability`;
    const owner = as(app, f.owner);
    expect(
      await owner.ok(branchAvailabilityBatchResultSchema, "PUT", url, {
        body: {
          branchId: f.branchId,
          changes: [
            { itemId: a.id, expectedVersion: 0, available: false },
            { itemId: b.id, expectedVersion: 0, available: false },
          ],
        },
      }),
    ).toEqual({ updated: 2 });
    const current = await owner.ok(branchAvailabilityListSchema, "GET", read);
    expect(current.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: a.id, available: false, version: 1 }),
        expect.objectContaining({ itemId: b.id, available: false, version: 1 }),
      ]),
    );
    await owner.fail("settings_version_conflict", "PUT", url, {
      body: {
        branchId: f.branchId,
        changes: [
          { itemId: a.id, expectedVersion: 1, available: true },
          { itemId: b.id, expectedVersion: 0, available: true },
        ],
      },
    });
    const after = await owner.ok(branchAvailabilityListSchema, "GET", read);
    expect(after.items.find((i) => i.itemId === a.id)?.available).toBe(false);
    expect(after.items.find((i) => i.itemId === b.id)?.available).toBe(false);
    await owner.fail("validation_failed", "PUT", url, {
      body: {
        branchId: f.branchId,
        changes: [
          { itemId: a.id, expectedVersion: 1, available: true },
          { itemId: a.id, expectedVersion: 1, available: true },
        ],
      },
    });
  });

  it("bulunurluk izni olan personel yalnız izinli şubede ürün açıp kapatır, fiyat değiştiremez", async () => {
    const f = await createTenantFixture(app);
    const other = await createTenantFixture(app);
    const staff = await createUser(app, "Şube görevlisi");
    await app.services.businessManagement.setMember(f.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    const item = await app.services.catalog.saveItem(
      f.scope,
      catalogItemBodySchema.parse({
        name: "Ürün",
        price: { amountMinor: 1000, vatBasisPoints: 1000 },
      }),
    );
    const url = `/v1/business/${f.businessId}/branches/availability-batch`;
    const owner = as(app, f.owner);
    const staffClient = as(app, staff);
    const grant = async (grants: AccessGrant[]) => {
      const members = await owner.ok(
        memberAccessListSchema,
        "GET",
        `/v1/business/${f.businessId}/access/members`,
      );
      const member = members.items.find((row) => row.userId === staff.id);
      if (member === undefined) throw new Error("Personel bulunamadı");
      await owner.ok(
        memberAccessSchema,
        "PUT",
        `/v1/business/${f.businessId}/access/members/${member.memberId}`,
        { body: { grants, expectedVersion: member.version } },
      );
    };
    const body = {
      branchId: f.branchId,
      changes: [{ itemId: item.id, expectedVersion: 0, available: false }],
    };
    await staffClient.fail("forbidden", "PUT", url, { body });
    await staffClient.fail(
      "forbidden",
      "GET",
      `/v1/business/${f.businessId}/branches/${f.branchId}/availability`,
    );
    // Sipariş görme izni bulunurluk değiştirmeyi açmaz.
    await grant([{ permission: "orders.view", scope: { kind: "branch", branchId: f.branchId } }]);
    await staffClient.ok(
      branchAvailabilityListSchema,
      "GET",
      `/v1/business/${f.businessId}/branches/${f.branchId}/availability`,
    );
    await staffClient.fail("forbidden", "PUT", url, { body });

    await grant([
      { permission: "catalog.availability", scope: { kind: "branch", branchId: f.branchId } },
    ]);
    expect(await staffClient.ok(branchAvailabilityBatchResultSchema, "PUT", url, { body })).toEqual(
      { updated: 1 },
    );
    await staffClient.fail(
      "forbidden",
      "PUT",
      `/v1/business/${f.businessId}/catalog/branch-prices`,
      {
        body: {
          branchId: f.branchId,
          changes: [
            { itemId: item.id, expected: null, next: { amountMinor: 2500, vatBasisPoints: 1000 } },
          ],
        },
      },
    );
    await staffClient.fail("not_found", "PUT", url, {
      body: {
        branchId: f.branchId,
        changes: [{ itemId: randomUUID(), expectedVersion: 0, available: true }],
      },
    });
    await staffClient.fail("not_found", "PUT", url, {
      body: {
        branchId: other.branchId,
        changes: [{ itemId: item.id, expectedVersion: 1, available: true }],
      },
    });
    await grant([]);
    await staffClient.fail("forbidden", "PUT", url, {
      body: {
        branchId: f.branchId,
        changes: [{ itemId: item.id, expectedVersion: 1, available: true }],
      },
    });
  });

  it("başka işletmenin ürününü eklemek işlemin tamamını reddeder; veri RLS ile gizlidir", async () => {
    const f = await createTenantFixture(app);
    const other = await createTenantFixture(app);
    const local = await app.services.catalog.saveItem(
      f.scope,
      catalogItemBodySchema.parse({
        name: "Yerel",
        price: { amountMinor: 1000, vatBasisPoints: 1000 },
      }),
    );
    const foreign = await app.services.catalog.saveItem(
      other.scope,
      catalogItemBodySchema.parse({
        name: "Yabancı",
        price: { amountMinor: 1000, vatBasisPoints: 1000 },
      }),
    );
    await as(app, f.owner).fail(
      "not_found",
      "PUT",
      `/v1/business/${f.businessId}/branches/availability-batch`,
      {
        body: {
          branchId: f.branchId,
          changes: [
            { itemId: local.id, expectedVersion: 0, available: false },
            { itemId: foreign.id, expectedVersion: 0, available: false },
          ],
        },
      },
    );
    expect(
      await scoped(app.db, f.businessId, (tx) =>
        tx.many(sql`
      select * from catalog_branch_availability where business_id=${f.businessId} and item_id=${local.id}`),
      ),
    ).toEqual([]);
    expect(await app.db.many(sql`select * from business_member_grants`)).toEqual([]);
    const flag = await app.migrationDb.one<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(sql`
      select relrowsecurity,relforcerowsecurity from pg_class where relname='business_member_grants'`);
    expect(flag).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });
});
