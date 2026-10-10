import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canUseShopFulfilment, cartMatchesChoice, effectivePrice } from "../src/model";

const branchId = randomUUID();
const otherBranchId = randomUUID();
const itemId = randomUUID();
const addressId = randomUUID();
const otherAddressId = randomUUID();

describe("VADO Shops müşteri siparişi", () => {
  it("şubeye özgü fiyatı genel fiyattan önce seçer", () => {
    const catalog = {
      categories: [],
      items: [],
      optionGroups: [],
      prices: [
        {
          itemId,
          branchId: null,
          amountMinor: 1200,
          vatBasisPoints: 1000,
          currency: "TRY" as const,
          id: randomUUID(),
        },
        {
          itemId,
          branchId,
          amountMinor: 1900,
          vatBasisPoints: 1000,
          currency: "TRY" as const,
          id: randomUUID(),
        },
      ],
    };
    expect(effectivePrice(catalog, branchId, itemId)?.amountMinor).toBe(1900);
    expect(effectivePrice(catalog, otherBranchId, itemId)?.amountMinor).toBe(1200);
    expect(effectivePrice(catalog, branchId, randomUUID())).toBeUndefined();
  });
  it("teslimatı sadece işletmenin etkin yeteneğiyle açar", () => {
    const store = {
      businessId: randomUUID(),
      appInstanceId: randomUUID(),
      businessName: "Market",
      storefront: null,
      branches: [],
      capabilities: ["ordering.pickup@1.0.0"],
    };
    expect(canUseShopFulfilment(store, "pickup")).toBe(true);
    expect(canUseShopFulfilment(store, "delivery")).toBe(false);
    expect(
      canUseShopFulfilment({ ...store, capabilities: ["ordering.delivery@1.0.0"] }, "delivery"),
    ).toBe(true);
  });
  it("başka şube veya adres için açık sepeti sessizce kullanmaz", () => {
    const choice = { branchId, fulfilment: "delivery" as const, addressId };
    const cart = { status: "open" as const, branchId, fulfilment: "delivery" as const, addressId };
    expect(cartMatchesChoice(cart, choice)).toBe(true);
    expect(cartMatchesChoice({ ...cart, branchId: otherBranchId }, choice)).toBe(false);
    expect(cartMatchesChoice({ ...cart, addressId: otherAddressId }, choice)).toBe(false);
    expect(cartMatchesChoice({ ...cart, fulfilment: "pickup" as const }, choice)).toBe(false);
    expect(cartMatchesChoice(null, choice)).toBe(true);
  });
});
