import type { BusinessDetail, PublicShareProduct } from "@vado/contracts";
import { describe, expect, it } from "vitest";

import { orderingAppForSharedProduct } from "../src/features/sharing/order-from-product";

const B = "550e8400-e29b-41d4-a716-446655440000";
const S = "550e8400-e29b-41d4-a716-446655440001";
const I = "550e8400-e29b-41d4-a716-446655440002";
const product: PublicShareProduct = {
  businessId: B,
  branchId: S,
  id: I,
  name: "Tavuklu pilav",
  description: "",
  branchName: "Merkez",
  amountMinor: 15000,
  currency: "TRY",
  imageUrl: null,
};
function business(apps: { id: string; capabilities: string[] }[]): BusinessDetail {
  return { id: B, category: "food", miniApps: apps } as BusinessDetail;
}

describe("S6: paylaşılan ürünün gerçek sipariş uygulamasına yönlendirilmesi", () => {
  it("ürün ile işletme eşleşmeden uygulama açılmaz", () => {
    expect(() =>
      orderingAppForSharedProduct(business([]), {
        ...product,
        businessId: I,
      }),
    ).toThrow("eşleşmiyor");
  });
  it("başka mini uygulamaya ürün açma parametresi gönderilmez", () => {
    expect(
      orderingAppForSharedProduct(
        business([{ id: "rastgele", capabilities: ["ordering.basic"] }]),
        product,
      ),
    ).toBeNull();
    expect(
      orderingAppForSharedProduct(business([{ id: "restoran", capabilities: [] }]), product),
    ).toBeNull();
  });
  it("yalnız restoran ve sipariş yeteneği birlikteyse açılır", () => {
    expect(
      orderingAppForSharedProduct(
        business([
          { id: "rastgele", capabilities: ["ordering.basic"] },
          { id: "restoran", capabilities: ["ordering.basic"] },
        ]),
        product,
      )?.id,
    ).toBe("restoran");
  });
});

describe("S10: alışveriş ürünlerinin mağaza paketine açılması", () => {
  it("alışveriş işletmesinin ürününü restoran uygulamasına göndermez", () => {
    const shop = {
      ...business([
        { id: "restoran", capabilities: ["ordering.basic"] },
        { id: "magaza", capabilities: ["ordering.basic"] },
      ]),
      category: "shopping" as const,
    };
    expect(orderingAppForSharedProduct(shop, product)?.id).toBe("magaza");
  });
  it("alışveriş işletmesinde mağaza paketi yayınlanmamışsa otomatik başka pakete geçmez", () => {
    const shop = {
      ...business([{ id: "restoran", capabilities: ["ordering.basic"] }]),
      category: "shopping" as const,
    };
    expect(orderingAppForSharedProduct(shop, product)).toBeNull();
  });
});
