import { expect, it } from "vitest";

import {
  incentiveChoiceSchema,
  incentiveQuoteSchema,
  incentiveRuleBodySchema,
} from "../src/incentives";
const rule = {
  name: "Kupon",
  kind: "coupon",
  code: "VADO10",
  discountType: "percentage",
  value: 1000,
  minimumMinor: 0,
  branchId: null,
  itemIds: [],
  startsAt: "2026-01-01T00:00:00Z",
  endsAt: "2027-01-01T00:00:00Z",
  totalLimit: 100,
  perCustomerLimit: 1,
  active: true,
};
it("yüzde yüzü aşan, yanlış dönemli ve yetki eklenmiş teşvik isteği reddedilir", () => {
  for (const change of [
    { value: 10001 },
    { value: -1 },
    { endsAt: rule.startsAt },
    { kind: "campaign" },
    { businessCustomerId: "başkası" },
  ])
    expect(incentiveRuleBodySchema.safeParse({ ...rule, ...change }).success).toBe(false);
  expect(incentiveRuleBodySchema.safeParse(rule).success).toBe(true);
});
it("indirim kaynakları ve satırların kuruş toplamı sözleşmede tutarlı olmalıdır", () => {
  const quote = {
    issues: [],
    settingsVersion: 1,
    earnBasisPoints: 1000,
    campaign: null,
    coupon: null,
    pointsSpent: 2,
    pointsToEarn: 0,
    discountMinor: 2,
    allocations: [1, 1, 0],
  };
  expect(incentiveQuoteSchema.safeParse(quote).success).toBe(true);
  expect(incentiveQuoteSchema.safeParse({ ...quote, allocations: [1, 0, 0] }).success).toBe(false);
  expect(incentiveQuoteSchema.safeParse({ ...quote, pointsSpent: 1 }).success).toBe(false);
});
it("puan harcaması kesir, negatif, yabancı kimlik ve aşırı tutar alamaz", () => {
  for (const body of [
    { couponCode: null, pointsToSpend: -1 },
    { couponCode: null, pointsToSpend: 1.5 },
    { couponCode: null, pointsToSpend: 100000001 },
    { couponCode: null, pointsToSpend: 0, userId: "başkası" },
  ])
    expect(incentiveChoiceSchema.safeParse(body).success).toBe(false);
});
