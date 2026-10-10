import { randomUUID } from "node:crypto";

import { cartSchema } from "@vado/contracts";
import { expect, it } from "vitest";

import { createIncentivesHost } from "@/features/miniapps/incentives-host";
const businessId = randomUUID(),
  appInstanceId = randomUUID(),
  businessCustomerId = randomUUID(),
  branchId = randomUUID();
const context = { businessId, appInstanceId, businessCustomerId };
const cart = cartSchema.parse({
  id: randomUUID(),
  businessId,
  appInstanceId,
  businessCustomerId,
  branchId,
  fulfilment: "pickup",
  status: "open",
  version: 2,
  expiresAt: "2026-10-08T00:00:00Z",
  lines: [],
  totalMinor: 0,
  vatMinor: 0,
  currency: "TRY",
  quoteHash: "a".repeat(64),
});
it("teşvik kabuk yolu, kullanıcı bağlamı ve tekrar anahtarı paketçe değiştirilemez", async () => {
  const calls: { method: string; path: string; body?: unknown; key?: string }[] = [];
  const host = createIncentivesHost(
    { businessId, appInstanceId, miniAppId: "restoran" },
    {
      request: (method, path, body, key) => {
        calls.push({ method, path, body, key });
        if (path.endsWith("business-context")) return Promise.resolve(context);
        if (path.endsWith("/loyalty"))
          return Promise.resolve({ balance: 100, available: 100, version: 1 });
        if (path.endsWith("/incentives") && method === "GET")
          return Promise.resolve({
            settings: { version: 1, stackCampaignCoupon: false, earnBasisPoints: 100 },
            campaigns: [],
            wallet: { balance: 100, available: 100, version: 1 },
          });
        return Promise.resolve(cart);
      },
    },
  );
  expect(await host.getLoyalty(undefined)).toMatchObject({ available: 100 });
  await host.getAvailable(undefined);
  const key = randomUUID();
  expect(
    await host.applyCart({
      id: cart.id,
      key,
      expectedVersion: 1,
      couponCode: "VADO10",
      pointsToSpend: 10,
    }),
  ).toEqual({ type: "cart", cart });
  expect(calls.at(-1)).toEqual({
    method: "PUT",
    path: `/v1/shell/${businessId}/${appInstanceId}/carts/${cart.id}/incentives`,
    key,
    body: { expectedVersion: 1, couponCode: "VADO10", pointsToSpend: 10 },
  });
});
it("yanlış işletme ve müşteri görüntüsü kabuktan dışarı dönmez", async () => {
  const host = createIncentivesHost(
    { businessId, appInstanceId, miniAppId: "restoran" },
    {
      request: (_method, path) =>
        Promise.resolve(
          path.endsWith("business-context")
            ? context
            : { ...cart, businessCustomerId: randomUUID() },
        ),
    },
  );
  await expect(
    host.applyCart({
      id: cart.id,
      key: randomUUID(),
      expectedVersion: 1,
      couponCode: null,
      pointsToSpend: 0,
    }),
  ).rejects.toThrow("bağlamı uyuşmuyor");
  const wrong = createIncentivesHost(
    { businessId, appInstanceId, miniAppId: "restoran" },
    { request: () => Promise.resolve({ ...context, businessId: randomUUID() }) },
  );
  await expect(wrong.getLoyalty(undefined)).rejects.toThrow("bağlamı uyuşmuyor");
});
it("puan sepetindeki sürüm çatışması sahipliği korunmuş güncel sepeti döndürür", async () => {
  const host = createIncentivesHost(
    { miniAppId: "restoran" },
    {
      request: (_method, path) => {
        if (path.endsWith("resolve-context")) return Promise.resolve(context);
        return Promise.reject(
          Object.assign(new Error("Sepet sürümü değişti."), {
            code: "cart_version_conflict",
            details: { cart },
          }),
        );
      },
    },
  );
  expect(
    await host.applyCart({
      id: cart.id,
      key: randomUUID(),
      expectedVersion: 1,
      couponCode: null,
      pointsToSpend: 0,
    }),
  ).toEqual({ type: "cart_conflict", cart });
});
