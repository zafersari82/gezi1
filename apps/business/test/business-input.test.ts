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
    ["members"],
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
