"use client";
import {
  FULFILMENT_PAYMENT_PLACES,
  type Order,
  orderSchema,
  type PaymentPlace,
} from "@vado/contracts";
import { useRef, useState } from "react";

import { call, errorMessage } from "../lib/client";
import { operationalDateTime } from "../lib/order-display";
import { STATE_LABELS } from "../lib/values";

export function OrderActions({
  order,
  onChanged,
  device = false,
}: {
  order: Order;
  onChanged: (order: Order) => Promise<void>;
  device?: boolean;
}) {
  const paymentPlaces = FULFILMENT_PAYMENT_PLACES[order.fulfilment];
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [minutes, setMinutes] = useState(20);
  const [reason, setReason] = useState("");
  const [place, setPlace] = useState<PaymentPlace>(paymentPlaces[0]);
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const selectedPlace = paymentPlaces.includes(place) ? place : paymentPlaces[0];
  const root = device ? "/api/device" : "/api/business";
  const kitchen = order.capabilities.some((c) => c.startsWith("ordering.kitchen@"));
  const returnsEnabled = order.capabilities.some((c) => c.startsWith("ordering.returns@"));
  async function mutate(action: string, body: unknown, http = "POST") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const current = await call(orderSchema, `${root}/orders/${order.id}/${action}`, http, body);
      await onChanged(current);
    } catch (cause) {
      setError(errorMessage(cause));
      try {
        await onChanged(await call(orderSchema, `${root}/orders/${order.id}`));
      } catch {
        setError("Bağlantı kesildi. İşlemin sonucunu yenileyerek kontrol et.");
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const next = order.stateGraph[order.status] ?? [];
  return (
    <div className="order-actions">
      {order.status === "placed" && kitchen ? (
        <>
          <label>
            Hazırlık süresi (dk)
            <input
              aria-label="Hazırlık süresi"
              type="number"
              value={minutes}
              min={1}
              max={240}
              onChange={(e) => {
                setMinutes(Number(e.target.value));
              }}
            />
          </label>
          <button
            className="primary"
            disabled={busy || !Number.isInteger(minutes) || minutes < 1 || minutes > 240}
            onClick={() =>
              void mutate("accept", { expectedVersion: order.version, preparationMinutes: minutes })
            }
          >
            Kabul et
          </button>
          <label>
            Ret gerekçesi
            <input
              aria-label="Ret gerekçesi"
              maxLength={500}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
            />
          </label>
          <button
            className="secondary danger"
            disabled={busy || reason.trim().length < 3}
            onClick={() => void mutate("reject", { expectedVersion: order.version, reason })}
          >
            Reddet
          </button>
        </>
      ) : null}
      {returnsEnabled && next.includes("cancelled") && !device && (
        <p className="muted small">
          Bu sipariş doğrudan iptal edilemez. Müşterinin iptal talebini İadeler bölümünden
          değerlendir.
        </p>
      )}
      {next
        .filter(
          (s) =>
            (!kitchen || !["accepted", "rejected"].includes(s)) &&
            (s !== "cancelled" || (!returnsEnabled && !device)),
        )
        .map((status) => (
          <button
            key={status}
            className={["cancelled", "rejected"].includes(status) ? "secondary danger" : "primary"}
            disabled={busy}
            onClick={() => void mutate("status", { expectedVersion: order.version, status }, "PUT")}
          >
            {status === "cancelled" ? "İptal et" : (STATE_LABELS[status] ?? status)}
          </button>
        ))}
      {!device &&
        ["accepted", "preparing", "ready", "completed"].includes(order.status) &&
        order.paymentStatus !== "paid" &&
        order.totalMinor > 0 && (
          <fieldset className="payment-form">
            <legend>Tahsilat · ödeme bekliyor</legend>
            <label>
              Ödeme yeri
              <select
                value={selectedPlace}
                onChange={(e) => {
                  const next = paymentPlaces.find((candidate) => candidate === e.target.value);
                  if (next !== undefined) setPlace(next);
                }}
              >
                {paymentPlaces.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate === "table"
                      ? "Masada"
                      : candidate === "delivery"
                        ? "Teslimatta"
                        : "Kasada"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ödeme yöntemi
              <select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value === "card" ? "card" : "cash");
                }}
              >
                <option value="cash">Nakit</option>
                <option value="card">Fiziksel POS</option>
              </select>
            </label>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void mutate("payment", {
                  expectedPaymentVersion: order.paymentVersion,
                  place: selectedPlace,
                  method,
                })
              }
            >
              Ödendi olarak kaydet
            </button>
          </fieldset>
        )}
      {order.paymentStatus === "paid" && <p className="success">Ödendi</p>}
      {order.estimatedReadyAt && (
        <p>Tahmini hazır: {operationalDateTime(order.estimatedReadyAt, order.branchTimezone)}</p>
      )}
      {order.rejectionReason && <p>Ret gerekçesi: {order.rejectionReason}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
