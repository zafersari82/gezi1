import { expect, it } from "vitest";

import { allocateDiscount, proportionalPoints } from "../src/modules/incentives/incentive-math";
it("eşit kuruş artıkları kararlı satır sırasıyla ve eksiksiz dağıtılır", () => {
  expect(allocateDiscount([1, 1, 1], 2)).toEqual([1, 1, 0]);
  expect(allocateDiscount([9, 1], 3)).toEqual([3, 0]);
  expect(allocateDiscount([0, 100, 300], 99)).toEqual([0, 25, 74]);
});
it("yüksek tutar ve sıfır indirim kayan nokta kaybı olmadan korunur", () => {
  const weights = [99999999, 99999998, 99999997],
    discount = 99999997;
  const allocations = allocateDiscount(weights, discount);
  expect(allocations.reduce((sum, n) => sum + n, 0)).toBe(discount);
  allocations.forEach((n, i) => {
    expect(n).toBeLessThanOrEqual(weights[i] ?? 0);
  });
  expect(allocateDiscount([0, 0], 0)).toEqual([0, 0]);
});
it("negatif, kesirli ve toplamı aşan indirim reddedilir", () => {
  for (const [weights, amount] of [
    [[-1, 2], 1],
    [[1, 1], 3],
    [[1.5, 2], 1],
    [[1, 1], -1],
    [[1, 1], 0.5],
  ] as const) {
    expect(() => allocateDiscount(weights, amount)).toThrow(RangeError);
  }
});
it("kısmi puan iadeleri kümülatif aşağı yuvarlanır; son iade bütün kuruşu kapatır", () => {
  expect([333, 666, 1000].map((refund) => proportionalPoints(100, refund, 1000))).toEqual([
    33, 66, 100,
  ]);
  expect(proportionalPoints(1, 999, 1000)).toBe(0);
  expect(proportionalPoints(1, 1000, 1000)).toBe(1);
  expect(() => proportionalPoints(100, 1001, 1000)).toThrow(RangeError);
});
