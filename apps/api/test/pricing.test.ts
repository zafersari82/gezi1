import { describe, expect, test } from "vitest";

import { includedVat } from "../src/modules/catalog/pricing";

describe("Kuruş bazında KDV ayırma", () => {
  test.each([
    [25000, 1000, 2273],
    [27000, 2000, 4500],
    [1, 10000, 1],
    [5, 10000, 3],
    [100000000, 2000, 16666667],
    [12345, 0, 0],
  ])("%i kuruş ve %i oranı %i kuruş vergi verir", (amount, rate, expected) => {
    expect(includedVat(amount, rate)).toBe(expected);
  });
  test("negatif, kesirli ve güvenli sayı sınırını aşan girdi reddedilir", () => {
    for (const amount of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1])
      expect(() => includedVat(amount, 2000)).toThrow(RangeError);
    for (const rate of [-1, 0.1, 10001]) expect(() => includedVat(1000, rate)).toThrow(RangeError);
  });
});
