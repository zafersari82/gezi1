import { randomUUID } from "node:crypto";

import { branchAvailabilityBatchBodySchema, branchAvailabilityGrantBodySchema } from "../src/index";
import { describe, expect, it } from "vitest";

describe("Çok şubeli bulunurluk sözleşmesi", () => {
  it("aynı ürünü tekrar, yabancı alanı ve boş listeyi reddeder", () => {
    const branchId = randomUUID();
    const itemId = randomUUID();
    const change = { itemId, expectedVersion: 0, available: false };
    expect(branchAvailabilityBatchBodySchema.safeParse({ branchId, changes: [change] }).success).toBe(true);
    for (const body of [
      { branchId, changes: [] },
      { branchId, changes: [change, change] },
      { branchId, changes: [change], businessId: randomUUID() },
      { branchId, changes: [{ ...change, expectedVersion: -1 }] },
    ]) expect(branchAvailabilityBatchBodySchema.safeParse(body).success).toBe(false);
  });
  it("personel yetkisi isteği başka alanlara izin vermez", () => {
    expect(branchAvailabilityGrantBodySchema.safeParse({ userId: randomUUID(), allowed: true }).success).toBe(true);
    expect(branchAvailabilityGrantBodySchema.safeParse({ userId: randomUUID(), allowed: true, role: "owner" }).success).toBe(false);
  });
});
