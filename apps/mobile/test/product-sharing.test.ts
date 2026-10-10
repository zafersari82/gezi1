import type { PublicShareProduct } from "@vado/contracts";
import { describe, expect, it } from "vitest";

import { productSharePreview } from "../src/features/sharing/shared-preview-data";
import {
  MESSAGE_LINK_PATTERN,
  parseSharedTarget,
  sharedPreviewTarget,
  sharedTargetMessage,
  sharedTargetUrl,
} from "../src/features/sharing/shared-target";

const B = "550e8400-e29b-41d4-a716-446655440000";
const S = "550e8400-e29b-41d4-a716-446655440001";
const I = "550e8400-e29b-41d4-a716-446655440002";
const TARGET = { kind: "product" as const, businessId: B, branchId: S, id: I };
const PRODUCT: PublicShareProduct = {
  id: I,
  businessId: B,
  branchId: S,
  branchName: "Merkez",
  name: "Tavuklu Pilav",
  description: "Taze",
  imageUrl: null,
  amountMinor: 15000,
  currency: "TRY",
};

describe("S5 ürün paylaşımı", () => {
  it("üç kapsamlı UUID olmadan ürün hedefine izin vermez", () => {
    expect(parseSharedTarget(sharedTargetUrl(TARGET))).toEqual(TARGET);
    for (const bad of [
      `vado:///products/${B}/${I}`,
      `vado:///products/${B}/${S}/${I}/manage`,
      `vado:///products/${B}/${S}/${I}?token=evil`,
      `vado:///products/../${S}/${I}`,
    ])
      expect(parseSharedTarget(bad)).toBeNull();
  });
  it("mesaj ve bağlantı ayrıştırıcısı aynı ürünü işaret eder", () => {
    const message = sharedTargetMessage("Tavuklu Pilav", TARGET);
    expect(sharedPreviewTarget(message)).toEqual(TARGET);
    expect(message.match(MESSAGE_LINK_PATTERN)).toEqual([sharedTargetUrl(TARGET)]);
  });
  it("başlık ve fiyat sadece doğrulanmış sunucu yanıtından alınır", () => {
    const result = productSharePreview(TARGET, PRODUCT);
    expect(result.title).toBe("Tavuklu Pilav");
    expect(result.caption).toContain("150");
    expect(JSON.stringify(result)).not.toContain("amountMinor");
    expect(() => productSharePreview(TARGET, { ...PRODUCT, businessId: I })).toThrow();
    expect(() => productSharePreview(TARGET, { ...PRODUCT, branchId: I })).toThrow();
  });
});
