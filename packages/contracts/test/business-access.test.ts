import { describe, expect, it } from "vitest";

import {
  type AccessGrant,
  branchAvailabilityBatchBodySchema,
  BUSINESS_PERMISSIONS,
  businessPermissionSchema,
  MAX_ACCESS_GRANTS,
  memberAccessBodySchema,
  normaliseAccessGrants,
  staffInvitationCreateSchema,
} from "../src/index";

const BRANCH = "6f1b8a6e-2b8f-4c55-9d1e-0a7c6f1b2c3d";
const OTHER_BRANCH = "0b4c2d1e-9a8f-4e7d-8c6b-5a4f3e2d1c0b";
const REGION = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("işletme izin sözleşmesi", () => {
  it("her izin katalogda tanımlı; içerilen izinler de katalogda", () => {
    for (const permission of businessPermissionSchema.options) {
      const definition = BUSINESS_PERMISSIONS[permission];
      expect(definition.label.length).toBeGreaterThan(0);
      for (const implied of definition.implies)
        expect(businessPermissionSchema.options).toContain(implied);
    }
  });

  it("sipariş işleme izni aynı kapsamda sipariş görmeyi de verir; tekrarlar atılır", () => {
    const grants: AccessGrant[] = [
      { permission: "orders.manage", scope: { kind: "branch", branchId: BRANCH } },
      { permission: "orders.manage", scope: { kind: "branch", branchId: BRANCH } },
      { permission: "reports.view", scope: { kind: "region", regionId: REGION } },
    ];
    expect(normaliseAccessGrants(grants)).toEqual([
      { permission: "orders.manage", scope: { kind: "branch", branchId: BRANCH } },
      { permission: "orders.view", scope: { kind: "branch", branchId: BRANCH } },
      { permission: "reports.view", scope: { kind: "region", regionId: REGION } },
    ]);
    // Sıra istemciden bağımsızdır: aynı izinler her cihazda aynı biçime iner.
    expect(normaliseAccessGrants([...grants].reverse())).toEqual(normaliseAccessGrants(grants));
  });

  it("bilinmeyen izin, kapsam ya da fazladan alan reddedilir", () => {
    const valid = {
      grants: [{ permission: "orders.view", scope: { kind: "business" } }],
      expectedVersion: 1,
    };
    expect(memberAccessBodySchema.safeParse(valid).success).toBe(true);
    for (const body of [
      { ...valid, grants: [{ permission: "prices.edit", scope: { kind: "business" } }] },
      { ...valid, grants: [{ permission: "orders.view", scope: { kind: "country" } }] },
      {
        ...valid,
        grants: [{ permission: "orders.view", scope: { kind: "branch", branchId: BRANCH, x: 1 } }],
      },
      { ...valid, role: "manager" },
      { ...valid, expectedVersion: 0 },
      {
        ...valid,
        grants: Array.from({ length: MAX_ACCESS_GRANTS + 1 }, () => valid.grants[0]),
      },
    ])
      expect(memberAccessBodySchema.safeParse(body).success).toBe(false);
  });

  it("davet en az bir izin taşır ve rol seçtirmez", () => {
    const grants = [{ permission: "orders.view", scope: { kind: "branch", branchId: BRANCH } }];
    expect(staffInvitationCreateSchema.safeParse({ phone: "0532 000 00 00", grants }).success).toBe(
      true,
    );
    expect(
      staffInvitationCreateSchema.safeParse({ phone: "0532 000 00 00", grants: [] }).success,
    ).toBe(false);
    expect(
      staffInvitationCreateSchema.safeParse({ phone: "0532 000 00 00", grants, role: "manager" })
        .success,
    ).toBe(false);
  });
});

describe("çok şubeli bulunurluk sözleşmesi", () => {
  it("aynı ürünü tekrar, yabancı alanı ve boş listeyi reddeder", () => {
    const change = { itemId: OTHER_BRANCH, expectedVersion: 0, available: false };
    expect(
      branchAvailabilityBatchBodySchema.safeParse({ branchId: BRANCH, changes: [change] }).success,
    ).toBe(true);
    for (const body of [
      { branchId: BRANCH, changes: [] },
      { branchId: BRANCH, changes: [change, change] },
      { branchId: BRANCH, changes: [change], businessId: REGION },
      { branchId: BRANCH, changes: [{ ...change, expectedVersion: -1 }] },
    ])
      expect(branchAvailabilityBatchBodySchema.safeParse(body).success).toBe(false);
  });
});
