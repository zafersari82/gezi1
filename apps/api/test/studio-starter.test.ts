import { catalogSchema, studioStarterCatalogResultSchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture } from "./support/tenant-fixture";

const input = {
  items: [
    { id: "food-rice-chicken", amountMinor: 15000, vatBasisPoints: 1000 },
    { id: "food-ayran", amountMinor: 3000, vatBasisPoints: 1000 },
  ],
};

describe("VADO Studio ilk katalog aktarımı", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("boş kataloğu atomik kaydeder, fiyatları korur ve yinelenen aktarımı engeller", async () => {
    const f = await createTenantFixture(app);
    const url = `/v1/business/${f.businessId}/catalog/starter-items`;
    const owner = as(app, f.owner);
    const created = await owner.ok(studioStarterCatalogResultSchema, "POST", url, { body: input });
    expect(created.imported).toBe(2);
    const catalog = await owner.ok(catalogSchema, "GET", `/v1/business/${f.businessId}/catalog`);
    expect(catalog.items.map((item) => item.name).sort()).toEqual(["Ayran", "Tavuklu pilav"]);
    expect(catalog.prices.map((price) => price.amountMinor).sort((a, b) => a - b)).toEqual([
      3000, 15000,
    ]);
    await owner.fail("record_version_conflict", "POST", url, { body: input });
    expect((await app.services.catalog.get(f.scope)).items).toHaveLength(2);
  });

  it("başka işletme, personel ve yanlış sektör önerileri reddedilir", async () => {
    const f = await createTenantFixture(app);
    const outsider = await createUser(app, "Diğer işletme sahibi");
    const staff = await createUser(app, "Katalog personeli");
    await app.services.businessManagement.setMember(f.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    const url = `/v1/business/${f.businessId}/catalog/starter-items`;
    await as(app, outsider).fail("forbidden", "POST", url, { body: input });
    await as(app, staff).fail("forbidden", "POST", url, { body: input });
    await as(app, f.owner).fail("validation_failed", "POST", url, {
      body: {
        items: [{ id: "beauty-haircut", amountMinor: 3000, vatBasisPoints: 1000 }],
      },
    });
    expect((await app.services.catalog.get(f.scope)).items).toHaveLength(0);
  });

  it("geçersiz tutar ve yinelenen öneriler hiçbir ürün eklemez", async () => {
    const f = await createTenantFixture(app);
    const url = `/v1/business/${f.businessId}/catalog/starter-items`;
    await as(app, f.owner).fail("validation_failed", "POST", url, {
      body: {
        items: [input.items[0], { ...input.items[1], amountMinor: -1 }],
      },
    });
    await as(app, f.owner).fail("validation_failed", "POST", url, {
      body: {
        items: [input.items[0], input.items[0]],
      },
    });
    expect((await app.services.catalog.get(f.scope)).items).toHaveLength(0);
  });
});
