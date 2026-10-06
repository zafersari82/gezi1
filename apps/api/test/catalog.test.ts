import { randomUUID } from "node:crypto";

import { catalogItemBodySchema, catalogOptionGroupBodySchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { withTenant } from "../src/core/tenant-scope";
import { createCatalogFixture } from "./support/catalog-fixture";
import { as, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

describe("İşletmenin ortak kataloğu", () => {
  test("ürün, seçenek grubu ve şube fiyatı sözleşmeyle kaydedilir", async () => {
    const f = await createTenantFixture(app);
    const base = `/v1/business/${f.businessId}/catalog`;
    const category = await as(app, f.owner).request("POST", `${base}/categories`, {
      body: { name: "Ürünler" },
    });
    expect(category).toMatchObject({ status: 200, body: { name: "Ürünler" } });
    const categoryId = (category.body as { id: string }).id;
    const item = await as(app, f.owner).request("POST", `${base}/items`, {
      body: { name: "Örnek ürün", categoryId, price: { amountMinor: 10000, vatBasisPoints: 1000 } },
    });
    expect(item).toMatchObject({ status: 200, body: { name: "Örnek ürün" } });
    const itemId = (item.body as { id: string }).id;
    const group = await as(app, f.owner).request("POST", `${base}/option-groups`, {
      body: {
        name: "Ekstra",
        minSelected: 0,
        maxSelected: 1,
        options: [{ name: "Ek ürün", priceDeltaMinor: 2500 }],
      },
    });
    expect(group.status).toBe(200);
    const groupId = (group.body as { id: string }).id;
    await as(app, f.owner).done("PUT", `${base}/items/${itemId}/option-groups`, {
      body: { groupIds: [groupId] },
    });
    await as(app, f.owner).done("PUT", `${base}/items/${itemId}/prices`, {
      body: { branchId: f.branchId, amountMinor: 11000, vatBasisPoints: 2000 },
    });
    const read = await as(app, f.owner).request("GET", base);
    expect(read).toMatchObject({
      status: 200,
      body: { items: [{ id: itemId, optionGroupIds: [groupId] }] },
    });
  });

  test("kapsamsız katalog yoktur; tutar kesirli veya negatif olamaz", async () => {
    expect(await app.db.many(sql`select * from catalog_items`)).toEqual([]);
    const f = await createTenantFixture(app);
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`
      insert into prices(business_id, item_id, amount_minor, vat_basis_points)
      values (${f.businessId}, ${randomUUID()}, -1, 2000)
    `),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const response = await as(app, f.owner).request(
      "POST",
      `/v1/business/${f.businessId}/catalog/items`,
      {
        body: { name: "Kesirli", price: { amountMinor: 1.5, vatBasisPoints: 2000 } },
      },
    );
    expect(response).toMatchObject({ status: 400, body: { error: { code: "validation_failed" } } });
  });

  test("seçenekler fiyata katılır; KDV satırda yuvarlanır ve şube fiyatı önceliklidir", async () => {
    const f = await createTenantFixture(app);
    const item = await app.services.catalog.saveItem(
      f.scope,
      catalogItemBodySchema.parse({
        name: "Ürün",
        price: { amountMinor: 10000, vatBasisPoints: 1000 },
      }),
    );
    const group = await app.services.catalog.saveOptionGroup(
      f.scope,
      catalogOptionGroupBodySchema.parse({
        name: "Zorunlu seçim",
        minSelected: 1,
        maxSelected: 1,
        options: [{ name: "Ekstra", priceDeltaMinor: 2500 }],
      }),
    );
    const option = group.options[0];
    expect(option).toBeDefined();
    if (option === undefined) throw new Error("Sınama seçeneği oluşmadı");
    await app.services.catalog.setOptionGroups(f.scope, item.id, [group.id]);
    const url = `/v1/business/${f.businessId}/catalog/quote`;
    const body = {
      branchId: f.branchId,
      lines: [{ itemId: item.id, quantity: 2, optionIds: [option.id] }],
    };
    expect(await as(app, f.owner).request("POST", url, { body })).toMatchObject({
      status: 200,
      body: {
        totalMinor: 25000,
        vatMinor: 2273,
        lines: [{ available: true, unitPriceMinor: 12500, totalMinor: 25000, vatMinor: 2273 }],
      },
    });
    await app.services.catalog.savePrice(f.scope, item.id, {
      branchId: f.branchId,
      amountMinor: 11000,
      vatBasisPoints: 2000,
    });
    expect(await as(app, f.owner).request("POST", url, { body })).toMatchObject({
      status: 200,
      body: {
        totalMinor: 27000,
        vatMinor: 4500,
      },
    });
    expect(
      await as(app, f.owner).request("POST", url, {
        body: { ...body, lines: [{ itemId: item.id, quantity: 1, optionIds: [] }] },
      }),
    ).toMatchObject({ status: 200, body: { lines: [{ available: false }] } });
  });

  test("fiyat görüntüsü okunurken yeni şube fiyatı doğrudan SQL ile araya giremez", async () => {
    const f = await createCatalogFixture(app);
    let announce: () => void = () => undefined;
    let release: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      announce = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const quote = withTenant(app.db, f.scope, async (tx) => {
      await app.services.catalog.quote(tx, f.scope, f.branchId, [
        { itemId: f.itemId, quantity: 1, optionIds: [] },
      ]);
      announce();
      await gate;
    });
    await ready;
    let changed = false;
    const change = scoped(app.db, f.businessId, (tx) =>
      tx.execute(sql`
      insert into prices(business_id, item_id, branch_id, amount_minor, vat_basis_points)
      values (${f.businessId}, ${f.itemId}, ${f.branchId}, 15000, 1000)
    `),
    ).then(() => {
      changed = true;
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(changed).toBe(false);
    } finally {
      release();
      await Promise.all([quote, change]);
    }
  });
});
