import { describe, expect, it } from "vitest";

import { formatPhone, normalizePhone } from "../src";

describe("normalizePhone", () => {
  it.each([
    ["0555 123 45 67", "+905551234567"],
    ["555 123 45 67", "+905551234567"],
    ["90 555 123 45 67", "+905551234567"],
    ["+90 (555) 123-45-67", "+905551234567"],
    ["0090 555 123 45 67", "+905551234567"],
    ["+49 151 23456789", "+4915123456789"],
  ])("%s numarasını %s olarak kabul eder", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    ["", "boş"],
    ["   ", "yalnızca boşluk"],
    ["12345", "çok kısa"],
    ["0212 123 45 67", "Türkiye sabit hattı"],
    ["+90 555 123 45", "eksik haneli Türkiye numarası"],
    ["abc", "rakam olmayan"],
    ["+0 555 123 45 67", "sıfırla başlayan ülke kodu"],
  ])("%s (%s) numarasını reddeder", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("formatPhone", () => {
  it("Türkiye numarasını gruplar", () => {
    expect(formatPhone("+905551234567")).toBe("+90 555 123 45 67");
  });

  it("diğer ülkelerin numarasını değiştirmez", () => {
    expect(formatPhone("+4915123456789")).toBe("+4915123456789");
  });
});
