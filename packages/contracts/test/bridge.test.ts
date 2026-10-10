import { describe, expect, it } from "vitest";

import {
  BRIDGE_METHODS,
  bridgeConnectSchema,
  bridgeLeftSchema,
  bridgeParamsSchemas,
  bridgeRequestSchema,
  CAPABILITIES,
  CAPABILITY_LABELS,
  isBridgeMethod,
  pageQuerySchema,
  requiresConsent,
} from "../src";

describe("köprü protokolü", () => {
  it("her metodun yetkisi tanımlı yetkilerden biridir", () => {
    for (const capability of Object.values(BRIDGE_METHODS)) {
      if (capability !== null) expect(CAPABILITIES).toContain(capability);
    }
  });

  it("masa servisi yalnız yeni ad alanı ve kendi izniyle açılır", () => {
    for (const old of [
      "ordering.getRestaurant",
      "ordering.joinTable",
      "ordering.getTable",
      "ordering.getBill",
      "ordering.requestService",
    ]) expect(isBridgeMethod(old)).toBe(false);
    for (const method of [
      "tableService.join",
      "tableService.get",
      "tableService.getBill",
      "tableService.request",
    ] as const) {
      expect(isBridgeMethod(method)).toBe(true);
      expect(BRIDGE_METHODS[method]).toBe("table_service.basic");
    }
    expect(bridgeParamsSchemas["tableService.join"].safeParse(undefined).success).toBe(true);
    expect(bridgeParamsSchemas["tableService.get"].safeParse({ id: "bozuk" }).success).toBe(false);
    expect(bridgeParamsSchemas["tableService.get"].safeParse({
      id: "b2cd9772-164f-4300-b8c6-61a26a846790", businessId: "yabancı"
    }).success).toBe(false);
  });

  it("her yetkinin Türkçe açıklaması vardır", () => {
    for (const capability of CAPABILITIES) {
      expect(CAPABILITY_LABELS[capability].length).toBeGreaterThan(0);
    }
  });

  it("yalnızca tanımlı metotları tanır", () => {
    expect(isBridgeMethod("storage.get")).toBe(true);
    expect(isBridgeMethod("storage.clear")).toBe(false);
    expect(isBridgeMethod("constructor")).toBe(false);
  });

  it("sayfalama imleci PostgreSQL bigint sınırına kadar tam korunur", () => {
    expect(pageQuerySchema.safeParse({ cursor: "9223372036854775807" }).success).toBe(true);
    expect(pageQuerySchema.safeParse({ cursor: "9223372036854775808" }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ cursor: "18446744073709551615" }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ cursor: "1;drop table" }).success).toBe(false);
  });

  it("hassas yetkiler kullanıcı onayı ister", () => {
    expect(requiresConsent("identity.basic")).toBe(true);
    expect(requiresConsent("location.coarse")).toBe(true);
    expect(requiresConsent("storage.local")).toBe(false);
  });

  it("sürümü farklı zarfı reddeder", () => {
    const request = { vado: 2, id: "a1", method: "container.getInfo" };
    expect(bridgeRequestSchema.safeParse(request).success).toBe(false);
  });

  it("bağlantı iletisi, ayrılma bildirimi ve istek zarfı birbirinin yerine geçmez", () => {
    const connect = { vado: 1, type: "connect" };
    const left = { vado: 1, type: "left" };
    const request = { vado: 1, id: "a1", method: "container.getInfo" };

    expect(bridgeConnectSchema.safeParse(connect).success).toBe(true);
    expect(bridgeLeftSchema.safeParse(left).success).toBe(true);
    expect(bridgeLeftSchema.safeParse(connect).success).toBe(false);
    expect(bridgeLeftSchema.safeParse({ vado: 2, type: "left" }).success).toBe(false);
    expect(bridgeConnectSchema.safeParse(left).success).toBe(false);
    expect(bridgeRequestSchema.safeParse(left).success).toBe(false);
    expect(bridgeLeftSchema.safeParse(request).success).toBe(false);
  });

  it("ödeme isteğinde tutar pozitif tam sayı olmalıdır", () => {
    const schema = bridgeParamsSchemas["payment.request"];
    const base = { merchantId: "kadikoy-berber", orderId: "rnd-1", description: "Saç kesimi" };
    expect(schema.safeParse({ ...base, amountMinor: 65_000 }).success).toBe(true);
    expect(schema.safeParse({ ...base, amountMinor: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...base, amountMinor: 12.5 }).success).toBe(false);
  });

  it("müşteri etkileşim köprüsü başka işletme alanlarını ve bozuk tekrar anahtarını reddeder", () => {
    const base = { id: "b2cd9772-164f-4300-b8c6-61a26a846790", key: "req-123" };
    expect(
      bridgeParamsSchemas["feedback.createReview"].safeParse({
        ...base,
        expectedOrderVersion: 2,
        rating: 5,
        comment: "Güzel",
        businessId: "yabancı",
      }).success,
    ).toBe(false);
    expect(
      bridgeParamsSchemas["returns.create"].safeParse({
        ...base,
        kind: "cancel",
        expectedOrderVersion: 2,
        amountMinor: 300,
        reason: "Yanlış sipariş",
      }).success,
    ).toBe(false);
    expect(
      bridgeParamsSchemas["returns.create"].safeParse({
        ...base,
        kind: "cancel",
        expectedOrderVersion: 2,
        amountMinor: null,
        reason: "Yanlış sipariş",
      }).success,
    ).toBe(true);
    expect(
      bridgeParamsSchemas["feedback.saveFavorite"].safeParse({
        key: "wrong key",
        itemId: null,
        value: true,
        expectedVersion: 0,
      }).success,
    ).toBe(false);
    expect(
      bridgeParamsSchemas["returns.withdraw"].safeParse({
        ...base,
        expectedVersion: 2,
        appInstanceId: base.id,
      }).success,
    ).toBe(false);
  });

  it("depolama anahtarında yol ayırıcıya izin vermez", () => {
    const schema = bridgeParamsSchemas["storage.get"];
    expect(schema.safeParse({ key: "son-randevu" }).success).toBe(true);
    expect(schema.safeParse({ key: "../baska-uygulama" }).success).toBe(false);
  });
});
