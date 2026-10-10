import { describe, expect, it } from "vitest";

import { sharedProductLaunch } from "../shared-product-intent";

const B = "550e8400-e29b-41d4-a716-446655440000";
const A = "550e8400-e29b-41d4-a716-446655440003";
const S = "550e8400-e29b-41d4-a716-446655440001";
const OTHER = "550e8400-e29b-41d4-a716-446655440004";
const I = "550e8400-e29b-41d4-a716-446655440002";
const context = {
  businessId: B,
  appInstanceId: A,
  branches: [
    {
      id: S,
      name: "Merkez",
      timezone: "Europe/Istanbul",
      address: "",
      openNow: true,
      preparationMinutes: 15,
    },
    {
      id: OTHER,
      name: "Şube",
      timezone: "Europe/Istanbul",
      address: "",
      openNow: true,
      preparationMinutes: 15,
    },
  ],
};
const params = { businessId: B, appInstanceId: A, product_branch: S, product_item: I };

describe("S6: paylaşılan ürün restoran açılışı", () => {
  it("normal açılışta hiçbir şey önseçmez", () => {
    expect(sharedProductLaunch({ businessId: B, appInstanceId: A }, context, null, null)).toEqual({
      type: "none",
    });
  });
  it("eşleşen ürün yalnızca menü önerisi olur, sipariş oluşturmaz", () => {
    expect(sharedProductLaunch(params, context, null, null)).toEqual({
      type: "ready",
      intent: { branchId: S, itemId: I },
    });
  });
  it("başka işletme ve uygulama örneğinin ürünü reddedilir", () => {
    for (const wrong of [
      { ...params, businessId: OTHER },
      { ...params, appInstanceId: OTHER },
      { ...params, product_branch: "bozuk" },
      { ...params, product_item: "bozuk" },
    ])
      expect(sharedProductLaunch(wrong, context, null, null).type).toBe("conflict");
  });
  it("işletmeye ait olmayan şubeyi reddeder", () => {
    expect(sharedProductLaunch({ ...params, product_branch: A }, context, null, null).type).toBe(
      "conflict",
    );
  });
  it("mevcut farklı şube sepetini ve masa oturumunu değiştirmez", () => {
    expect(
      sharedProductLaunch(params, context, { branchId: OTHER, status: "open" }, null).type,
    ).toBe("conflict");
    expect(sharedProductLaunch(params, context, null, { branchId: OTHER }).type).toBe("conflict");
    expect(sharedProductLaunch(params, context, { branchId: S, status: "open" }, null).type).toBe(
      "ready",
    );
  });
});
