import type { DeliverySummary } from "@vado/contracts";
import { describe, expect, it } from "vitest";

import { unmetDeliveryMinimum } from "../cart-rules";

const delivery: DeliverySummary = {
  areaId: "550e8400-e29b-41d4-a716-446655440000",
  areaVersion: 1,
  regionVersion: 1,
  feeMinor: 2_500,
  minimumMinor: 15_000,
  deliveryMinutes: 40,
  preparationMinutes: 15,
  slotMinutes: 30,
  scheduledAt: null,
};

describe("teslimat alt sınırı", () => {
  it("teslimat ücretini ürün tutarına saymaz", () => {
    // 149,99 TL ürün + 25 TL teslimat: ürün tutarı 150 TL'nin altında kalır.
    expect(
      unmetDeliveryMinimum({ fulfilment: "delivery", delivery, totalMinor: 14_999 + 2_500 }),
    ).toBe(15_000);
    expect(
      unmetDeliveryMinimum({ fulfilment: "delivery", delivery, totalMinor: 15_000 + 2_500 }),
    ).toBeNull();
  });
  it("gel-al ve henüz teslimat bilgisi olmayan sepette sınır yoktur", () => {
    expect(
      unmetDeliveryMinimum({ fulfilment: "pickup", delivery: null, totalMinor: 100 }),
    ).toBeNull();
    expect(unmetDeliveryMinimum({ fulfilment: "delivery", totalMinor: 100 })).toBeNull();
    expect(unmetDeliveryMinimum(null)).toBeNull();
  });
});
