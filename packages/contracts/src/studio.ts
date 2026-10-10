import { z } from "zod";

import { categorySchema, idSchema, type Category } from "./common";

/** Tek bir mini uygulama motoru, birden çok mağaza görünümüne hizmet eder. */
export const studioTemplateIdSchema = z.enum([
  "food-fast",
  "food-classic",
  "food-premium",
  "food-enterprise",
  "beauty-solo",
  "beauty-team",
  "beauty-premium",
]);
export type StudioTemplateId = z.infer<typeof studioTemplateIdSchema>;

export interface StudioTemplate {
  id: StudioTemplateId;
  category: Category;
  name: string;
  description: string;
  /** Kullanıcıya yalnızca basit bir önizleme sunar; yayınlanmış bir mini uygulama değildir. */
  accent: string;
  layout: "compact" | "classic" | "editorial" | "enterprise";
  eyebrow: string;
  menuHeading: string;
}

/** Şablon kimlikleri ve ilk görünüm önerileri istemci ile sunucunun ortak sözleşmesidir. */
export const STUDIO_TEMPLATES: readonly StudioTemplate[] = [
  {
    id: "food-fast",
    category: "food",
    name: "Hızlı Servis",
    description: "Pilavcı, dönerci ve paket servis için sade menü.",
    accent: "#155e63",
    layout: "compact",
    eyebrow: "Hızlı seçim, kolay sipariş",
    menuHeading: "Hemen sipariş ver",
  },
  {
    id: "food-classic",
    category: "food",
    name: "Klasik Restoran",
    description: "Masa, gel-al ve paket siparişe uygun başlangıç.",
    accent: "#315b48",
    layout: "classic",
    eyebrow: "Menümüze hoş geldiniz",
    menuHeading: "Menümüz",
  },
  {
    id: "food-premium",
    category: "food",
    name: "Seçkin Restoran",
    description: "Fotoğrafları öne çıkaran ferah görünüm.",
    accent: "#364665",
    layout: "editorial",
    eyebrow: "Özenle hazırlanan lezzetler",
    menuHeading: "Lezzetleri keşfedin",
  },
  {
    id: "food-enterprise",
    category: "food",
    name: "Kurumsal Zincir",
    description: "Çok şubeli markalar için net menü ve şube seçimi.",
    accent: "#364665",
    layout: "enterprise",
    eyebrow: "Markanın VADO mağazası",
    menuHeading: "Ürün kataloğu",
  },
  {
    id: "beauty-solo",
    category: "beauty",
    name: "Tek Kişilik Berber",
    description: "Tek çalışanlı berber için başlangıç taslağı.",
    accent: "#155e63",
    layout: "compact",
    eyebrow: "Mahalle berberiniz",
    menuHeading: "Hizmetlerimiz",
  },
  {
    id: "beauty-team",
    category: "beauty",
    name: "Ekipli Salon",
    description: "Birden çok çalışan için başlangıç taslağı.",
    accent: "#50637b",
    layout: "classic",
    eyebrow: "Ekibimizle hizmetinizdeyiz",
    menuHeading: "Hizmetlerimiz",
  },
  {
    id: "beauty-premium",
    category: "beauty",
    name: "Seçkin Salon",
    description: "Hizmet ve fotoğraf odaklı başlangıç taslağı.",
    accent: "#7b5969",
    layout: "editorial",
    eyebrow: "Özenli bir deneyim",
    menuHeading: "Hizmetlerimiz",
  },
];

export function studioTemplateById(id: StudioTemplateId): StudioTemplate {
  const template = STUDIO_TEMPLATES.find((item) => item.id === id);
  if (template === undefined) throw new Error(`Bilinmeyen stüdyo şablonu: ${id}`);
  return template;
}

/** Sabit renk seti: telefondan seçilir, istemciden rastgele CSS alınmaz. */
export const STUDIO_PALETTES = [
  { id: "teal", name: "Deniz yeşili", accent: "#155e63", surface: "#edf5f2" },
  { id: "forest", name: "Doğal yeşil", accent: "#315b48", surface: "#edf4ef" },
  { id: "navy", name: "Lacivert", accent: "#364665", surface: "#eff2f8" },
  { id: "plum", name: "Mürdüm", accent: "#754d68", surface: "#f6eff3" },
] as const;
export const studioPaletteIdSchema = z.enum(["teal", "forest", "navy", "plum"]);

/** Her başlangıç şablonuna uygun ilk renk; kullanıcı sonradan değiştirebilir. */
export function studioInitialPalette(templateId: StudioTemplateId): StudioPaletteId {
  if (["food-premium", "food-enterprise", "beauty-team"].includes(templateId)) return "navy";
  if (templateId === "beauty-premium") return "plum";
  if (templateId === "food-classic") return "forest";
  return "teal";
}
export type StudioPaletteId = z.infer<typeof studioPaletteIdSchema>;

export function studioPaletteById(id: StudioPaletteId) {
  const palette = STUDIO_PALETTES.find((item) => item.id === id);
  if (palette === undefined) throw new Error(`Bilinmeyen renk paleti: ${id}`);
  return palette;
}

/** Tasarım verileri işlem/sipariş kayıtlarından bağımsızdır; tamamı taslak olarak kalır. */
export const studioDesignSchema = z.object({
  templateId: studioTemplateIdSchema,
  title: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(180),
  palette: studioPaletteIdSchema,
  logoMediaId: idSchema.nullable().default(null),
  coverMediaId: idSchema.nullable().default(null),
});
export type StudioDesign = z.infer<typeof studioDesignSchema>;

export const saveStudioBodySchema = studioDesignSchema.extend({
  expectedVersion: z.number().int().nonnegative(),
});
export type SaveStudioBody = z.infer<typeof saveStudioBodySchema>;

/** Yalnızca sunucunun kayıtlı medya deposundan ürettiği adresler. */
export const studioStorefrontSchema = studioDesignSchema.extend({
  logoUrl: z.url().nullable(),
  coverUrl: z.url().nullable(),
});

export const studioConfigurationSchema = studioStorefrontSchema.extend({
  status: z.enum(["draft", "ready"]),
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});
export type StudioConfiguration = z.infer<typeof studioConfigurationSchema>;
/** Yayın işlemi yalnızca sahibin son gördüğü taslak sürümünü kabul eder. */
export const publishStudioBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
}).strict();
export type PublishStudioBody = z.infer<typeof publishStudioBodySchema>;

export const studioConfigurationResponseSchema = z.object({
  configuration: studioConfigurationSchema.nullable(),
  published: studioStorefrontSchema.nullable(),
  publishedVersion: z.number().int().nonnegative(),
  publishedAt: z.iso.datetime().nullable(),
  businessName: z.string(),
  category: categorySchema,
});

/** Görsel iliştirme isteğinde kimlik ve sürüm sunucuda yeniden doğrulanır. */
export const studioItemImageBodySchema = z.object({
  mediaId: idSchema.nullable(),
  expectedVersion: z.number().int().positive(),
}).strict();
export type StudioItemImageBody = z.infer<typeof studioItemImageBodySchema>;
