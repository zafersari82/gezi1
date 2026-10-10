import { randomUUID } from "node:crypto";

import { cartSchema, type ReturnRequest } from "@vado/contracts";
import { expect, it } from "vitest";

import { createFeedbackHost } from "@/features/miniapps/feedback-host";
import type { MiniAppTransport } from "@/features/miniapps/host-transport";
import { createOrderingHost } from "@/features/miniapps/ordering-host";
import { createReturnsHost } from "@/features/miniapps/returns-host";

const businessId = randomUUID();
const appInstanceId = randomUUID();
const businessCustomerId = randomUUID();
const orderId = randomUUID();
const itemId = randomUUID();
const context = { businessId, appInstanceId, businessCustomerId };
const selected = { businessId, appInstanceId, miniAppId: "magaza" };
const key = randomUUID();
const review = {
  id: randomUUID(),
  businessId,
  orderId,
  businessCustomerId,
  rating: 5,
  comment: "Güzel",
  reply: null,
  visibility: "published",
  version: 1,
  createdAt: "2026-10-09T10:00:00Z",
  updatedAt: "2026-10-09T10:00:00Z",
};
const favorite = {
  id: randomUUID(),
  businessId,
  itemId,
  value: true,
  version: 1,
  name: "Ürün",
  available: true,
};
const request: ReturnRequest = {
  id: randomUUID(),
  businessId,
  appInstanceId,
  businessCustomerId,
  orderId,
  orderVersion: 2,
  kind: "cancel",
  amountMinor: 0,
  reason: "Yanlış ürün",
  status: "pending",
  decisionReason: null,
  memberId: null,
  version: 1,
  receipt: null,
  createdAt: "2026-10-09T10:00:00Z",
  updatedAt: "2026-10-09T10:00:00Z",
};
const cart = cartSchema.parse({
  id: randomUUID(),
  businessId,
  appInstanceId,
  businessCustomerId,
  branchId: randomUUID(),
  fulfilment: "pickup",
  status: "open",
  version: 1,
  expiresAt: "2026-10-10T10:00:00Z",
  lines: [],
  totalMinor: 0,
  vatMinor: 0,
  currency: "TRY",
  quoteHash: "a".repeat(64),
});

interface Call {
  method: string;
  path: string;
  body?: unknown;
  key?: string;
}
function fake(response: (call: Call) => unknown) {
  const calls: Call[] = [];
  const transport: MiniAppTransport = {
    request: (method, path, body, idempotencyKey) => {
      const call = { method, path, body, key: idempotencyKey };
      calls.push(call);
      return Promise.resolve(path === "/v1/shell/business-context" ? context : response(call));
    },
  };
  return { transport, calls };
}

it("değerlendirme ve favorilerde tenant URL'si, istek gövdesi ve tekrar anahtarı kabukta belirlenir", async () => {
  const { transport, calls } = fake(({ path }) =>
    path.includes("/favorites?")
      ? { items: [favorite], nextCursor: null }
      : path.endsWith("/favorites")
        ? favorite
        : path.includes("/reviews?")
          ? { items: [review], nextCursor: null }
          : review,
  );
  const host = createFeedbackHost(selected, transport);
  expect((await host.listReviews({ limit: 1 })).items).toEqual([review]);
  expect((await host.listFavorites({ limit: 1, cursor: "1234" })).items).toEqual([favorite]);
  expect(
    await host.createReview({
      id: orderId,
      key,
      expectedOrderVersion: 3,
      rating: 5,
      comment: "Güzel",
    }),
  ).toEqual(review);
  expect(
    await host.editReview({ id: review.id, key, expectedVersion: 1, rating: 5, comment: "Güzel" }),
  ).toEqual(review);
  expect(await host.saveFavorite({ key, itemId, expectedVersion: 0, value: true })).toEqual(
    favorite,
  );
  expect(calls.map((call) => [call.method, call.path])).toEqual([
    ["POST", "/v1/shell/business-context"],
    ["GET", `/v1/shell/${businessId}/${appInstanceId}/reviews?limit=1`],
    ["POST", "/v1/shell/business-context"],
    ["GET", `/v1/shell/${businessId}/${appInstanceId}/favorites?limit=1&cursor=1234`],
    ["POST", "/v1/shell/business-context"],
    ["POST", `/v1/shell/${businessId}/${appInstanceId}/orders/${orderId}/review`],
    ["POST", "/v1/shell/business-context"],
    ["PUT", `/v1/shell/${businessId}/${appInstanceId}/reviews/${review.id}`],
    ["POST", "/v1/shell/business-context"],
    ["PUT", `/v1/shell/${businessId}/${appInstanceId}/favorites`],
  ]);
  expect(calls.at(-1)).toMatchObject({ key, body: { itemId, expectedVersion: 0, value: true } });
});

it("yanlış işletme veya kullanıcıya ait değerlendirme/favori yanıtı uygulamaya iletilmez", async () => {
  const { transport } = fake(({ path }) =>
    path.includes("/reviews?")
      ? { items: [{ ...review, businessId: randomUUID() }], nextCursor: null }
      : { ...favorite, businessId: randomUUID() },
  );
  const host = createFeedbackHost(selected, transport);
  await expect(host.listReviews({ limit: 5 })).rejects.toThrow("İşletme bağlamı");
  await expect(host.saveFavorite({ key, itemId, expectedVersion: 0, value: true })).rejects.toThrow(
    "Favori bağlamı",
  );
});

it("iade listesi başka uygulamanın veya başka siparişin kaydını dışarı taşımaz", async () => {
  const { transport } = fake(() => ({ items: [{ ...request, appInstanceId: randomUUID() }] }));
  await expect(createReturnsHost(selected, transport).list({ id: orderId })).rejects.toThrow(
    "İade bağlamı",
  );
  const another = fake(() => ({ items: [{ ...request, orderId: randomUUID() }] }));
  await expect(
    createReturnsHost(selected, another.transport).list({ id: orderId }),
  ).rejects.toThrow("İade siparişi");
});

it("iade açma ve geri çekme anahtarı dışa sızdırılmaz, yanıtın kimliği denetlenir", async () => {
  const { transport, calls } = fake(() => request);
  const host = createReturnsHost(selected, transport);
  expect(
    await host.create({
      id: orderId,
      key,
      kind: "cancel",
      expectedOrderVersion: 2,
      reason: "Yanlış ürün",
      amountMinor: null,
    }),
  ).toEqual(request);
  expect(await host.withdraw({ id: request.id, key, expectedVersion: 1 })).toEqual(request);
  expect(calls[1]).toMatchObject({
    method: "POST",
    path: `/v1/shell/${businessId}/${appInstanceId}/orders/${orderId}/returns`,
    key,
    body: { kind: "cancel", expectedOrderVersion: 2, reason: "Yanlış ürün", amountMinor: null },
  });
  expect(calls[3]).toMatchObject({
    method: "POST",
    path: `/v1/shell/${businessId}/${appInstanceId}/returns/${request.id}/withdraw`,
    key,
    body: { expectedVersion: 1 },
  });
});

it("tekrar siparişte oluşturulan sepetin sahibi doğrulanır", async () => {
  const reordered = {
    cart,
    omitted: [],
    requiresConfirmation: false,
    fulfilmentNeedsSelection: false,
  };
  const { transport, calls } = fake(() => reordered);
  const host = createOrderingHost(selected, transport);
  const params = {
    id: orderId,
    key,
    branchId: cart.branchId,
    cartId: null,
    expectedVersion: 0,
    replace: false,
  };
  expect(await host.reorder(params)).toEqual(reordered);
  expect(calls.at(-1)).toMatchObject({
    method: "POST",
    key,
    path: `/v1/shell/${businessId}/${appInstanceId}/orders/${orderId}/reorder`,
  });
  const other = fake(() => ({ ...reordered, cart: { ...cart, appInstanceId: randomUUID() } }));
  await expect(createOrderingHost(selected, other.transport).reorder(params)).rejects.toThrow(
    "Sipariş bağlamı",
  );
});
