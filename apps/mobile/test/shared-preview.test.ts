import { describe, expect, it } from "vitest";

import { sharedPreviewTarget, sharedTargetMessage } from "../src/features/sharing/shared-target";

const BUSINESS = "550e8400-e29b-41d4-a716-446655440000";

/** Kart yalnızca S3 paylaşım formatındaki tam, halka açık hedef için açılır. */
describe("VADO S4 paylaşım kartı hedefleri", () => {
  it("gönderilen işletme bağlantısından tek hedef çıkarır", () => {
    const body = sharedTargetMessage("Pilavcı", { kind: "business", id: BUSINESS });
    expect(sharedPreviewTarget(body)).toEqual({ kind: "business", id: BUSINESS });
  });
  it("mini uygulama kimliğini slug olarak okur", () => {
    expect(sharedPreviewTarget("vado:///miniapps/restaurant-v2")).toEqual({
      kind: "miniapp",
      id: "restaurant-v2",
    });
  });
  it("CRLF ile gönderilen paylaşımı tanır", () => {
    expect(sharedPreviewTarget(`Dükkan\r\nvado:///businesses/${BUSINESS}`)).toEqual({
      kind: "business",
      id: BUSINESS,
    });
  });
  it("normal sohbet mesajlarını kart yapmaz", () => {
    for (const text of [
      "Merhaba, nasılsın?",
      "https://example.com",
      "İki satır\nve başka söz",
      `Buna bak\nhemen\nvado:///businesses/${BUSINESS}`,
      `vado:///businesses/${BUSINESS}?token=secret`,
      `vado:///businesses/${BUSINESS}/admin`,
      "vado:///miniapps/UPPER",
      "vado://q/secret",
      "javascript:alert(1)",
    ])
      expect(sharedPreviewTarget(text)).toBeNull();
  });
  it("çok uzun ve sahte açıklama içeren mesajdan kart oluşturmaz", () => {
    expect(sharedPreviewTarget(`${"x".repeat(101)}\nvado:///businesses/${BUSINESS}`)).toBeNull();
  });
});
