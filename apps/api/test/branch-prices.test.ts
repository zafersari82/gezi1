import { randomUUID } from "node:crypto";

import {
  branchPriceBatchResultSchema,
  catalogItemBodySchema,
  catalogSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture } from "./support/tenant-fixture";

describe("Çok şubeli işletmede toplu fiyat yönetimi", () => {
  let app: TestApp;
  beforeAll(async () => { app = await startTestApp(); });
  afterAll(async () => { await app.stop(); });

  it("tek işlemde iki şube fiyatını günceller, kaldırınca genel fiyata döner", async () => {
    const f = await createTenantFixture(app);
    const [a, b] = await Promise.all([
      app.services.catalog.saveItem(f.scope, catalogItemBodySchema.parse({
        name: "Pilav", price: { amountMinor: 10000, vatBasisPoints: 1000 },
      })),
      app.services.catalog.saveItem(f.scope, catalogItemBodySchema.parse({
        name: "Ayran", price: { amountMinor: 2000, vatBasisPoints: 1000 },
      })),
    ]);
    const url = `/v1/business/${f.businessId}/catalog/branch-prices`;
    const owner = as(app, f.owner);
    expect(await owner.ok(branchPriceBatchResultSchema, "PUT", url, { body: {
      branchId: f.branchId, changes: [
        { itemId: a.id, expected: null, next: { amountMinor: 12000, vatBasisPoints: 1000 } },
        { itemId: b.id, expected: null, next: { amountMinor: 2500, vatBasisPoints: 2000 } },
      ],
    } })).toEqual({ updated: 2 });
    let catalog = await owner.ok(catalogSchema, "GET", `/v1/business/${f.businessId}/catalog`);
    expect(catalog.prices.filter((p) => p.branchId === f.branchId)).toHaveLength(2);
    expect(catalog.prices.filter((p) => p.branchId === null)).toHaveLength(2);
    await owner.ok(branchPriceBatchResultSchema, "PUT", url, { body: {
      branchId: f.branchId, changes: [{ itemId: a.id,
        expected: { amountMinor: 12000, vatBasisPoints: 1000 }, next: null }],
    } });
    catalog = await owner.ok(catalogSchema, "GET", `/v1/business/${f.businessId}/catalog`);
    expect(catalog.prices.find((p) => p.itemId === a.id && p.branchId === f.branchId)).toBeUndefined();
    expect(catalog.prices.find((p) => p.itemId === a.id && p.branchId === null)?.amountMinor).toBe(10000);
  });

  it("eski şube fiyatı gönderilirse bütün toplu işlem geri alınır", async () => {
    const f = await createTenantFixture(app);
    const a = await app.services.catalog.saveItem(f.scope, catalogItemBodySchema.parse({
      name: "Pilav", price: { amountMinor: 10000, vatBasisPoints: 1000 },
    }));
    const b = await app.services.catalog.saveItem(f.scope, catalogItemBodySchema.parse({
      name: "Su", price: { amountMinor: 1000, vatBasisPoints: 1000 },
    }));
    const url = `/v1/business/${f.businessId}/catalog/branch-prices`;
    await app.services.catalog.savePrice(f.scope, b.id, {
      branchId: f.branchId, amountMinor: 1500, vatBasisPoints: 1000,
    });
    await as(app, f.owner).fail("record_version_conflict", "PUT", url, { body: {
      branchId: f.branchId, changes: [
        { itemId: a.id, expected: null, next: { amountMinor: 12000, vatBasisPoints: 1000 } },
        { itemId: b.id, expected: null, next: { amountMinor: 2200, vatBasisPoints: 1000 } },
      ],
    } });
    const catalog = await app.services.catalog.get(f.scope);
    expect(catalog.prices.find((p) => p.itemId === a.id && p.branchId === f.branchId)).toBeUndefined();
    expect(catalog.prices.find((p) => p.itemId === b.id && p.branchId === f.branchId)?.amountMinor).toBe(1500);
  });

  it("personel, yabancı işletme ve yabancı ürün kabul edilmez", async () => {
    const f = await createTenantFixture(app);
    const other = await createTenantFixture(app);
    const staff = await createUser(app, "Çalışan");
    await app.services.businessManagement.setMember(f.scope, { userId: staff.id, role: "staff", active: true });
    const foreignItem = await app.services.catalog.saveItem(other.scope, catalogItemBodySchema.parse({
      name: "Başka işletmenin ürünü", price: { amountMinor: 1000, vatBasisPoints: 1000 },
    }));
    const body = { branchId: f.branchId, changes: [{
      itemId: foreignItem.id, expected: null, next: { amountMinor: 1200, vatBasisPoints: 1000 },
    }] };
    const url = `/v1/business/${f.businessId}/catalog/branch-prices`;
    await as(app, staff).fail("forbidden", "PUT", url, { body });
    await as(app, await createUser(app, "Yabancı")).fail("forbidden", "PUT", url, { body });
    await as(app, f.owner).fail("not_found", "PUT", url, { body });
    await as(app, f.owner).fail("not_found", "PUT", url, { body: {
      ...body, branchId: other.branchId,
    } });
    await as(app, f.owner).fail("validation_failed", "PUT", url, { body: {
      ...body, changes: [body.changes[0], body.changes[0]],
    } });
    await as(app, f.owner).fail("not_found", "PUT", url, { body: {
      ...body, changes: [{ ...body.changes[0], itemId: randomUUID() }],
    } });
  });
});
