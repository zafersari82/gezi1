import { expect, test } from "vitest";

import {
  businessApiPath,
  kitchenApiPath,
  readLimitedJson,
  sameOrigin,
} from "../lib/request-policy";
import { decimalToMinor, minutesFromTime } from "../lib/values";

const businessId = "e18a3454-5328-4a14-bb30-cb45f735a2b0";
const itemId = "c85d8250-32eb-4330-acd6-2646ef6c05a1";
test("vekil yalnız seçili işletmenin izinli yollarına ve yöntemlerine açılır", () => {
  expect(businessApiPath(businessId, ["catalog", "items", itemId], "PUT", "")).toBe(
    `/v1/business/${businessId}/catalog/items/${itemId}`,
  );
  expect(businessApiPath(businessId, ["orders"], "GET", "?limit=50&status=placed")).toBe(
    `/v1/business/${businessId}/orders?limit=50&status=placed`,
  );
  expect(
    businessApiPath(businessId, ["orders"], "GET", "?active=true&statuses=accepted,preparing"),
  ).toBe(`/v1/business/${businessId}/orders?active=true&statuses=accepted%2Cpreparing`);
  for (const segments of [
    ["..", "admin"],
    ["%2e%2e", "admin"],
    ["catalog/items", itemId],
    ["http:", "example.com"],
  ])
    expect(businessApiPath(businessId, segments, "GET", "")).toBeNull();
  expect(businessApiPath(businessId, ["orders"], "DELETE", "")).toBeNull();
  expect(businessApiPath(businessId, ["orders"], "GET", "?businessId=foreign")).toBeNull();
  expect(businessApiPath("foreign", ["catalog"], "GET", "")).toBeNull();
});
test("mutasyon farklı Origin veya boş Origin ile yapılamaz", () => {
  expect(
    sameOrigin(
      new Request("https://business.vado.test/api/auth/otp", {
        headers: { origin: "https://business.vado.test" },
      }),
    ),
  ).toBe(true);
  expect(
    sameOrigin(
      new Request("https://business.vado.test/api/auth/otp", {
        headers: { origin: "https://evil.test" },
      }),
    ),
  ).toBe(false);
  expect(sameOrigin(new Request("https://business.vado.test/api/auth/otp"))).toBe(false);
});
test("vekil JSON gövdesini boyut sınırıyla okur", async () => {
  expect(
    await readLimitedJson(
      new Request("http://localhost", { method: "POST", body: '{"name":"Çay"}' }),
    ),
  ).toEqual({ name: "Çay" });
  await expect(
    readLimitedJson(new Request("http://localhost", { method: "POST", body: "x".repeat(50) }), 20),
  ).rejects.toThrow();
  await expect(
    readLimitedJson(new Request("http://localhost", { method: "POST", body: "bozuk" })),
  ).rejects.toThrow();
});
test("para tam kuruşa dönüşür; kayan nokta, negatif ve fazla basamak kabul edilmez", () => {
  expect(decimalToMinor("120,05")).toBe(12005);
  expect(decimalToMinor("0.29")).toBe(29);
  expect(decimalToMinor("1000000")).toBe(100000000);
  for (const value of ["-1", "1e2", "0.009", "1000000.01", "Infinity", "", "0x10"])
    expect(() => decimalToMinor(value)).toThrow();
});
test("şube saati dakika olarak doğrulanır", () => {
  expect(minutesFromTime("23:45")).toBe(1425);
  expect(minutesFromTime("00:00")).toBe(0);
  for (const value of ["24:00", "12:60", "-1:00", "gece"])
    expect(() => minutesFromTime(value)).toThrow();
});

test("restoran yolları açık, cihaz vekili dar ve müşteri kapsamı seçilemez", () => {
  expect(businessApiPath(businessId, ["orders", itemId, "accept"], "POST", "")).toBe(
    `/v1/business/${businessId}/orders/${itemId}/accept`,
  );
  expect(businessApiPath(businessId, ["live-events"], "GET", "?cursor=10")).toBe(
    `/v1/business/${businessId}/live-events?cursor=10`,
  );
  expect(kitchenApiPath(["orders", itemId, "accept"], "POST", "")).toBe(
    `/v1/kitchen/orders/${itemId}/accept`,
  );
  expect(kitchenApiPath(["orders", itemId, "payment"], "POST", "")).toBeNull();
  expect(kitchenApiPath(["orders"], "GET", "?businessId=foreign")).toBeNull();
});

test("iade ve değerlendirme yolları yalnız listeler ve gerekçeli karar uçlarını açar", () => {
  expect(businessApiPath(businessId, ["returns"], "GET", "?status=pending&limit=30")).toBe(
    `/v1/business/${businessId}/returns?status=pending&limit=30`,
  );
  expect(
    businessApiPath(
      businessId,
      ["returns"],
      "GET",
      `?cursor=2026-10-09T10%3A00%3A00.000001Z%7C${itemId}`,
    ),
  ).toBe(`/v1/business/${businessId}/returns?cursor=2026-10-09T10%3A00%3A00.000001Z%7C${itemId}`);
  expect(businessApiPath(businessId, ["reviews"], "GET", "?cursor=9007199254740993")).toBe(
    `/v1/business/${businessId}/reviews?cursor=9007199254740993`,
  );
  expect(businessApiPath(businessId, ["returns", itemId, "decision"], "PUT", "")).toBe(
    `/v1/business/${businessId}/returns/${itemId}/decision`,
  );
  expect(businessApiPath(businessId, ["reviews", itemId, "reply"], "PUT", "")).toBe(
    `/v1/business/${businessId}/reviews/${itemId}/reply`,
  );
  for (const paths of [
    ["returns", itemId],
    ["returns", itemId, "withdraw"],
    ["reviews", itemId, "delete"],
  ])
    expect(businessApiPath(businessId, paths, "PUT", "")).toBeNull();
  expect(businessApiPath(businessId, ["returns", itemId, "decision"], "GET", "")).toBeNull();
  expect(businessApiPath(businessId, ["reviews", itemId, "reply"], "POST", "")).toBeNull();
  expect(businessApiPath(businessId, ["returns"], "GET", "?customerId=foreign")).toBeNull();
  expect(businessApiPath(businessId, ["reviews"], "GET", "?appInstanceId=foreign")).toBeNull();
});

test("Studio vekili yalnız GET ve PUT yöntemlerini kabul eder", () => {
  expect(businessApiPath(businessId, ["studio"], "GET", "")).toBe(
    `/v1/business/${businessId}/studio`,
  );
  expect(businessApiPath(businessId, ["studio"], "PUT", "")).toBe(
    `/v1/business/${businessId}/studio`,
  );
  for (const method of ["POST", "DELETE", "PATCH"]) {
    expect(businessApiPath(businessId, ["studio"], method, "")).toBeNull();
  }
  expect(businessApiPath(businessId, ["studio"], "PUT", "?businessId=other")).toBeNull();
});

test("Ürün görseli yalnız seçili işletmenin ürününe ve PUT yöntemine bağlıdır", () => {
  expect(businessApiPath(businessId, ["catalog", "items", itemId, "image"], "PUT", "")).toBe(
    `/v1/business/${businessId}/catalog/items/${itemId}/image`,
  );
  expect(businessApiPath(businessId, ["catalog", "items", itemId, "image"], "GET", "")).toBeNull();
  expect(
    businessApiPath(businessId, ["catalog", "items", itemId, "image"], "PUT", "?businessId=other"),
  ).toBeNull();
});

test("Studio ilk ürün aktarımı yalnız POST yöntemi ve seçili işletmeyle çalışır", () => {
  expect(businessApiPath(businessId, ["catalog", "starter-items"], "POST", "")).toBe(
    `/v1/business/${businessId}/catalog/starter-items`,
  );
  expect(businessApiPath(businessId, ["catalog", "starter-items"], "GET", "")).toBeNull();
  expect(
    businessApiPath(businessId, ["catalog", "starter-items"], "POST", "?businessId=other"),
  ).toBeNull();
});

test("Şube fiyatı toplu güncelleme vekili yalnız doğru işletme ve PUT yolunu açar", () => {
  expect(businessApiPath(businessId, ["catalog", "branch-prices"], "PUT", "")).toBe(
    `/v1/business/${businessId}/catalog/branch-prices`,
  );
  expect(businessApiPath(businessId, ["catalog", "branch-prices"], "GET", "")).toBeNull();
  expect(
    businessApiPath(businessId, ["catalog", "branch-prices"], "PUT", "?businessId=other"),
  ).toBeNull();
});

test("ekip, izin ve bölge yolları yalnız izinli yöntemle ve seçili işletmeyle açılır", () => {
  const routes: [string[], string][] = [
    [["access", "me"], "GET"],
    [["access", "members"], "GET"],
    [["access", "members", itemId], "PUT"],
    [["regions"], "GET"],
    [["regions"], "POST"],
    [["regions", itemId], "PUT"],
    [["regions", itemId, "delete"], "POST"],
    [["branches", itemId, "region"], "PUT"],
    [["branches", "availability-batch"], "PUT"],
    [["members"], "PUT"],
  ];
  for (const [segments, method] of routes) {
    expect(businessApiPath(businessId, segments, method, "")).toBe(
      `/v1/business/${businessId}/${segments.join("/")}`,
    );
    expect(businessApiPath(businessId, segments, "DELETE", "")).toBeNull();
    expect(businessApiPath(businessId, segments, method, "?businessId=another")).toBeNull();
  }
  // 2.8 ara sürümlerinin dağınık izin uçları kapalıdır.
  for (const segments of [
    ["branches", "availability-access", "me"],
    ["branches", itemId, "availability-grants"],
    ["branches", itemId, "order-grants"],
    ["regions", itemId, "operators"],
    ["orders", "access", "me"],
    ["members"],
  ])
    expect(businessApiPath(businessId, segments, "GET", "")).toBeNull();
  expect(businessApiPath(businessId, ["access", "members", itemId], "POST", "")).toBeNull();
});

test("performans vekili yalnız gün süzgeciyle açılır", () => {
  expect(businessApiPath(businessId, ["orders", "performance"], "GET", "?days=7")).toBe(
    `/v1/business/${businessId}/orders/performance?days=7`,
  );
  expect(
    businessApiPath(businessId, ["orders", "performance"], "GET", "?branchId=foreign"),
  ).toBeNull();
  expect(businessApiPath(businessId, ["orders", "performance"], "PUT", "")).toBeNull();
});

test("çalışan daveti API vekili yalnızca oluşturma, listeleme ve iptale açıktır", () => {
  const path = ["invitations"];
  expect(businessApiPath(businessId, path, "GET", "")).toBe(
    `/v1/business/${businessId}/invitations`,
  );
  expect(businessApiPath(businessId, path, "POST", "")).toBe(
    `/v1/business/${businessId}/invitations`,
  );
  expect(businessApiPath(businessId, path, "PUT", "")).toBeNull();
  expect(businessApiPath(businessId, path, "POST", "?phone=foreign")).toBeNull();
  expect(businessApiPath(businessId, ["invitations", itemId, "revoke"], "POST", "")).toBe(
    `/v1/business/${businessId}/invitations/${itemId}/revoke`,
  );
  expect(businessApiPath(businessId, ["invitations", itemId, "revoke"], "GET", "")).toBeNull();
  expect(businessApiPath(businessId, ["invitations", itemId], "GET", "")).toBeNull();
});
