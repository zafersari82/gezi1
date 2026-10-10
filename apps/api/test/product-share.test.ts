import { catalogItemBodySchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { as, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

describe("S5 kamusal ürün paylaşımı", () => {
  test("şube fiyatını okur, yanlış tenant ve kapalı ürünleri gizler", async () => {
    const a = await createTenantFixture(app);
    const b = await createTenantFixture(app);
    const item = await app.services.catalog.saveItem(
      a.scope,
      catalogItemBodySchema.parse({
        name: "Tavuklu Pilav",
        price: { amountMinor: 15000, vatBasisPoints: 1000 },
      }),
    );
    const link = (businessId: string, branchId: string, id: string) =>
      `/v1/businesses/${businessId}/branches/${branchId}/share-products/${id}`;
    const price = await as(app, a.customer).request("GET", link(a.businessId, a.branchId, item.id));
    expect(price).toMatchObject({
      status: 200,
      body: { name: "Tavuklu Pilav", amountMinor: 15000, branchId: a.branchId },
    });
    expect((price.body as Record<string, unknown>).sku).toBeUndefined();
    const mismatch = await as(app, a.customer).request(
      "GET",
      link(b.businessId, b.branchId, item.id),
    );
    expect(mismatch.status).toBe(404);
    await app.services.catalog.savePrice(a.scope, item.id, {
      branchId: a.branchId,
      amountMinor: 21000,
      vatBasisPoints: 1000,
    });
    expect(
      await as(app, a.customer).request("GET", link(a.businessId, a.branchId, item.id)),
    ).toMatchObject({ status: 200, body: { amountMinor: 21000 } });
    await app.services.catalog.saveItem(
      a.scope,
      catalogItemBodySchema.parse({
        name: "Tavuklu Pilav",
        available: false,
        price: { amountMinor: 15000, vatBasisPoints: 1000 },
      }),
      item.id,
    );
    expect(
      (await as(app, a.customer).request("GET", link(a.businessId, a.branchId, item.id))).status,
    ).toBe(404);
  });
});
