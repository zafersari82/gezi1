import { z } from "zod";

import { moneyMinorSchema } from "./catalog";
import { idSchema, timestampSchema } from "./common";
import { locationAddressSchema } from "./location";
export const deliveryRegionBodySchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    feeMinor: moneyMinorSchema,
    minimumMinor: moneyMinorSchema,
    deliveryMinutes: z.number().int().min(1).max(240),
    active: z.boolean(),
  })
  .strict();
export type DeliveryRegionBody = z.infer<typeof deliveryRegionBodySchema>;
export const deliveryQuoteSchema = z.object({
  areaId: idSchema,
  areaVersion: z.number().int().positive(),
  regionVersion: z.number().int().positive(),
  feeMinor: moneyMinorSchema,
  minimumMinor: moneyMinorSchema,
  deliveryMinutes: z.number().int().positive(),
  preparationMinutes: z.number().int().positive(),
  slotMinutes: z.number().int().positive(),
  address: locationAddressSchema,
  scheduledAt: timestampSchema.nullable(),
});
export type DeliveryQuote = z.infer<typeof deliveryQuoteSchema>;

export const deliveryQuoteBodySchema = z
  .object({ branchId: idSchema, addressId: idSchema, scheduledAt: timestampSchema.optional() })
  .strict();
export type DeliveryQuoteBody = z.infer<typeof deliveryQuoteBodySchema>;
export const deliverySummarySchema = deliveryQuoteSchema.omit({ address: true });
export type DeliverySummary = z.infer<typeof deliverySummarySchema>;
