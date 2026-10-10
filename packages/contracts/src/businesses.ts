import { z } from "zod";

import { categorySchema, idSchema } from "./common";
import { miniAppIdSchema, miniAppSchema } from "./miniapps";
import { studioStorefrontSchema, studioTemplateById, studioTemplateIdSchema } from "./studio";

export const BUSINESS_NAME_MAX = 80;
export const BUSINESS_DESCRIPTION_MAX = 500;

export const businessStatusSchema = z.enum(["pending", "active", "suspended"]);
export type BusinessStatus = z.infer<typeof businessStatusSchema>;

/** İşletme adresi: küçük harf, rakam ve tire (3-60 karakter). */
export const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/);

export const businessSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  category: categorySchema,
  description: z.string(),
  city: z.string(),
  verified: z.boolean(),
  status: businessStatusSchema,
});
export type Business = z.infer<typeof businessSchema>;

/** Müşteriye sunulabilen yayımlanmış vitrin alanları; medya ID'leri içermez. */
export const publicStorefrontSchema = studioStorefrontSchema.pick({
  templateId: true,
  title: true,
  tagline: true,
  palette: true,
  logoUrl: true,
  coverUrl: true,
});

export const businessDetailSchema = businessSchema.extend({
  miniApps: z.array(miniAppSchema),
  /** Müşteriye yalnızca yayımlanmış vitrin gösterilir, Studio taslağı asla gönderilmez. */
  storefront: publicStorefrontSchema.nullable(),
});
export type BusinessDetail = z.infer<typeof businessDetailSchema>;

/** İşletme vitrininin açabileceği etkin mini uygulama örneği; müşteriye özel sır içermez. */
export const businessMiniAppLaunchSchema = z.object({
  businessId: idSchema,
  appInstanceId: idSchema,
});
export type BusinessMiniAppLaunch = z.infer<typeof businessMiniAppLaunchSchema>;

/** Açılış isteğinin kayıt ve işletme kimlikleri; örnek ID'si sunucudan gelir. */
export const businessMiniAppLaunchParamsSchema = z
  .object({
    businessId: idSchema,
    miniAppId: miniAppIdSchema,
  })
  .strict();

export const businessListQuerySchema = z.object({
  category: categorySchema.optional(),
});
export type BusinessListQuery = z.infer<typeof businessListQuerySchema>;

export const createBusinessBodySchema = z
  .object({
    name: z.string().trim().min(2).max(BUSINESS_NAME_MAX),
    slug: slugSchema,
    category: categorySchema,
    description: z.string().trim().max(BUSINESS_DESCRIPTION_MAX).optional(),
    city: z.string().trim().min(2).max(60),
    /** Vergi kimlik numarası (10 hane) veya şahıs işletmeleri için T.C. kimlik numarası (11 hane). */
    taxNumber: z
      .string()
      .regex(/^\d{10,11}$/)
      .optional(),
    /** Şablon seçimi, yayınlama işlemi değildir; mağaza taslağı oluşturur. */
    templateId: studioTemplateIdSchema.optional(),
  })
  .refine(
    (value) =>
      value.templateId === undefined ||
      studioTemplateById(value.templateId).category === value.category,
    { message: "Şablon işletmenin kategorisiyle uyuşmuyor.", path: ["templateId"] },
  );
export type CreateBusinessBody = z.infer<typeof createBusinessBodySchema>;
