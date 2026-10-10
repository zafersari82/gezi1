import {
  businessDetailSchema,
  catalogItemBodySchema,
  catalogSchema,
  restaurantContextSchema,
  studioConfigurationResponseSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture } from "./support/tenant-fixture";

const design = {
  templateId: "food-fast",
  title: "Pilavcı",
  tagline: "Günlük",
  palette: "teal",
};
// Ortak medya servisi başlık imzasını ayrıca doğrular; bu test geçerli bir PNG kullanır.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGOQLFqFFTEMLQkAC0pNQWlTN4kAAAAASUVORK5CYII=",
  "base64",
);

describe("VADO Studio işletme medyası", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("görsel yalnız ait olduğu işletmede kullanılabilir; yayın taslaktan ayrıdır", async () => {
    const first = await createTenantFixture(app);
    const second = await createTenantFixture(app);
    const photo = await app.services.media.uploadBusiness(first.scope, png);
    const firstApi = as(app, first.owner);
    const secondApi = as(app, second.owner);
    const firstStudio = `/v1/business/${first.businessId}/studio`;
    const secondStudio = `/v1/business/${second.businessId}/studio`;
    await secondApi.fail("media_not_found", "PUT", secondStudio, {
      body: { ...design, logoMediaId: photo.id, expectedVersion: 0 },
    });
    const saved = await firstApi.ok(studioConfigurationResponseSchema, "PUT", firstStudio, {
      body: { ...design, logoMediaId: photo.id, expectedVersion: 0 },
    });
    expect(saved.configuration?.logoUrl).toBe(photo.url);
    const shell = `/v1/shell/${first.businessId}/${first.instanceId}/restaurant`;
    expect(
      (await as(app, first.customer).ok(restaurantContextSchema, "GET", shell)).storefront,
    ).toBeNull();
    const released = await firstApi.ok(
      studioConfigurationResponseSchema,
      "POST",
      `${firstStudio}/publish`,
      {
        body: { expectedVersion: 1 },
      },
    );
    expect(released.published?.logoUrl).toBe(photo.url);
    const publicPath = `/v1/businesses/${first.businessId}`;
    const publicStore = (await as(app, first.customer).ok(businessDetailSchema, "GET", publicPath))
      .storefront;
    expect(publicStore?.logoUrl).toBe(photo.url);
    expect(publicStore).not.toHaveProperty("logoMediaId");
    expect(publicStore).not.toHaveProperty("coverMediaId");
    expect(
      (await as(app, first.customer).ok(restaurantContextSchema, "GET", shell)).storefront?.logoUrl,
    ).toBe(photo.url);

    const cover = await app.services.media.uploadBusiness(first.scope, png);
    const draft = await firstApi.ok(studioConfigurationResponseSchema, "PUT", firstStudio, {
      body: { ...design, logoMediaId: photo.id, coverMediaId: cover.id, expectedVersion: 1 },
    });
    expect(draft.configuration?.coverUrl).toBe(cover.url);
    expect(draft.published?.coverUrl).toBeNull();
    expect(
      (await as(app, first.customer).ok(businessDetailSchema, "GET", publicPath)).storefront
        ?.coverUrl,
    ).toBeNull();
    expect(
      (await as(app, first.customer).ok(restaurantContextSchema, "GET", shell)).storefront
        ?.coverUrl,
    ).toBeNull();
    await firstApi.ok(studioConfigurationResponseSchema, "POST", `${firstStudio}/publish`, {
      body: { expectedVersion: 2 },
    });
    expect(
      (await as(app, first.customer).ok(businessDetailSchema, "GET", publicPath)).storefront
        ?.coverUrl,
    ).toBe(cover.url);
    expect(
      (await as(app, first.customer).ok(restaurantContextSchema, "GET", shell)).storefront
        ?.coverUrl,
    ).toBe(cover.url);
  });

  it("personelin işletme medyası yükleme yetkisi yoktur", async () => {
    const f = await createTenantFixture(app);
    const staff = await createUser(app, "Vitrin çalışanı");
    await app.services.businessManagement.setMember(f.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    const scope = await app.services.businessManagement.authorise(staff.id, f.businessId);
    await expect(app.services.media.uploadBusiness(scope, png)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("ürün görseli için işletme ve ürün sürümü korunur", async () => {
    const first = await createTenantFixture(app);
    const second = await createTenantFixture(app);
    const firstImage = await app.services.media.uploadBusiness(first.scope, png);
    const product = await app.services.catalog.saveItem(
      second.scope,
      catalogItemBodySchema.parse({
        name: "Pilav",
        price: { amountMinor: 12000, vatBasisPoints: 1000 },
      }),
    );
    const endpoint = `/v1/business/${second.businessId}/catalog/items/${product.id}/image`;
    await as(app, second.owner).fail("media_not_found", "PUT", endpoint, {
      body: { mediaId: firstImage.id, expectedVersion: product.version },
    });
    const photo = await app.services.media.uploadBusiness(second.scope, png);
    const attached = await as(app, second.owner).request("PUT", endpoint, {
      body: { mediaId: photo.id, expectedVersion: product.version },
    });
    expect(attached.body).toMatchObject({ imageMediaId: photo.id, version: product.version + 1 });
    await as(app, second.owner).fail("record_version_conflict", "PUT", endpoint, {
      body: { mediaId: photo.id, expectedVersion: product.version },
    });
    const catalog = await as(app, second.owner).ok(
      catalogSchema,
      "GET",
      `/v1/business/${second.businessId}/catalog`,
    );
    expect(catalog.items.find((item) => item.id === product.id)?.imageUrl).toBe(photo.url);
  });
});
