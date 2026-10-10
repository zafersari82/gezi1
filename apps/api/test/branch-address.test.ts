import { randomUUID } from "node:crypto";

import { branchSchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { as, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

/** Testin kendi küçük adres kataloğu: bir il, iki ilçe, her ilçede bir mahalle. */
async function seedCatalog(app: TestApp) {
  const ids = {
    province: randomUUID(),
    kadikoy: randomUUID(),
    uskudar: randomUUID(),
    moda: randomUUID(),
    altunizade: randomUUID(),
  };
  const source = () => 3_000_000 + Math.floor(Math.random() * 5_000_000);
  await app.platformDb.transaction(async (tx) => {
    await tx.execute(
      sql`insert into location_countries (code, name) values ('TR', 'Türkiye') on conflict (code) do nothing`,
    );
    const country = await tx.one<{ id: string }>(
      sql`select id from location_countries where code = 'TR'`,
    );
    await tx.execute(sql`
      insert into location_provinces (id, country_id, source_id, name, full_official_name)
      values (${ids.province}, ${country.id}, ${source()}, 'İstanbul', 'İstanbul')
    `);
    for (const [id, name] of [
      [ids.kadikoy, "Kadıköy"],
      [ids.uskudar, "Üsküdar"],
    ] as const)
      await tx.execute(sql`
        insert into location_districts (id, province_id, source_id, name, full_official_name)
        values (${id}, ${ids.province}, ${source()}, ${name}, ${name})
      `);
    for (const [id, district, name] of [
      [ids.moda, ids.kadikoy, "Caferağa"],
      [ids.altunizade, ids.uskudar, "Altunizade"],
    ] as const)
      await tx.execute(sql`
        insert into location_neighborhoods (id, district_id, source_id, name, full_official_name)
        values (${id}, ${district}, ${source()}, ${name}, ${name})
      `);
  });
  return ids;
}

describe("şube adresi", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.stop());

  it("il, ilçe ve mahalle katalogdan gelir; tutarsız seçim ve eksik alan reddedilir", async () => {
    const ids = await seedCatalog(app);
    const fixture = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const url = `/v1/business/${fixture.businessId}/branches/${fixture.branchId}`;
    const address = {
      provinceId: ids.province,
      districtId: ids.kadikoy,
      neighborhoodId: ids.moda,
      line: "Moda Caddesi No: 12 Daire: 3",
    };

    const saved = await owner.ok(branchSchema, "PUT", url, {
      body: { name: "Moda", timezone: "Europe/Istanbul", active: true, address },
    });
    expect(saved.address).toEqual({
      ...address,
      provinceName: "İstanbul",
      districtName: "Kadıköy",
      neighborhoodName: "Caferağa",
    });
    expect(saved.legacyAddress).toBe("");

    // Mahalle başka ilçenin mahallesi: katalog bağı tutmaz.
    await owner.fail("location_parent_invalid", "PUT", url, {
      body: {
        name: "Moda",
        timezone: "Europe/Istanbul",
        active: true,
        address: { ...address, neighborhoodId: ids.altunizade },
      },
    });
    await owner.fail("validation_failed", "PUT", url, {
      body: {
        name: "Moda",
        timezone: "Europe/Istanbul",
        active: true,
        address: { provinceId: ids.province, districtId: ids.kadikoy },
      },
    });
  });

  it("keşif izdüşümü yalnız etkin ve adresi kayıtlı şubeyi taşır; uygulama rolü ona yazamaz", async () => {
    const ids = await seedCatalog(app);
    const fixture = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const url = `/v1/business/${fixture.businessId}/branches/${fixture.branchId}`;
    const body = {
      name: "Altunizade",
      timezone: "Europe/Istanbul",
      active: true,
      address: {
        provinceId: ids.province,
        districtId: ids.uskudar,
        neighborhoodId: ids.altunizade,
        line: "Kısıklı Caddesi No: 4",
      },
    };
    const projection = () =>
      app.db.many<{ district_id: string }>(sql`
        select district_id from branch_discovery_locations where branch_id = ${fixture.branchId}
      `);

    expect(await projection()).toEqual([]);
    await owner.ok(branchSchema, "PUT", url, { body });
    expect(await projection()).toEqual([{ district_id: ids.uskudar }]);
    await owner.ok(branchSchema, "PUT", url, { body: { ...body, active: false } });
    expect(await projection()).toEqual([]);

    await expect(
      scoped(app.db, fixture.businessId, (tx) =>
        tx.execute(sql`
          insert into branch_discovery_locations (business_id, branch_id, province_id, district_id)
          values (${fixture.businessId}, ${fixture.branchId}, ${ids.province}, ${ids.kadikoy})
        `),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("2.8 öncesinden kalan serbest adres, yapılandırılmış adres kaydedilmedikçe korunur", async () => {
    const fixture = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    await scoped(app.migrationDb, fixture.businessId, (tx) =>
      tx.execute(
        sql`update branches set address = 'Bağdat Cad. No: 1' where id = ${fixture.branchId}`,
      ),
    );
    const renamed = await owner.ok(
      branchSchema,
      "PUT",
      `/v1/business/${fixture.businessId}/branches/${fixture.branchId}`,
      { body: { name: "Bağdat", timezone: "Europe/Istanbul", active: true, address: null } },
    );
    expect(renamed).toMatchObject({ address: null, legacyAddress: "Bağdat Cad. No: 1" });
  });
});
