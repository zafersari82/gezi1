import { z } from "zod";

import { idSchema } from "./common";
import { studioStorefrontSchema } from "./studio";

/** Müşteriye açık mağaza, restoran veya hizmet işletmesinin ortak vitrin bağlamı. */
export const storeContextSchema = z.object({
  businessId: idSchema,
  appInstanceId: idSchema,
  businessName: z.string(),
  storefront: studioStorefrontSchema.nullable(),
  capabilities: z.array(z.string()),
  branches: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      timezone: z.string(),
      address: z.string(),
      openNow: z.boolean(),
      preparationMinutes: z.number().int().min(1).max(240),
    }),
  ),
});
export type StoreContext = z.infer<typeof storeContextSchema>;

/** Alışveriş ile restoran, aynı ordering çekirdeğinin iki güvenli müşteri paketidir. */
export type CommerceMiniAppId = "restoran" | "magaza";
export function commerceMiniAppIdForCategory(category: string): CommerceMiniAppId | null {
  if (category === "food") return "restoran";
  if (category === "shopping") return "magaza";
  return null;
}
