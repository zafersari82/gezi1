import { describe, expect, it } from "vitest";

import { deliveryLaunchIntent } from "../delivery-launch-intent";

const BUSINESS = "550e8400-e29b-41d4-a716-446655440000";
const INSTANCE = "550e8400-e29b-41d4-a716-446655440001";
const BRANCH = "550e8400-e29b-41d4-a716-446655440002";
const OTHER_BRANCH = "550e8400-e29b-41d4-a716-446655440003";
const ADDRESS = "550e8400-e29b-41d4-a716-446655440004";
const OTHER_ADDRESS = "550e8400-e29b-41d4-a716-446655440005";
const context = { businessId: BUSINESS, appInstanceId: INSTANCE, branches: [{ id: BRANCH }] };
const params = {
  businessId: BUSINESS,
  appInstanceId: INSTANCE,
  delivery_branch: BRANCH,
  delivery_address: ADDRESS,
};

describe("S9: Keşiften teslimat siparişine açılış", () => {
  it("normal mağaza açılışı teslimatı kendiliğinden etkinleştirmez", () => {
    expect(deliveryLaunchIntent({}, context, null, null)).toEqual({ type: "none" });
  });
  it("doğru kimlikleri yalnızca bir navigasyon önerisi olarak kullanır", () => {
    expect(deliveryLaunchIntent(params, context, null, null)).toEqual({
      type: "ready",
      intent: { branchId: BRANCH, addressId: ADDRESS },
    });
  });
  it("bozuk, eksik, başka işletme/şube/örnek kimliklerini reddeder", () => {
    for (const invalid of [
      { ...params, businessId: OTHER_BRANCH },
      { ...params, appInstanceId: OTHER_BRANCH },
      { ...params, delivery_branch: OTHER_BRANCH },
      { ...params, delivery_address: "bozuk" },
      { businessId: BUSINESS, appInstanceId: INSTANCE, delivery_branch: BRANCH },
    ])
      expect(deliveryLaunchIntent(invalid, context, null, null).type).toBe("conflict");
  });
  it("masa oturumundan teslimata sessizce geçmez", () => {
    expect(deliveryLaunchIntent(params, context, null, { branchId: BRANCH }).type).toBe("conflict");
  });
  it("farklı şube, sipariş türü veya adres içeren açık sepeti korur", () => {
    for (const cart of [
      { branchId: OTHER_BRANCH, status: "open", fulfilment: "delivery", addressId: ADDRESS },
      { branchId: BRANCH, status: "open", fulfilment: "pickup", addressId: null },
      { branchId: BRANCH, status: "open", fulfilment: "delivery", addressId: OTHER_ADDRESS },
      { branchId: BRANCH, status: "open", fulfilment: "delivery", addressId: null },
    ])
      expect(deliveryLaunchIntent(params, context, cart as never, null).type).toBe("conflict");
  });
  it("aynı şube ve adreste açık teslimat sepetini korur", () => {
    const existing = {
      branchId: BRANCH,
      status: "open",
      fulfilment: "delivery",
      addressId: ADDRESS,
    };
    expect(deliveryLaunchIntent(params, context, existing as never, null).type).toBe("ready");
  });
});
