import { z } from "zod";

import { businessSchema } from "./businesses";
import { categorySchema, idSchema } from "./common";
import { miniAppSchema } from "./miniapps";

/** Sunucuda filtrelenen, bütün işletme ve mini uygulamaları kapsayan keşif sorgusu. */
export const discoveryQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(80)
      .refine(
        (q) => q.split(/\s+/).filter(Boolean).length <= 8,
        "En fazla 8 arama sözcüğü kullanın.",
      )
      .default(""),
    kind: z.enum(["all", "business", "miniapp"]).default("all"),
    category: categorySchema.optional(),
    /** Kullanıcının isteğe bağlı seçtiği yer; GPS koordinatları saklanmaz. */
    provinceId: idSchema.optional(),
    districtId: idSchema.optional(),
    /** Giriş yapan kullanıcının kayıtlı ve etkin adresiyle kesin mahalle eşleşmesi. */
    deliveryAddressId: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(40).default(20),
    cursor: z.string().min(1).max(512).optional(),
  })
  .refine((query) => query.districtId === undefined || query.provinceId !== undefined, {
    message: "İlçe için önce il seçilmeli.",
    path: ["provinceId"],
  })
  .refine((query) => query.deliveryAddressId === undefined || query.kind === "business", {
    message: "Adrese teslimat keşfi yalnız işletmeler içindir.",
    path: ["kind"],
  });
export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;

export const discoveryDeliverySchema = z.object({
  branchId: idSchema,
  branchName: z.string(),
  feeMinor: z.number().int().nonnegative(),
  minimumMinor: z.number().int().nonnegative(),
  deliveryMinutes: z.number().int().positive(),
});

export const discoveryItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("business"),
    business: businessSchema,
    /** Yalnız adresle eşlenen teslimat keşif sonuçlarında bulunur. */
    delivery: discoveryDeliverySchema.optional(),
  }),
  z.object({ kind: z.literal("miniapp"), miniApp: miniAppSchema }),
]);
export type DiscoveryItem = z.infer<typeof discoveryItemSchema>;
export const discoveryPageSchema = z.object({
  items: z.array(discoveryItemSchema),
  nextCursor: z.string().nullable(),
});
export type DiscoveryPage = z.infer<typeof discoveryPageSchema>;
