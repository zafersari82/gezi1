import { randomUUID } from "node:crypto";

import { businessDetailSchema, restaurantContextSchema, studioConfigurationResponseSchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createUser, as, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture } from "./support/tenant-fixture";

describe("Business Studio yayınlama ve canlı görünüm yalıtımı", () => {
  let app: TestApp;
  beforeAll(async () => { app = await startTestApp(); });
  afterAll(async () => { await app.stop(); });

  const design = {
    templateId: "food-fast", title: "Pilavcı Ahmet", tagline: "Taze pilav", palette: "teal",
  };

  it("yayın yalnızca etkin ve doğrulanmış işletmede mümkün", async () => {
    const owner = await createUser(app, "Başvuran işletme");
    const created = await as(app, owner).request("POST", "/v1/businesses", {
      body: { name: "Bekleyen Pilavcı", slug: `bekleyen-${randomUUID()}`, category: "food", city: "Ankara" },
    });
    expect(created.status).toBe(200);
    const id = (created.body as { id: string }).id;
    const saved = await as(app, owner).ok(studioConfigurationResponseSchema, "PUT", `/v1/business/${id}/studio`, {
      body: { ...design, expectedVersion: 0 },
    });
    expect(saved.published).toBeNull();
    await as(app, owner).fail("verification_required", "POST", `/v1/business/${id}/studio/publish`, {
      body: { expectedVersion: 1 },
    });
  });

  it("yayın anlık görüntüsü taslaktan ayrıdır; rol, işletme ve sürüm korunur", async () => {
    const f = await createTenantFixture(app);
    const owner = as(app, f.owner);
    const target = `/v1/business/${f.businessId}/studio`;
    const shell = `/v1/shell/${f.businessId}/${f.instanceId}/restaurant`;
    const first = await owner.ok(studioConfigurationResponseSchema, "PUT", target, {
      body: { ...design, expectedVersion: 0 },
    });
    expect(first.configuration?.version).toBe(1);
    expect(first.published).toBeNull();
    const publicPath = `/v1/businesses/${f.businessId}`;
    const customer = as(app, f.customer);
    expect((await customer.ok(businessDetailSchema, "GET", publicPath)).storefront).toBeNull();
    expect((await customer.ok(restaurantContextSchema, "GET", shell)).storefront).toBeNull();
    await owner.fail("record_version_conflict", "POST", `${target}/publish`, {
      body: { expectedVersion: 2 },
    });
    const stranger = await createUser(app, "Yabancı mağaza");
    await as(app, stranger).fail("forbidden", "POST", `${target}/publish`, {
      body: { expectedVersion: 1 },
    });
    const employee = await createUser(app, "Mağaza personeli");
    await app.services.businessManagement.setMember(f.scope, {
      userId: employee.id, role: "staff", active: true,
    });
    await as(app, employee).fail("forbidden", "POST", `${target}/publish`, {
      body: { expectedVersion: 1 },
    });
    const published = await owner.ok(studioConfigurationResponseSchema, "POST", `${target}/publish`, {
      body: { expectedVersion: 1 },
    });
    expect(published.published).toMatchObject(design);
    expect(published.publishedVersion).toBe(1);
    expect(published.publishedAt).not.toBeNull();
    expect((await customer.ok(businessDetailSchema, "GET", publicPath)).storefront).toMatchObject(design);
    expect((await customer.ok(restaurantContextSchema, "GET", shell)).storefront).toMatchObject(design);
    const edited = await owner.ok(studioConfigurationResponseSchema, "PUT", target, {
      body: { ...design, title: "Yeni isim (taslak)", expectedVersion: 1 },
    });
    expect(edited.configuration).toMatchObject({ title: "Yeni isim (taslak)", status: "draft", version: 2 });
    expect(edited.published?.title).toBe("Pilavcı Ahmet");
    expect((await customer.ok(businessDetailSchema, "GET", publicPath)).storefront?.title)
      .toBe("Pilavcı Ahmet");
    expect((await as(app, f.customer).ok(restaurantContextSchema, "GET", shell)).storefront?.title)
      .toBe("Pilavcı Ahmet");
    const republished = await owner.ok(studioConfigurationResponseSchema, "POST", `${target}/publish`, {
      body: { expectedVersion: 2 },
    });
    expect(republished.publishedVersion).toBe(2);
    expect((await customer.ok(businessDetailSchema, "GET", publicPath)).storefront?.title)
      .toBe("Yeni isim (taslak)");
    expect((await as(app, f.customer).ok(restaurantContextSchema, "GET", shell)).storefront?.title)
      .toBe("Yeni isim (taslak)");

    // Şablon değişimi taslaktır: müşteri ancak yeni sürüm yayımlandığında görür.
    const enterprise = await owner.ok(studioConfigurationResponseSchema, "PUT", target, {
      body: {
        ...design, templateId: "food-enterprise", title: "Marka Mağazası",
        palette: "navy", expectedVersion: 2,
      },
    });
    expect(enterprise.configuration?.templateId).toBe("food-enterprise");
    expect((await customer.ok(restaurantContextSchema, "GET", shell)).storefront?.templateId)
      .toBe("food-fast");
    await owner.ok(studioConfigurationResponseSchema, "POST", `${target}/publish`, {
      body: { expectedVersion: 3 },
    });
    expect((await customer.ok(businessDetailSchema, "GET", publicPath)).storefront)
      .toMatchObject({ templateId: "food-enterprise", title: "Marka Mağazası", palette: "navy" });
    expect((await customer.ok(restaurantContextSchema, "GET", shell)).storefront?.templateId)
      .toBe("food-enterprise");
  });
});
