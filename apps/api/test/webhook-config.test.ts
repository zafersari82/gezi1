import { expect, test } from "vitest";

import { loadConfig } from "../src/core/config";

test("sipariş webhook ayarı yalnızca HTTPS, işletme ve güçlü imza anahtarı kabul eder", () => {
  const config = {
    id: "partner.orders",
    businessId: "7b1c9a52-3f0e-4d8a-9a51-2b7f7e6c1d40",
    url: "https://example.com/events",
    secret: "a".repeat(32),
    types: ["order.placed"],
  };
  expect(loadConfig({ VADO_ORDER_WEBHOOKS: JSON.stringify([config]) }).orderWebhooks).toHaveLength(
    1,
  );
  expect(() =>
    loadConfig({
      VADO_ORDER_WEBHOOKS: JSON.stringify([{ ...config, url: "http://example.com/events" }]),
    }),
  ).toThrow();
  expect(() =>
    loadConfig({ VADO_ORDER_WEBHOOKS: JSON.stringify([{ ...config, secret: "zayif" }]) }),
  ).toThrow();
  expect(() => loadConfig({ VADO_ORDER_WEBHOOKS: "bozuk" })).toThrow();
});
