import * as contracts from "@vado/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";

function schema(name: string): z.ZodType {
  const value: unknown = Reflect.get(contracts, name);
  expect(value, `${name} sözleşmesi yayımlanmalıdır`).toBeInstanceOf(z.ZodType);
  if (!(value instanceof z.ZodType)) throw new Error("Sözleşme yayımlanmadı");
  return value;
}

describe("Restoranın doğrulanmış sözleşmeleri", () => {
  it("gel-al hazırlık süresinin sıfır ve kesirli olmasını reddeder", () => {
    const setting = schema("branchOrderingSettingsBodySchema");
    expect(setting.safeParse({ expectedVersion: 0, preparationMinutes: 20 }).success).toBe(true);
    expect(setting.safeParse({ expectedVersion: 0, preparationMinutes: 0 }).success).toBe(false);
    expect(setting.safeParse({ expectedVersion: 0, preparationMinutes: 1.5 }).success).toBe(false);
  });
  it("geceye taşan menüyü kabul edip bir günden uzun ve ters aralığı reddeder", () => {
    const window = schema("menuWindowBodySchema");
    const body = { weekday: 2, opensAt: 1320, closesAt: 1560 };
    expect(window.safeParse(body).success).toBe(true);
    expect(window.safeParse({ ...body, closesAt: 1300 }).success).toBe(false);
    expect(window.safeParse({ ...body, closesAt: 2800 }).success).toBe(false);
  });
  it("tarihli tatil istisnasında geçersiz tarihi ve çakışan saatleri reddeder", () => {
    const hours = schema("branchHoursExceptionBodySchema");
    expect(hours.safeParse({ date: "2026-10-06", expectedVersion: 0, hours: [] }).success).toBe(
      true,
    );
    expect(hours.safeParse({ date: "2026-02-30", expectedVersion: 0, hours: [] }).success).toBe(
      false,
    );
    expect(
      hours.safeParse({
        date: "2026-10-06",
        expectedVersion: 0,
        hours: [
          { opensAt: 600, closesAt: 800 },
          { opensAt: 700, closesAt: 900 },
        ],
      }).success,
    ).toBe(false);
  });
  it("kabulde hazırlık süresini ve rette açıklanabilir bir gerekçeyi zorunlu tutar", () => {
    const accept = schema("acceptOrderBodySchema");
    const reject = schema("rejectOrderBodySchema");
    expect(accept.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(accept.safeParse({ expectedVersion: 1, preparationMinutes: 15 }).success).toBe(true);
    expect(reject.safeParse({ expectedVersion: 1, reason: "  " }).success).toBe(false);
    expect(reject.safeParse({ expectedVersion: 1, reason: "Ürün tükendi" }).success).toBe(true);
  });
  it("tahsilatta çevrimiçi ödeme ve istemciden tutar verilmesini reddeder", () => {
    const payment = schema("recordOrderPaymentBodySchema");
    expect(
      payment.safeParse({ expectedPaymentVersion: 0, place: "counter", method: "cash" }).success,
    ).toBe(true);
    expect(
      payment.safeParse({ expectedPaymentVersion: 0, place: "online", method: "cash" }).success,
    ).toBe(false);
    expect(
      payment.safeParse({
        expectedPaymentVersion: 0,
        place: "table",
        method: "card",
        amountMinor: 1,
      }).success,
    ).toBe(false);
  });
  it("ortak cihaz onayında şube ve uygulama örneğini zorunlu tutar", () => {
    const approve = schema("approveKitchenDeviceBodySchema");
    expect(approve.safeParse({ code: "12345678", label: "Mutfak" }).success).toBe(false);
    expect(
      approve.safeParse({
        code: "12345678",
        label: "Mutfak",
        branchId: "b3f820a9-950e-40c9-b68e-b26d6b0028ca",
        appInstanceId: "479cae57-fb73-44c9-b2ba-8d4539c08996",
      }).success,
    ).toBe(true);
  });
});
