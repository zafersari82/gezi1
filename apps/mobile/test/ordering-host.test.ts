import { randomUUID } from "node:crypto";

import { cartSchema } from "@vado/contracts";
import { expect, test } from "vitest";

import { createOrderingHost, type OrderingTransport } from "@/features/miniapps/ordering-host";

const businessId = randomUUID();
const appInstanceId = randomUUID();
const businessCustomerId = randomUUID();
const branchId = randomUUID();
const cart = cartSchema.parse({
  id: randomUUID(),
  businessId,
  appInstanceId,
  businessCustomerId,
  branchId,
  fulfilment: "pickup",
  status: "open",
  version: 2,
  expiresAt: "2026-10-06T00:00:00.000Z",
  lines: [],
  totalMinor: 0,
  vatMinor: 0,
  currency: "TRY",
  quoteHash: "a".repeat(64),
});

function transport() {
  const calls: { method: string; path: string; body?: unknown; key?: string }[] = [];
  const api: OrderingTransport = {
    request: (method, path, body, key) => {
      calls.push({
        method,
        path,
        ...(body === undefined ? {} : { body }),
        ...(key === undefined ? {} : { key }),
      });
      return Promise.resolve(
        path === "/v1/shell/business-context"
          ? { businessId, appInstanceId, businessCustomerId }
          : cart,
      );
    },
  };
  return { api, calls };
}

test("kabuk seçilmiş uygulamayı doğrulatır; işletme ve örnek kimliğini kendisi ekler", async () => {
  const { api, calls } = transport();
  const host = createOrderingHost({ businessId, appInstanceId, miniAppId: "siparis" }, api);
  expect(await host.openCart({ branchId, fulfilment: "pickup" })).toEqual(cart);
  expect(calls).toEqual([
    {
      method: "POST",
      path: "/v1/shell/business-context",
      body: { businessId, appInstanceId, miniAppId: "siparis" },
    },
    {
      method: "POST",
      path: `/v1/shell/${businessId}/${appInstanceId}/carts`,
      body: { branchId, fulfilment: "pickup" },
    },
  ]);
});

test("başka işletme veya müşterinin yanıtı mini uygulamaya verilmez", async () => {
  const { api } = transport();
  const host = createOrderingHost({ businessId, appInstanceId, miniAppId: "siparis" }, api);
  for (const response of [
    { ...cart, businessId: randomUUID() },
    { ...cart, businessCustomerId: randomUUID() },
    { ...cart, appInstanceId: randomUUID() },
  ]) {
    const original = api.request;
    api.request = (method, path, body, key) =>
      path === "/v1/shell/business-context"
        ? original(method, path, body, key)
        : Promise.resolve(response);
    await expect(host.getCart({ id: cart.id })).rejects.toThrow("Sipariş bağlamı uyuşmuyor.");
  }
});

test("fiyat ve sürüm çakışmasında yeni sepeti ve tekrar anahtarını köprü taşır", async () => {
  const { api, calls } = transport();
  const original = api.request;
  api.request = (method, path, body, key) => {
    if (path === "/v1/shell/business-context") return original(method, path, body, key);
    calls.push({
      method,
      path,
      ...(body === undefined ? {} : { body }),
      ...(key === undefined ? {} : { key }),
    });
    return Promise.reject(
      Object.assign(new Error("Sepet değişti"), {
        code: path.endsWith("checkout") ? "cart_changed" : "cart_version_conflict",
        details: { cart },
      }),
    );
  };
  const host = createOrderingHost({ businessId, appInstanceId, miniAppId: "siparis" }, api);
  expect(await host.replaceCart({ id: cart.id, expectedVersion: 1, lines: [] })).toEqual({
    type: "cart_conflict",
    cart,
  });
  expect(
    await host.checkout({
      id: cart.id,
      key: "onay-1",
      cartVersion: 2,
      seenTotalMinor: 0,
      quoteHash: cart.quoteHash,
    }),
  ).toEqual({ type: "cart_changed", cart });
  expect(calls).toHaveLength(4);
  expect(calls.at(-1)).toEqual({
    method: "POST",
    path: `/v1/shell/${businessId}/${appInstanceId}/carts/${cart.id}/checkout`,
    key: "onay-1",
    body: { cartVersion: 2, seenTotalMinor: 0, quoteHash: cart.quoteHash },
  });
});

test("masa köprüsü paketten QR kabul etmez, kabukta kalan imzayı yollar", async () => {
  const { api, calls } = transport();
  const original = api.request;
  const session = {
    id: randomUUID(),
    tableId: randomUUID(),
    branchId,
    appInstanceId,
    label: "12",
    status: "open",
    version: 1,
  };
  api.request = (method, path, body, key) => {
    if (!path.endsWith("/table-sessions")) return original(method, path, body, key);
    calls.push({ method, path, body });
    return Promise.resolve(session);
  };
  const host = createOrderingHost(
    { businessId, appInstanceId, miniAppId: "siparis" },
    api,
    "ham-imza",
  );
  expect(await host.joinTable(undefined)).toEqual(session);
  expect(calls[0]?.path).toBe("/v1/shell/business-context");
  expect(calls[1]).toEqual({
    method: "POST",
    path: `/v1/shell/${businessId}/${appInstanceId}/table-sessions`,
    body: { qr: "ham-imza" },
  });
  const noQr = createOrderingHost({ businessId, appInstanceId, miniAppId: "siparis" }, api);
  await expect(noQr.joinTable(undefined)).rejects.toThrow("QR kodunu");
});

test("restoran bağlamında başka işletme veya uygulama kaydı dönemez", async () => {
  const { api } = transport();
  const host = createOrderingHost(
    { miniAppId: "randevu", businessId, appInstanceId },
    {
      request: async (method, path, body, key) =>
        path.endsWith("/restaurant")
          ? {
              businessId: randomUUID(),
              appInstanceId,
              businessName: "Yabancı",
              capabilities: [],
              branches: [],
            }
          : api.request(method, path, body, key),
    },
  );
  await expect(host.getRestaurant(undefined)).rejects.toThrow("Sipariş bağlamı uyuşmuyor.");
});
