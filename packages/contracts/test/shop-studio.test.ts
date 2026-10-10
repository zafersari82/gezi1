import { describe, expect, it } from "vitest";

import { bridgeParamsSchemas } from "../src/bridge";
import { storeContextSchema } from "../src/storefront";
import { OFFERED_STUDIO_TEMPLATES, studioTemplateOffered } from "../src/studio";
import { STUDIO_STARTER_ITEMS } from "../src/studio-starter";

const BUSINESS = "6f1b8a6e-2b8f-4c55-9d1e-0a7c6f1b2c3d";
const INSTANCE = "0b4c2d1e-9a8f-4e7d-8c6b-5a4f3e2d1c0b";
const BRANCH = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("S10 genel mağaza sözleşmesi", () => {
  it("alışveriş sektörü için yayımlanabilir şablonları içerir", () => {
    const shops = OFFERED_STUDIO_TEMPLATES.filter((item) => item.category === "shopping");
    expect(shops.map((item) => item.id)).toEqual([
      "shop-neighborhood",
      "shop-boutique",
      "shop-enterprise",
    ]);
    expect(shops.every((item) => item.engine === "ordering")).toBe(true);
    expect(studioTemplateOffered("shop-neighborhood")).toBe(true);
  });
  it("örnek mağaza ürünlerine otomatik fiyat veya stok uydurmaz", () => {
    const samples = STUDIO_STARTER_ITEMS.filter((item) => item.category === "shopping");
    expect(samples.length).toBeGreaterThanOrEqual(5);
    expect(samples.every((item) => !Object.hasOwn(item, "amountMinor"))).toBe(true);
  });
  it("mağaza bağlamında başka tipte kimlik ve şube verisini reddeder", () => {
    const valid = {
      businessId: BUSINESS,
      appInstanceId: INSTANCE,
      businessName: "Mahalle Market",
      storefront: null,
      capabilities: ["ordering.pickup@1.0.0"],
      branches: [
        {
          id: BRANCH,
          name: "Merkez",
          timezone: "Europe/Istanbul",
          address: "A",
          openNow: true,
          preparationMinutes: 20,
        },
      ],
    };
    expect(storeContextSchema.safeParse(valid).success).toBe(true);
    expect(storeContextSchema.safeParse({ ...valid, businessId: "farkli" }).success).toBe(false);
    expect(bridgeParamsSchemas["ordering.getStore"].safeParse(undefined).success).toBe(true);
  });
});
