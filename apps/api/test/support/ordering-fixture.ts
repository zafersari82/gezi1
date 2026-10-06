import { randomUUID } from "node:crypto";

import { orderSchema } from "@vado/contracts";

import { createCatalogFixture } from "./catalog-fixture";
import type { TestApp } from "./harness";

export async function createOrderingFixture(app: TestApp) {
  const f = await createCatalogFixture(app);
  const opened = await app.services.ordering.openCart(f.customerScope, f.branchId);
  const cart = await app.services.ordering.replaceCart(f.customerScope, opened.id, {
    expectedVersion: opened.version,
    lines: [{ itemId: f.itemId, quantity: 2, optionIds: [f.optionId] }],
  });
  const result = await app.services.ordering.checkout(f.customerScope, cart.id, randomUUID(), {
    cartVersion: cart.version,
    seenTotalMinor: cart.totalMinor,
    quoteHash: cart.quoteHash,
  });
  return { ...f, cart, order: orderSchema.parse(result.body) };
}
