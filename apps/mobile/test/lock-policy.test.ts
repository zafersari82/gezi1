import { describe, expect, it } from "vitest";

import { LOCK_GRACE_MS, shouldLock } from "@/features/security/lock-policy";

describe("uygulama kilidi", () => {
  it("kilit kapalıyken arka plandan dönüşte kilitlemez", () => {
    expect(shouldLock(false, LOCK_GRACE_MS * 10)).toBe(false);
  });

  it("kısa süreli ayrılıklarda kilitlemez", () => {
    expect(shouldLock(true, LOCK_GRACE_MS - 1)).toBe(false);
  });

  it("uygulama yeterince uzun arka planda kaldıysa kilitler", () => {
    expect(shouldLock(true, LOCK_GRACE_MS)).toBe(true);
  });
});
