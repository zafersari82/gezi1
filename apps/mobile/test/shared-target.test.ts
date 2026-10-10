import { describe, expect, it } from "vitest";

import {
  MESSAGE_LINK_PATTERN,
  parseSharedTarget,
  sharedTargetMessage,
  sharedTargetUrl,
} from "../src/features/sharing/shared-target";

const BUSINESS = "550e8400-e29b-41d4-a716-446655440000";
const MINIAPP = "restaurant-v2";

describe("VADO paylaşım bağlantıları", () => {
  it("işletme ve mini uygulama hedeflerini doğru çözer", () => {
    expect(parseSharedTarget(`vado:///businesses/${BUSINESS}`)).toEqual({
      kind: "business",
      id: BUSINESS,
    });
    expect(parseSharedTarget(`vado:///miniapps/${MINIAPP}`)).toEqual({
      kind: "miniapp",
      id: MINIAPP,
    });
    expect(sharedTargetUrl({ kind: "miniapp", id: MINIAPP })).toBe(`vado:///miniapps/${MINIAPP}`);
  });
  it("yalnız tam ve kanonik hedefi kabul eder", () => {
    for (const value of [
      "https://evil.test/",
      `vado:///users/${BUSINESS}`,
      `vado:///businesses/${BUSINESS}/admin`,
      `vado:///miniapps/${BUSINESS}?token=secret`,
      "vado:///businesses/../admin",
      "vado:///miniapps/UPPER",
      "vado://q/invalid",
    ]) {
      expect(parseSharedTarget(value)).toBeNull();
    }
  });
  it("URL sadece görüntüleme adresi üretir ve mesaj içinde okunur", () => {
    const target = { kind: "business" as const, id: BUSINESS };
    const message = sharedTargetMessage("  Örnek Pilavcı  ", target);
    expect(message).toBe(`Örnek Pilavcı\n${sharedTargetUrl(target)}`);
    expect(message.match(MESSAGE_LINK_PATTERN)).toEqual([sharedTargetUrl(target)]);
  });
  it("hatalı kayıt kimliği paylaşılmaz", () => {
    // Mini uygulama kimliği UUID değil kısa addır; büyük harf ve alt çizgi geçersizdir.
    expect(() => sharedTargetUrl({ kind: "miniapp", id: "Not_Valid" })).toThrow();
    expect(() => sharedTargetUrl({ kind: "business", id: "not-uuid" })).toThrow();
    expect(() =>
      sharedTargetUrl({ kind: "product", id: BUSINESS, businessId: BUSINESS, branchId: "x" }),
    ).toThrow();
  });
});
