import { describe, expect, it } from "vitest";

import { createBusinessBodySchema } from "../src/businesses";
import {
  publishStudioBodySchema,
  saveStudioBodySchema,
  STUDIO_PALETTES,
  STUDIO_TEMPLATES,
  studioInitialPalette,
  studioItemImageBodySchema,
  studioTemplateById,
} from "../src/studio";

describe("VADO Business Studio başlangıç şablonları", () => {
  const business = {
    name: "Ahmet Usta Pilav",
    slug: "ahmet-usta-pilav",
    category: "food" as const,
    city: "İstanbul",
  };

  it("şablon kimlikleri benzersizdir ve kategorilere bağlıdır", () => {
    expect(new Set(STUDIO_TEMPLATES.map((template) => template.id)).size).toBe(
      STUDIO_TEMPLATES.length,
    );
    for (const template of STUDIO_TEMPLATES) {
      expect(studioTemplateById(template.id)).toEqual(template);
    }
  });

  it("dört restoran görünümü aynı motor üzerinde ayrı düzen ve metin kullanır", () => {
    const food = STUDIO_TEMPLATES.filter((template) => template.category === "food");
    expect(food.map((template) => template.id)).toEqual([
      "food-fast",
      "food-classic",
      "food-premium",
      "food-enterprise",
    ]);
    expect(new Set(food.map((template) => template.layout)).size).toBe(4);
    for (const template of food) {
      expect(template.eyebrow.length).toBeGreaterThan(0);
      expect(template.menuHeading.length).toBeGreaterThan(0);
      expect(studioInitialPalette(template.id)).toBeTruthy();
    }
  });

  it("yeni kurumsal şablon yalnızca yemek işletmesine atanır", () => {
    expect(
      createBusinessBodySchema.safeParse({ ...business, templateId: "food-enterprise" }).success,
    ).toBe(true);
    expect(
      createBusinessBodySchema.safeParse({
        ...business,
        category: "beauty",
        templateId: "food-enterprise",
      }).success,
    ).toBe(false);
  });

  it("renk paletleri benzersizdir; serbest CSS ve geçersiz sürüm reddedilir", () => {
    expect(new Set(STUDIO_PALETTES.map((palette) => palette.id)).size).toBe(STUDIO_PALETTES.length);
    const valid = {
      templateId: "food-fast",
      title: "Ahmet Usta Pilav",
      tagline: "Taze pilav",
      palette: "teal",
      expectedVersion: 1,
    };
    expect(saveStudioBodySchema.safeParse(valid).success).toBe(true);
    expect(saveStudioBodySchema.safeParse({ ...valid, palette: "url(evil)" }).success).toBe(false);
    expect(saveStudioBodySchema.safeParse({ ...valid, expectedVersion: -1 }).success).toBe(false);
    expect(saveStudioBodySchema.safeParse({ ...valid, title: "X".repeat(81) }).success).toBe(false);
    expect(saveStudioBodySchema.safeParse({ ...valid, tagline: "X".repeat(181) }).success).toBe(
      false,
    );
  });

  it("işletme görsellerinde yalnız UUID, null ve geçerli ürün sürümü kabul edilir", () => {
    const basic = {
      templateId: "food-fast",
      title: "Pilav",
      tagline: "Taze",
      palette: "teal",
      expectedVersion: 1,
    };
    expect(saveStudioBodySchema.parse(basic)).toMatchObject({
      logoMediaId: null,
      coverMediaId: null,
    });
    expect(
      saveStudioBodySchema.safeParse({ ...basic, logoMediaId: "https://example.com/a.svg" })
        .success,
    ).toBe(false);
    expect(
      saveStudioBodySchema.safeParse({ ...basic, coverMediaId: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(studioItemImageBodySchema.safeParse({ mediaId: null, expectedVersion: 1 }).success).toBe(
      true,
    );
    expect(studioItemImageBodySchema.safeParse({ mediaId: null, expectedVersion: 0 }).success).toBe(
      false,
    );
    expect(
      studioItemImageBodySchema.safeParse({ mediaId: null, expectedVersion: 1, businessId: "else" })
        .success,
    ).toBe(false);
  });

  it("yayın istekleri pozitif sürüm ister, fazladan yetki parametresi kabul etmez", () => {
    expect(publishStudioBodySchema.safeParse({ expectedVersion: 2 }).success).toBe(true);
    expect(publishStudioBodySchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
    expect(
      publishStudioBodySchema.safeParse({ expectedVersion: 2, businessId: "başka" }).success,
    ).toBe(false);
  });

  it("uygun restoran şablonu işletme başvurusuna eklenebilir", () => {
    expect(createBusinessBodySchema.parse({ ...business, templateId: "food-fast" })).toMatchObject({
      templateId: "food-fast",
    });
  });

  it("farklı sektörün şablonu seçilemez", () => {
    expect(
      createBusinessBodySchema.safeParse({ ...business, templateId: "beauty-team" }).success,
    ).toBe(false);
  });

  it("eski sürümlerin şablonsuz işletme başvurusu geçerlidir", () => {
    expect(createBusinessBodySchema.safeParse(business).success).toBe(true);
  });

  it("tanınmayan şablon kabul edilmez", () => {
    expect(
      createBusinessBodySchema.safeParse({ ...business, templateId: "bilinmeyen" }).success,
    ).toBe(false);
  });
});
