import { z } from "zod";

import { moneyMinorSchema } from "./catalog";
import { idSchema, timestampSchema } from "./common";
import { cartSchema } from "./ordering";
export const returnRequestBodySchema = z
  .object({
    kind: z.enum(["cancel", "refund"]),
    expectedOrderVersion: z.number().int().positive(),
    reason: z.string().trim().min(3).max(500),
    amountMinor: moneyMinorSchema.nullable(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (
      (body.kind === "cancel" && body.amountMinor !== null) ||
      (body.kind === "refund" && body.amountMinor === null)
    )
      ctx.addIssue({
        code: "custom",
        message: "İptalde tutar sunucudan alınır; iadede tutar zorunludur.",
      });
  });
export const physicalRefundSchema = z
  .object({ method: z.enum(["cash", "card"]), reference: z.string().trim().min(1).max(120) })
  .strict();
export const returnDecisionBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedOrderVersion: z.number().int().positive(),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().min(3).max(500),
    physicalRefund: physicalRefundSchema.nullable(),
  })
  .strict();
export const returnWithdrawBodySchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export const returnRequestSchema = z
  .object({
    id: idSchema,
    businessId: idSchema,
    orderId: idSchema,
    appInstanceId: idSchema,
    businessCustomerId: idSchema,
    orderVersion: z.number().int().positive(),
    kind: z.enum(["cancel", "refund"]),
    amountMinor: moneyMinorSchema,
    reason: z.string(),
    status: z.enum(["pending", "approved", "rejected", "withdrawn"]),
    decisionReason: z.string().nullable(),
    memberId: idSchema.nullable(),
    version: z.number().int().positive(),
    receipt: physicalRefundSchema
      .extend({ amountMinor: moneyMinorSchema, createdAt: timestampSchema })
      .nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type ReturnRequest = z.infer<typeof returnRequestSchema>;
export type ReturnRequestBody = z.infer<typeof returnRequestBodySchema>;
export type ReturnDecisionBody = z.infer<typeof returnDecisionBodySchema>;
export type ReturnWithdrawBody = z.infer<typeof returnWithdrawBodySchema>;
export const reorderBodySchema = z
  .object({
    branchId: idSchema,
    cartId: idSchema.nullable(),
    expectedVersion: z.number().int().nonnegative(),
    replace: z.boolean(),
  })
  .strict();
export const reorderResultSchema = z
  .object({
    cart: cartSchema,
    omitted: z.array(
      z
        .object({
          itemId: idSchema,
          name: z.string(),
          quantity: z.number().int().positive(),
          reason: z.enum(["unavailable", "options_changed"]),
        })
        .strict(),
    ),
    requiresConfirmation: z.boolean(),
    fulfilmentNeedsSelection: z.boolean(),
  })
  .strict();
export type ReorderBody = z.infer<typeof reorderBodySchema>;
export type ReorderResult = z.infer<typeof reorderResultSchema>;
