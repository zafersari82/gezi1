import { catalogItemBodySchema, catalogOptionGroupBodySchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { createCatalogFixture } from "./support/catalog-fixture";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

describe("Katalog yalıtımı", () => {
  test("altı tablo başka işletmede okunamaz, değiştirilemez, silinemez ve kapsamsız görünmez", async () => {
    const a = await createCatalogFixture(app);
    const b = await createCatalogFixture(app);
    const cases = [
      {
        read: sql`select * from catalog_categories where business_id = ${b.businessId}`,
        update: sql`update catalog_categories set active = false where business_id = ${b.businessId}`,
        remove: sql`delete from catalog_categories where business_id = ${b.businessId}`,
        insert: sql`insert into catalog_categories(business_id, name) values (${b.businessId}, 'Yabancı kategori')`,
      },
      {
        read: sql`select * from catalog_items where business_id = ${b.businessId}`,
        update: sql`update catalog_items set active = false where business_id = ${b.businessId}`,
        remove: sql`delete from catalog_items where business_id = ${b.businessId}`,
        insert: sql`insert into catalog_items(business_id, name) values (${b.businessId}, 'Yabancı ürün')`,
      },
      {
        read: sql`select * from option_groups where business_id = ${b.businessId}`,
        update: sql`update option_groups set active = false where business_id = ${b.businessId}`,
        remove: sql`delete from option_groups where business_id = ${b.businessId}`,
        insert: sql`insert into option_groups(business_id, name) values (${b.businessId}, 'Yabancı grup')`,
      },
      {
        read: sql`select * from options where business_id = ${b.businessId}`,
        update: sql`update options set active = false where business_id = ${b.businessId}`,
        remove: sql`delete from options where business_id = ${b.businessId}`,
        insert: sql`insert into options(business_id, group_id, name) values (${b.businessId}, ${b.groupId}, 'Yabancı seçenek')`,
      },
      {
        read: sql`select * from item_option_groups where business_id = ${b.businessId}`,
        update: sql`update item_option_groups set sort_order = 1 where business_id = ${b.businessId}`,
        remove: sql`delete from item_option_groups where business_id = ${b.businessId}`,
        insert: sql`insert into item_option_groups(business_id, item_id, group_id) values (${b.businessId}, ${b.itemId}, ${b.groupId})`,
      },
      {
        read: sql`select * from prices where business_id = ${b.businessId}`,
        update: sql`update prices set amount_minor = 1 where business_id = ${b.businessId}`,
        remove: sql`delete from prices where business_id = ${b.businessId}`,
        insert: sql`insert into prices(business_id, item_id, branch_id, amount_minor, vat_basis_points)
          values (${b.businessId}, ${b.itemId}, ${b.branchId}, 1, 0)`,
      },
    ];
    for (const entry of cases) {
      expect(
        (await scoped(app.db, b.businessId, (tx) => tx.many(entry.read))).length,
      ).toBeGreaterThan(0);
      expect(await app.db.many(entry.read)).toEqual([]);
      expect(await app.migrationDb.many(entry.read)).toEqual([]);
      await scoped(app.db, a.businessId, async (tx) => {
        expect(await tx.many(entry.read)).toEqual([]);
        expect(await tx.execute(entry.update)).toBe(0);
        expect(await tx.execute(entry.remove)).toBe(0);
      });
      await expect(
        scoped(app.db, a.businessId, (tx) => tx.execute(entry.insert)),
      ).rejects.toMatchObject({ code: "42501" });
    }
    const metadata = await app.db.many(sql`
      select relrowsecurity, relforcerowsecurity from pg_class where relnamespace = 'public'::regnamespace
        and relname in ('catalog_categories', 'catalog_items', 'option_groups', 'options', 'item_option_groups', 'prices')
    `);
    expect(metadata).toHaveLength(6);
    for (const row of metadata)
      expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
  });

  test("kategori, ürün, seçenek, grup ve fiyat bağlantıları işletmeler arasında kurulamaz", async () => {
    const a = await createCatalogFixture(app);
    const b = await createCatalogFixture(app);
    const attempts = [
      sql`insert into catalog_items(business_id, name, category_id) values (${a.businessId}, 'Çapraz ürün', ${b.categoryId})`,
      sql`insert into options(business_id, group_id, name) values (${a.businessId}, ${b.groupId}, 'Çapraz seçenek')`,
      sql`insert into item_option_groups(business_id, item_id, group_id) values (${a.businessId}, ${b.itemId}, ${a.groupId})`,
      sql`insert into item_option_groups(business_id, item_id, group_id) values (${a.businessId}, ${a.itemId}, ${b.groupId})`,
      sql`insert into prices(business_id, item_id, amount_minor, vat_basis_points) values (${a.businessId}, ${b.itemId}, 1, 0)`,
      sql`insert into prices(business_id, item_id, branch_id, amount_minor, vat_basis_points) values (${a.businessId}, ${a.itemId}, ${b.branchId}, 1, 0)`,
    ];
    for (const attempt of attempts) {
      await expect(scoped(app.db, a.businessId, (tx) => tx.execute(attempt))).rejects.toMatchObject(
        { code: "23503" },
      );
    }
    const foreignUpdate = await as(app, a.owner).request(
      "PUT",
      `/v1/business/${a.businessId}/catalog/items/${b.itemId}`,
      {
        body: { name: "Yabancı değiştirme", price: { amountMinor: 1, vatBasisPoints: 0 } },
      },
    );
    expect(foreignUpdate).toMatchObject({ status: 404 });
  });

  test("personel ürün veya fiyat değiştiremez; seçenek kimliği başka gruba taşınamaz", async () => {
    const f = await createCatalogFixture(app);
    const staff = await createUser(app, "Katalog personeli");
    await app.services.businessManagement.setMember(f.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    expect(
      await as(app, staff).request("POST", `/v1/business/${f.businessId}/catalog/items`, {
        body: { name: "Yetkisiz ürün", price: { amountMinor: 1, vatBasisPoints: 0 } },
      }),
    ).toMatchObject({ status: 403 });
    expect(
      await as(app, staff).request(
        "PUT",
        `/v1/business/${f.businessId}/catalog/items/${f.itemId}/prices`,
        {
          body: { amountMinor: 1, vatBasisPoints: 0 },
        },
      ),
    ).toMatchObject({ status: 403 });
    const another = await app.services.catalog.saveOptionGroup(
      f.scope,
      catalogOptionGroupBodySchema.parse({ name: "Başka grup", options: [] }),
    );
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`
      update options set group_id = ${another.id} where id = ${f.optionId}
    `),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`
      insert into option_groups(business_id, name, min_selected, max_selected) values (${f.businessId}, 'Seçeneksiz zorunlu', 1, 1)
    `),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  test("kabuk müşterisine pasif ürün, yabancı işletme veya kullanılmayan seçenek grubu açılmaz", async () => {
    const f = await createCatalogFixture(app);
    const other = await createCatalogFixture(app);
    await app.services.catalog.saveItem(
      f.scope,
      catalogItemBodySchema.parse({
        name: "Kapalı ürün",
        active: false,
        price: { amountMinor: 1, vatBasisPoints: 0 },
      }),
    );
    await app.services.catalog.saveOptionGroup(
      f.scope,
      catalogOptionGroupBodySchema.parse({ name: "Yayımlanmayan grup", options: [] }),
    );
    const response = await as(app, f.customer).request(
      "GET",
      `/v1/shell/${f.businessId}/${f.instanceId}/catalog?branchId=${f.branchId}`,
    );
    expect(response).toMatchObject({ status: 200, body: { items: [{ id: f.itemId }] } });
    const body = response.body as { items: { id: string }[]; optionGroups: { id: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.optionGroups).toHaveLength(1);
    const invalidBranch = await as(app, f.customer).request(
      "GET",
      `/v1/shell/${f.businessId}/${f.instanceId}/catalog?branchId=${other.branchId}`,
    );
    expect(invalidBranch).toMatchObject({ status: 404 });
  });
});
