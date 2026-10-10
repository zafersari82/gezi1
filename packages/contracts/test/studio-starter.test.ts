import { describe, expect, it } from "vitest";

import {
  STUDIO_STARTER_ITEMS,
  studioStarterCatalogBodySchema,
  studioStarterItemIdSchema,
} from "../src/studio-starter";

describe("VADO Business Studio hazır ürün/hizmet önerileri", () => {
  it("seçenekler sektörlere ayrılmıştır ve benzersizdir", () => {
    expect(new Set(STUDIO_STARTER_ITEMS.map((item) => item.id)).size).toBe(
      STUDIO_STARTER_ITEMS.length,
    );
    expect(STUDIO_STARTER_ITEMS.some((item) => item.category === "food")).toBe(true);
    expect(STUDIO_STARTER_ITEMS.some((item) => item.category === "beauty")).toBe(true);
    for (const item of STUDIO_STARTER_ITEMS)
      expect(studioStarterItemIdSchema.parse(item.id)).toBe(item.id);
  });

  it("fiyat ve KDV açıkça belirtilmeden kayıt kabul edilmez", () => {
    expect(
      studioStarterCatalogBodySchema.safeParse({ items: [{ id: "food-ayran" }] }).success,
    ).toBe(false);
    expect(
      studioStarterCatalogBodySchema.safeParse({ items: [{ id: "food-ayran", amountMinor: 1000 }] })
        .success,
    ).toBe(false);
    expect(
      studioStarterCatalogBodySchema.safeParse({
        items: [{ id: "food-ayran", amountMinor: 0, vatBasisPoints: 0 }],
      }).success,
    ).toBe(false);
    expect(
      studioStarterCatalogBodySchema.safeParse({
        items: [{ id: "food-ayran", amountMinor: 1000, vatBasisPoints: 10001 }],
      }).success,
    ).toBe(false);
  });

  it("yinelenen veya bilinmeyen ürün ve yetki alanları reddedilir", () => {
    const valid = { id: "food-ayran", amountMinor: 2500, vatBasisPoints: 1000 };
    expect(studioStarterCatalogBodySchema.safeParse({ items: [valid] }).success).toBe(true);
    expect(studioStarterCatalogBodySchema.safeParse({ items: [valid, valid] }).success).toBe(false);
    expect(
      studioStarterCatalogBodySchema.safeParse({ items: [{ ...valid, id: "food-unknown" }] })
        .success,
    ).toBe(false);
    expect(
      studioStarterCatalogBodySchema.safeParse({ items: [valid], businessId: "another" }).success,
    ).toBe(false);
  });
});
