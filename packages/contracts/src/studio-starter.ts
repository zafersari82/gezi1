import { z } from "zod";

import { type Category } from "./common";

/** İlk kurulum önerileridir; fiyat veya vergi oranı asla varsayılan olarak atanmaz. */
export const STUDIO_STARTER_ITEMS = [
  {
    id: "food-rice-chicken",
    category: "food",
    name: "Tavuklu pilav",
    description: "Günlük hazırlanan tavuklu pilav",
  },
  {
    id: "food-rice-chickpea",
    category: "food",
    name: "Nohutlu pilav",
    description: "Nohutlu pirinç pilavı",
  },
  { id: "food-ayran", category: "food", name: "Ayran", description: "Soğuk ayran" },
  {
    id: "food-doner",
    category: "food",
    name: "Döner dürüm",
    description: "Taze hazırlanan döner dürüm",
  },
  { id: "food-soup", category: "food", name: "Günün çorbası", description: "Günlük çorba" },
  { id: "food-toast", category: "food", name: "Kaşarlı tost", description: "Kaşarlı tost" },
  {
    id: "shop-water",
    category: "shopping",
    name: "Su (1,5 litre)",
    description: "Örnek market ürünü; gerçek fiyat ve stok mağazaya aittir",
  },
  {
    id: "shop-milk",
    category: "shopping",
    name: "Süt (1 litre)",
    description: "Örnek market ürünü; marka ve fiyat işletme tarafından düzenlenir",
  },
  {
    id: "shop-eggs",
    category: "shopping",
    name: "Yumurta",
    description: "Örnek market ürünü; paket bilgisi işletme tarafından girilir",
  },
  {
    id: "shop-pet-food",
    category: "shopping",
    name: "Evcil hayvan maması",
    description: "Marka, gramaj ve fiyatı mağaza belirler",
  },
  {
    id: "shop-cat-litter",
    category: "shopping",
    name: "Kedi kumu",
    description: "Örnek petshop ürünü",
  },
  {
    id: "shop-flowers",
    category: "shopping",
    name: "Mevsim çiçek buketi",
    description: "Örnek çiçekçi ürünü; görsel ve fiyat sonradan eklenir",
  },
  {
    id: "shop-orchid",
    category: "shopping",
    name: "Orkide",
    description: "Örnek çiçekçi ürünü",
  },
  {
    id: "beauty-haircut",
    category: "beauty",
    name: "Saç kesimi",
    description: "Saç kesimi hizmeti",
  },
  {
    id: "beauty-beard",
    category: "beauty",
    name: "Sakal tıraşı",
    description: "Sakal düzenleme hizmeti",
  },
  {
    id: "beauty-hairwash",
    category: "beauty",
    name: "Saç yıkama",
    description: "Saç yıkama hizmeti",
  },
  {
    id: "beauty-blowdry",
    category: "beauty",
    name: "Fön",
    description: "Saç şekillendirme hizmeti",
  },
  {
    id: "beauty-haircolor",
    category: "beauty",
    name: "Saç boyama",
    description: "Saç boyama hizmeti",
  },
  { id: "beauty-manicure", category: "beauty", name: "Manikür", description: "Manikür hizmeti" },
] as const satisfies readonly {
  id: string;
  category: Category;
  name: string;
  description: string;
}[];

export const studioStarterItemIdSchema = z.enum(
  STUDIO_STARTER_ITEMS.map((item) => item.id) as [
    (typeof STUDIO_STARTER_ITEMS)[number]["id"],
    ...(typeof STUDIO_STARTER_ITEMS)[number]["id"][],
  ],
);

/** Boş katalog ilk kez doldurulur; her hizmetin gerçek tutarı işletmeciye aittir. */
export const studioStarterCatalogBodySchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: studioStarterItemIdSchema,
            amountMinor: z.number().int().min(1).max(100_000_000),
            vatBasisPoints: z.number().int().min(0).max(10_000),
          })
          .strict(),
      )
      .min(1)
      .max(STUDIO_STARTER_ITEMS.length),
  })
  .strict()
  .refine((body) => new Set(body.items.map((item) => item.id)).size === body.items.length, {
    message: "Aynı öneri iki kez seçilemez.",
  });
export type StudioStarterCatalogBody = z.infer<typeof studioStarterCatalogBodySchema>;

export const studioStarterCatalogResultSchema = z.object({ imported: z.number().int().positive() });
