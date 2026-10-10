import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { createCatalogFixture } from "./support/catalog-fixture";
import { as, startTestApp, type TestApp } from "./support/harness";
import { scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

describe("Saatli menü ve şubeye özel tükenme", () => {
  it("tükenen ürünü görünür ama seçilemez gösterir ve fiyat hesabında kapatır", async () => {
    const f = await createCatalogFixture(app);
    const client = as(app, f.owner);
    const result = await client.request(
      "PUT",
      `/v1/business/${f.businessId}/catalog/items/${f.itemId}/availability`,
      { body: { branchId: f.branchId, available: false, expectedVersion: 0 } },
    );
    expect(result).toMatchObject({ status: 200 });
    const catalog = await as(app, f.customer).request(
      "GET",
      `/v1/shell/${f.businessId}/${f.instanceId}/catalog?branchId=${f.branchId}&includeUnavailable=true`,
    );
    expect(catalog.body).toMatchObject({ items: [{ id: f.itemId, available: false }] });
    const quote = await app.services.catalog.preview(f.scope, f.branchId, [
      { itemId: f.itemId, quantity: 1, optionIds: [] },
    ]);
    expect(quote.lines[0]?.available).toBe(false);
    const branch = await app.services.businessManagement.saveBranch(f.scope, {
      name: "İkinci",
      timezone: "Europe/Istanbul",
      address: null,
      active: true,
    });
    const other = await app.services.catalog.preview(f.scope, branch.id, [
      { itemId: f.itemId, quantity: 1, optionIds: [] },
    ]);
    expect(other.lines[0]?.available).toBe(true);
  });
  it("kategori ve ürün saat pencereleri birlikte uygulanır, gece yarısı doğru güne bağlanır", async () => {
    const f = await createCatalogFixture(app);
    const owner = as(app, f.owner);
    expect(
      await owner.request(
        "PUT",
        `/v1/business/${f.businessId}/catalog/categories/${f.categoryId}/menu-windows`,
        {
          body: {
            branchId: f.branchId,
            expectedVersion: 0,
            windows: [{ weekday: 2, opensAt: 1320, closesAt: 1560 }],
          },
        },
      ),
    ).toMatchObject({ status: 200 });
    expect(
      await owner.request(
        "PUT",
        `/v1/business/${f.businessId}/catalog/items/${f.itemId}/menu-windows`,
        {
          body: {
            branchId: f.branchId,
            expectedVersion: 0,
            windows: [{ weekday: 2, opensAt: 1380, closesAt: 1500 }],
          },
        },
      ),
    ).toMatchObject({ status: 200 });
    const rows = await scoped(app.db, f.businessId, (tx) =>
      tx.many<{ served: boolean }>(
        sql`select catalog_item_served_at(${f.businessId},${f.branchId},${f.itemId},instant) as served from unnest(array['2026-10-06T22:30:00+03:00','2026-10-06T23:30:00+03:00','2026-10-07T00:30:00+03:00','2026-10-07T01:00:00+03:00']::timestamptz[]) instant`,
      ),
    );
    expect(rows.map((row) => row.served)).toEqual([false, true, true, false]);
  });
  it("menü saatini müşteri değiştiremez ve bozuk aralık SQL'de de reddedilir", async () => {
    const f = await createCatalogFixture(app);
    expect(
      await as(app, f.customer).request(
        "PUT",
        `/v1/business/${f.businessId}/catalog/items/${f.itemId}/menu-windows`,
        { body: { branchId: f.branchId, expectedVersion: 0, windows: [] } },
      ),
    ).toMatchObject({ status: 403 });
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(
          sql`insert into catalog_menu_windows(business_id,branch_id,item_id,weekday,opens_at,closes_at) values(${f.businessId},${f.branchId},${f.itemId},2,600,500)`,
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
