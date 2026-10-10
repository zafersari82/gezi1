import { z } from "zod";

import { idSchema } from "./common";

/** Kamusal ürün paylaşımı: linkte fiyat ve yetki bilgisi bulunmaz. */
export const productShareParamsSchema = z.object({
  businessId: idSchema,
  branchId: idSchema,
  itemId: idSchema,
});
export const productShareBranchParamsSchema = productShareParamsSchema.pick({ businessId: true });
export const productShareListParamsSchema = productShareParamsSchema.pick({
  businessId: true,
  branchId: true,
});
export const productShareListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
});
export const publicShareBranchSchema = z.object({ id: idSchema, name: z.string() });
export const publicShareProductSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  branchId: idSchema,
  branchName: z.string(),
  name: z.string(),
  description: z.string(),
  imageUrl: z.url().nullable(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.literal("TRY"),
});
export type PublicShareProduct = z.infer<typeof publicShareProductSchema>;
export type PublicShareBranch = z.infer<typeof publicShareBranchSchema>;
