import { branchPriceBatchBodySchema } from "../src/catalog";
import { expect, test } from "vitest";

const branchId = "32eb5811-4a8a-4102-bda0-14084b199ad1";
const itemId = "5209b0aa-d3aa-4f37-9d34-d7f8efdad237";
test("toplu fiyat sözleşmesi yabancı alanları, tekrarları ve yanlış tutarları reddeder", () => {
  const change = { itemId, expected: null, next: { amountMinor: 12500, vatBasisPoints: 1000 } };
  const valid = { branchId, changes: [change] };
  expect(branchPriceBatchBodySchema.safeParse(valid).success).toBe(true);
  expect(branchPriceBatchBodySchema.safeParse({ ...valid, businessId: branchId }).success).toBe(false);
  expect(branchPriceBatchBodySchema.safeParse({ ...valid, changes: [change, change] }).success).toBe(false);
  expect(branchPriceBatchBodySchema.safeParse({ ...valid, changes: [] }).success).toBe(false);
  expect(branchPriceBatchBodySchema.safeParse({ ...valid, changes: [{ ...change, next: { ...change.next, amountMinor: -1 } }] }).success).toBe(false);
  expect(branchPriceBatchBodySchema.safeParse({ ...valid, changes: [{ ...change, next: { ...change.next, vatBasisPoints: 10500 } }] }).success).toBe(false);
});
