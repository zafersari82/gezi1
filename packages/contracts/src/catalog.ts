import { z } from "zod";

import { idSchema } from "./common";

export const moneyMinorSchema = z.number().int().min(0).max(100_000_000);
export const vatBasisPointsSchema = z.number().int().min(0).max(10_000);
export const catalogCategoryBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  active: z.boolean().default(true),
});
export type CatalogCategoryBody = z.infer<typeof catalogCategoryBodySchema>;
export const catalogCategorySchema = catalogCategoryBodySchema.extend({
  id: idSchema,
  businessId: idSchema,
});
export const catalogPriceBodySchema = z.object({
  branchId: idSchema.nullable().default(null),
  amountMinor: moneyMinorSchema,
  vatBasisPoints: vatBasisPointsSchema,
});
export type CatalogPriceBody = z.infer<typeof catalogPriceBodySchema>;
export const catalogPriceSchema = catalogPriceBodySchema.extend({
  id: idSchema,
  itemId: idSchema,
  currency: z.literal("TRY"),
});
/** A branch override is distinct from the inherited company-wide price. */
export const branchPriceValueSchema = z.object({
  amountMinor: moneyMinorSchema,
  vatBasisPoints: vatBasisPointsSchema,
}).strict();
export const branchPriceBatchBodySchema = z.object({
  branchId: idSchema,
  changes: z.array(z.object({
    itemId: idSchema,
    expected: branchPriceValueSchema.nullable(),
    next: branchPriceValueSchema.nullable(),
  }).strict()).min(1).max(100),
}).strict().refine((body) => new Set(body.changes.map((change) => change.itemId)).size === body.changes.length, {
  message: "Aynı ürün tek istekte iki kez değiştirilemez.",
});
export type BranchPriceBatchBody = z.infer<typeof branchPriceBatchBodySchema>;
export const branchPriceBatchResultSchema = z.object({ updated: z.number().int().min(1).max(100) });

export const catalogItemBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(""),
  categoryId: idSchema.nullable().default(null),
  sku: z.string().trim().min(1).max(80).nullable().default(null),
  active: z.boolean().default(true),
  available: z.boolean().default(true),
  price: catalogPriceBodySchema,
});
export type CatalogItemBody = z.infer<typeof catalogItemBodySchema>;
export const catalogItemSchema = catalogItemBodySchema.omit({ price: true }).extend({
  id: idSchema,
  businessId: idSchema,
  version: z.number().int().positive(),
  imageMediaId: idSchema.nullable(),
  imageUrl: z.url().nullable(),
  optionGroupIds: z.array(idSchema),
});
export const catalogOptionBodySchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(80),
  priceDeltaMinor: moneyMinorSchema.default(0),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});
export const catalogOptionSchema = catalogOptionBodySchema.extend({
  id: idSchema,
  groupId: idSchema,
});
export const catalogOptionGroupBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    minSelected: z.number().int().min(0).max(20).default(0),
    maxSelected: z.number().int().min(0).max(20).default(1),
    active: z.boolean().default(true),
    options: z.array(catalogOptionBodySchema).max(100),
  })
  .refine(
    (body) =>
      body.maxSelected >= body.minSelected &&
      (!body.active || body.options.filter((option) => option.active).length >= body.minSelected) &&
      new Set(body.options.flatMap((option) => (option.id === undefined ? [] : [option.id])))
        .size === body.options.filter((option) => option.id !== undefined).length,
  );
export type CatalogOptionGroupBody = z.infer<typeof catalogOptionGroupBodySchema>;
export const catalogOptionGroupSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  name: z.string(),
  minSelected: z.number().int(),
  maxSelected: z.number().int(),
  active: z.boolean(),
  options: z.array(catalogOptionSchema),
});
export const itemOptionGroupsBodySchema = z
  .object({ groupIds: z.array(idSchema).max(20) })
  .refine((body) => new Set(body.groupIds).size === body.groupIds.length);
export const catalogSchema = z.object({
  categories: z.array(catalogCategorySchema),
  items: z.array(catalogItemSchema),
  optionGroups: z.array(catalogOptionGroupSchema),
  prices: z.array(catalogPriceSchema),
});
export type Catalog = z.infer<typeof catalogSchema>;

export const catalogSelectionSchema = z
  .object({
    itemId: idSchema,
    quantity: z.number().int().min(1).max(99),
    optionIds: z.array(idSchema).max(100),
    note: z.string().trim().max(500).optional(),
  })
  .refine((line) => new Set(line.optionIds).size === line.optionIds.length);
export type CatalogSelection = z.infer<typeof catalogSelectionSchema>;
export interface PricedOption {
  id: string;
  name: string;
  priceDeltaMinor: number;
}
export interface PricedLine extends CatalogSelection {
  name: string;
  available: boolean;
  unitPriceMinor: number;
  totalMinor: number;
  vatBasisPoints: number;
  vatMinor: number;
  options: PricedOption[];
}

export const catalogQuoteBodySchema = z.object({
  branchId: idSchema,
  lines: z.array(catalogSelectionSchema).max(100),
});
export const shellBusinessParamsSchema = z.object({
  businessId: idSchema,
  appInstanceId: idSchema,
});
export const catalogBranchQuerySchema = z.object({
  branchId: idSchema,
  includeUnavailable: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  at: z.iso.datetime({ offset: true }).optional(),
});
