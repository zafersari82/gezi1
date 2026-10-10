import { expect, test } from "vitest";

import {
  bridgeParamsSchemas,
  checkoutCartBodySchema,
  orderListQuerySchema,
  replaceCartBodySchema,
  updateOrderStatusBodySchema,
} from "../src";
import { mergeOrderSnapshot, orderSummarySchema } from "../src/ordering";

test("sipariş listesi çoklu durum ve aktiflik süzgecini sınırlar", () => {
  expect(
    orderListQuerySchema.parse({ statuses: "accepted,preparing", active: "true" }),
  ).toMatchObject({ statuses: ["accepted", "preparing"], active: true });
  expect(orderListQuerySchema.parse({ active: "false" })).toMatchObject({ active: false });
  for (const statuses of [
    "",
    "accepted,",
    "accepted,accepted",
    "placed;delete",
    Array(21).fill("placed").join(","),
  ])
    expect(orderListQuerySchema.safeParse({ statuses }).success).toBe(false);
  expect(orderListQuerySchema.safeParse({ active: "maybe" }).success).toBe(false);
});

test("sepet adedi, seçenek tekilliği, sürüm ve fiyat tam sayı sınırındadır", () => {
  const id = "0468d9b0-5837-41c2-bb46-a2ca5a87d8fc";
  for (const quantity of [0, -1, 100, 1.5])
    expect(
      replaceCartBodySchema.safeParse({
        expectedVersion: 1,
        lines: [{ itemId: id, quantity, optionIds: [] }],
      }).success,
    ).toBe(false);
  expect(
    replaceCartBodySchema.safeParse({
      expectedVersion: 1,
      lines: [{ itemId: id, quantity: 1, optionIds: [id, id] }],
    }).success,
  ).toBe(false);
  expect(
    checkoutCartBodySchema.safeParse({
      cartVersion: 1,
      seenTotalMinor: 1.1,
      quoteHash: "a".repeat(64),
    }).success,
  ).toBe(false);
  expect(
    updateOrderStatusBodySchema.safeParse({ expectedVersion: 0, status: "accepted" }).success,
  ).toBe(false);
});

test("sipariş köprüsü tekrar anahtarını doğrular ve işletme kapsamı kabul etmez", () => {
  const body = {
    id: "0468d9b0-5837-41c2-bb46-a2ca5a87d8fc",
    key: "tekrar-1",
    cartVersion: 1,
    seenTotalMinor: 0,
    quoteHash: "a".repeat(64),
  };
  expect(bridgeParamsSchemas["ordering.checkout"].safeParse(body).success).toBe(true);
  for (const key of ["", "boş luk", "a".repeat(129)])
    expect(bridgeParamsSchemas["ordering.checkout"].safeParse({ ...body, key }).success).toBe(
      false,
    );
  expect(
    bridgeParamsSchemas["ordering.checkout"].safeParse({ ...body, businessId: body.id }).success,
  ).toBe(false);
});

test("geciken sipariş yanıtı durumu veya ödenmiş bilgisini geri alamaz", () => {
  const current = orderSummarySchema.parse({
    branchTimezone: "Europe/Istanbul",
    id: "7b1c9a52-3f0e-4d8a-9a51-2b7f7e6c1d40",
    cartId: "7b1c9a52-3f0e-4d8a-9a51-2b7f7e6c1d40",
    businessId: "7b1c9a52-3f0e-4d8a-9a51-2b7f7e6c1d40",
    branchId: "7b1c9a52-3f0e-4d8a-9a51-2b7f7e6c1d40",
    appInstanceId: "7b1c9a52-3f0e-4d8a-9a51-2b7f7e6c1d40",
    businessCustomerId: "7b1c9a52-3f0e-4d8a-9a51-2b7f7e6c1d40",
    fulfilment: "pickup",
    status: "ready",
    version: 3,
    totalMinor: 100,
    vatMinor: 0,
    currency: "TRY",
    createdAt: "2026-10-06T10:00:00Z",
    updatedAt: "2026-10-06T10:00:00Z",
    paymentStatus: "paid",
    paymentVersion: 1,
  });
  expect(
    mergeOrderSnapshot(current, {
      ...current,
      version: 2,
      status: "preparing",
      paymentStatus: "pending",
      paymentVersion: 0,
    }),
  ).toEqual(current);
  expect(
    mergeOrderSnapshot(current, {
      ...current,
      version: 4,
      status: "completed",
      paymentStatus: "pending",
      paymentVersion: 0,
    }),
  ).toMatchObject({ version: 4, status: "completed", paymentStatus: "paid", paymentVersion: 1 });
});
