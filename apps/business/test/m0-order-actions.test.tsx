import { type Order, orderSchema } from "@vado/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { OrderActions } from "../components/order-actions";

const uuid = "a7e8f6c0-b45d-48af-9213-f8415492afeb";
const sample = orderSchema.parse({
  id: "a7e8f6c0-b45d-48af-9213-f8415492afeb",
  businessId: uuid,
  cartId: uuid,
  branchId: uuid,
  appInstanceId: uuid,
  businessCustomerId: uuid,
  branchTimezone: "Europe/Istanbul",
  fulfilment: "pickup",
  status: "placed",
  capabilities: [],
  totalMinor: 160000,
  vatMinor: 10000,
  currency: "TRY",
  createdAt: "2026-10-10T12:30:00.000Z",
  updatedAt: "2026-10-10T12:30:00.000Z",
  lines: [],
  history: [],
  paymentStatus: "pending",
  paymentVersion: 0,
  version: 1,
  stateGraph: { placed: ["accepted", "cancelled"], accepted: ["completed", "cancelled"] },
  estimatedReadyAt: null,
  rejectionReason: null,
});

function actions(order: Order) {
  return renderToStaticMarkup(
    createElement(OrderActions, { order, onChanged: () => Promise.resolve() }),
  );
}

test("M0: iptal eylemi doğru kipte, kabul edilmeden ödeme kutusu yok", () => {
  const html = actions(sample);
  expect(html).toContain("İptal et");
  expect(html).not.toContain("İptal edildi");
  expect(html).not.toContain("Tahsilat · ödeme bekliyor");
});

test("M0: iade paketi olan sipariş doğrudan iptal edilmez", () => {
  const html = actions({ ...sample, capabilities: ["ordering.returns@1.0.0"] });
  expect(html).toContain("İadeler bölümünden");
  expect(html).not.toContain(">İptal et</button>");
});

test("M0: kabul sonrası tahsilat alanı açılır", () => {
  const html = actions({ ...sample, status: "accepted" });
  expect(html).toContain("Tahsilat · ödeme bekliyor");
});
