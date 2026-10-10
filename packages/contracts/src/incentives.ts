import { z } from "zod";

import { moneyMinorSchema } from "./catalog";
import { idSchema, timestampSchema } from "./common";
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
export const incentiveRuleBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["campaign", "coupon"]),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/)
      .nullable(),
    discountType: z.enum(["fixed", "percentage"]),
    value: z.number().int().min(1).max(100000000),
    minimumMinor: moneyMinorSchema,
    branchId: idSchema.nullable(),
    itemIds: z.array(idSchema).max(100),
    startsAt: timestampSchema,
    endsAt: timestampSchema,
    totalLimit: z.number().int().min(1).max(10000000).nullable(),
    perCustomerLimit: z.number().int().min(1).max(100000).nullable(),
    active: z.boolean(),
  })
  .strict()
  .superRefine((r, c) => {
    if ((r.kind === "coupon") !== (r.code !== null))
      c.addIssue({ code: "custom", message: "Kupon kodu yalnız kuponda zorunludur" });
    if (r.discountType === "percentage" && r.value > 10000)
      c.addIssue({ code: "custom", message: "Yüzde 100'ü aşamaz" });
    if (Date.parse(r.startsAt) >= Date.parse(r.endsAt))
      c.addIssue({ code: "custom", message: "Kampanya bitişi başlangıçtan sonra olmalıdır" });
    if (new Set(r.itemIds).size !== r.itemIds.length)
      c.addIssue({ code: "custom", message: "Ürünler yinelenemez" });
  });
export type IncentiveRuleBody = z.infer<typeof incentiveRuleBodySchema>;
export const updateIncentiveRuleBodySchema = incentiveRuleBodySchema.safeExtend({
  expectedVersion: z.number().int().positive(),
});
export const incentiveRuleSchema = incentiveRuleBodySchema.safeExtend({
  id: idSchema,
  businessId: idSchema,
  version: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type IncentiveRule = z.infer<typeof incentiveRuleSchema>;
export type IncentiveSettingsBody = z.infer<typeof incentiveSettingsBodySchema>;
export const incentiveSettingsBodySchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    stackCampaignCoupon: z.boolean(),
    earnBasisPoints: z.number().int().min(0).max(10000),
  })
  .strict();
export const incentiveSettingsSchema = z.object({
  version: z.number().int().min(0),
  stackCampaignCoupon: z.boolean(),
  earnBasisPoints: z.number().int().min(0).max(10000),
});
export const incentiveChoiceSchema = z
  .object({
    couponCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/)
      .nullable(),
    pointsToSpend: z.number().int().min(0).max(100000000),
  })
  .strict();
export type ApplyCartIncentivesBody = z.infer<typeof applyCartIncentivesBodySchema>;
export const applyCartIncentivesBodySchema = incentiveChoiceSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
export type IncentiveChoice = z.infer<typeof incentiveChoiceSchema>;
export const incentiveAppliedRuleSchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  name: z.string(),
  amountMinor: moneyMinorSchema,
});
export const incentiveQuoteSchema = z
  .object({
    issues: z.array(z.enum(["coupon_unavailable", "loyalty_insufficient", "stack_forbidden"])),
    settingsVersion: z.number().int().min(0),
    earnBasisPoints: z.number().int().min(0).max(10000),
    campaign: incentiveAppliedRuleSchema.nullable(),
    coupon: incentiveAppliedRuleSchema.nullable(),
    pointsSpent: z.number().int().min(0),
    pointsToEarn: z.number().int().min(0),
    discountMinor: moneyMinorSchema,
    allocations: z.array(moneyMinorSchema).max(100),
  })
  .superRefine((q, c) => {
    if (
      q.allocations.reduce((sum, n) => sum + n, 0) !== q.discountMinor ||
      (q.campaign?.amountMinor ?? 0) + (q.coupon?.amountMinor ?? 0) + q.pointsSpent !==
        q.discountMinor
    )
      c.addIssue({ code: "custom", message: "İndirim satırları ve kaynakları tam eşleşmelidir" });
  });
export type IncentiveQuote = z.infer<typeof incentiveQuoteSchema>;
export const loyaltyWalletSchema = z.object({
  balance: z.number().int(),
  available: z.number().int().min(0),
  version: z.number().int().min(0),
});
export type LoyaltyWallet = z.infer<typeof loyaltyWalletSchema>;
export const availableIncentivesSchema = z.object({
  settings: incentiveSettingsSchema,
  campaigns: z.array(incentiveRuleSchema),
  wallet: loyaltyWalletSchema,
});
