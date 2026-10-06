import { cartSchema, orderSchema } from "@vado/contracts";
import { expect } from "vitest";

import { createCatalogFixture } from "./catalog-fixture";
import { as, type TestApp } from "./harness";

export async function createRestaurantFixture(app: TestApp) {
  const f = await createCatalogFixture(app);
  await app.services.businessManagement.setHours(f.scope, f.branchId, {
    hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: 0, closesAt: 1440 })),
  });
  for (const id of [
    "ordering.pickup",
    "ordering.scheduling",
    "ordering.table_service",
    "ordering.kitchen",
  ]) {
    const result = await as(app, f.owner).request(
      "PUT",
      `/v1/business/${f.businessId}/app-instances/${f.instanceId}/capabilities/${id}`,
      { body: { version: "1.0.0", enabled: true, config: {} } },
    );
    expect(result.status).toBe(200);
  }
  const opened = await app.services.ordering.openCart(f.customerScope, f.branchId);
  const cart = await app.services.ordering.replaceCart(f.customerScope, opened.id, {
    expectedVersion: opened.version,
    lines: [{ itemId: f.itemId, quantity: 1, optionIds: [], note: "Az tuzlu" }],
  });
  const result = await app.services.ordering.checkout(f.customerScope, cart.id, cart.id, {
    cartVersion: cart.version,
    seenTotalMinor: cart.totalMinor,
    quoteHash: cart.quoteHash,
  });
  expect(result.status).toBe(200);
  return { ...f, cart: cartSchema.parse(cart), order: orderSchema.parse(result.body) };
}
