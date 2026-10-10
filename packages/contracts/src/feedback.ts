import { z } from "zod";

import { idSchema, timestampSchema } from "./common";

const comment = z.string().trim().max(1000);
export const reviewBodySchema = z
  .object({
    expectedOrderVersion: z.number().int().positive(),
    rating: z.number().int().min(1).max(5),
    comment,
  })
  .strict();
export const reviewEditBodySchema = reviewBodySchema
  .omit({ expectedOrderVersion: true })
  .extend({ expectedVersion: z.number().int().positive() });
export const reviewReplyBodySchema = z
  .object({ expectedVersion: z.number().int().positive(), reply: comment.min(1) })
  .strict();
export const reviewSchema = z
  .object({
    id: idSchema,
    businessId: idSchema,
    orderId: idSchema,
    businessCustomerId: idSchema,
    rating: z.number().int().min(1).max(5),
    comment,
    reply: comment.nullable(),
    visibility: z.enum(["published", "hidden"]),
    version: z.number().int().positive(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type Review = z.infer<typeof reviewSchema>;
export type ReviewBody = z.infer<typeof reviewBodySchema>;
export type ReviewEditBody = z.infer<typeof reviewEditBodySchema>;
export type ReviewReplyBody = z.infer<typeof reviewReplyBodySchema>;
export const favoriteBodySchema = z
  .object({
    itemId: idSchema.nullable(),
    value: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export const favoriteSchema = z
  .object({
    id: idSchema,
    businessId: idSchema,
    itemId: idSchema.nullable(),
    value: z.boolean(),
    version: z.number().int().positive(),
    name: z.string(),
    available: z.boolean(),
  })
  .strict();
export type FavoriteBody = z.infer<typeof favoriteBodySchema>;
export type Favorite = z.infer<typeof favoriteSchema>;
