"use client";
import {
  type Branch,
  type BusinessTableBill,
  businessTableBillSchema,
  issuedQrSchema,
  type Order,
  orderSchema,
  type RestaurantTable,
  restaurantTableSchema,
  type TableRequest,
  tableRequestSchema,
} from "@vado/contracts";
import Image from "next/image";
import QRCode from "qrcode";
import { useCallback, useRef, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { formText, money, STATE_LABELS } from "../lib/values";
import { OrderActions } from "./order-actions";
import { useBusinessLive } from "./use-business-live";
export function TablesView({
  businessId,
  appInstanceId,
  branches,
  initial,
  initialRequests,
  canWrite,
}: {
  businessId: string;
  appInstanceId: string;
  branches: Branch[];
  initial: RestaurantTable[];
  initialRequests: TableRequest[];
  canWrite: boolean;
}) {
  const [tables, setTables] = useState(initial);
  const [requests, setRequests] = useState(initialRequests);
  const [bill, setBill] = useState<BusinessTableBill | null>(null);
  const session = useRef<string | null>(null);
  const generation = useRef(0);
  const [order, setOrder] = useState<Order | null>(null);
  const orderId = useRef<string | null>(null);
  const [qr, setQr] = useState<{ value: string; image: string; label: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const [latest, calls] = await Promise.all([
      call(z.object({ items: z.array(restaurantTableSchema) }), "/api/business/tables"),
      call(z.object({ items: z.array(tableRequestSchema) }), "/api/business/table-requests"),
    ]);
    if (request !== generation.current) return;
    setTables(latest.items);
    setRequests(calls.items);
    const id = session.current;
    if (id) {
      const detail = await call(businessTableBillSchema, `/api/business/table-sessions/${id}/bill`);
      if (request === generation.current && session.current === id) setBill(detail);
    }
    const selected = orderId.current;
    if (selected) {
      const detail = await call(orderSchema, `/api/business/orders/${selected}`);
      if (request === generation.current && selected === orderId.current) setOrder(detail);
    }
  }, []);
  const live = useBusinessLive(businessId, refresh);
  async function mutate(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function select(t: RestaurantTable) {
    generation.current++;
    session.current = t.sessionId;
    setBill(null);
    orderId.current = null;
    setOrder(null);
    setQr(null);
    if (t.sessionId) await mutate(refresh);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Masada servis</span>
          <h1>Masalar ve hesaplar</h1>
          <p className="muted">Garson çağrılarını karşıla, ödemeyi kaydet ve masayı kapat.</p>
        </div>
        <span role="status">{live}</span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section className="panel">
        <h2>Bekleyen çağrılar</h2>
        {requests.map((r) => (
          <div className="item-row" key={r.id}>
            <strong>
              {r.label} · {r.kind === "waiter" ? "Garson çağrısı" : "Hesap isteği"}
            </strong>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void mutate(async () => {
                  await call(
                    z.object({ id: z.uuid(), version: z.number() }),
                    `/api/business/table-requests/${r.id}/resolve`,
                    "POST",
                    { expectedVersion: r.version },
                  );
                })
              }
            >
              Karşılandı
            </button>
          </div>
        ))}
        {requests.length === 0 && <p className="muted">Bekleyen çağrı yok.</p>}
      </section>
      <div className="editor-layout">
        <section className="panel">
          <h2>Masalar</h2>
          {tables
            .filter((t) => t.appInstanceId === appInstanceId)
            .map((t) => (
              <article className="item-row" key={t.id}>
                <div>
                  <strong>{t.label}</strong>
                  <span>{branches.find((b) => b.id === t.branchId)?.name}</span>
                  <span className="small muted">
                    {!t.active ? "Devre dışı" : t.sessionId ? "Oturum açık" : "Boş"}
                  </span>
                </div>
                <div className="table-buttons">
                  <button
                    className="secondary"
                    disabled={busy || !t.sessionId}
                    onClick={() => void select(t)}
                  >
                    Hesabı aç
                  </button>
                  {canWrite && (
                    <button
                      className="secondary"
                      disabled={busy || !t.active}
                      onClick={() =>
                        void mutate(async () => {
                          const value = await call(
                            issuedQrSchema,
                            `/api/business/tables/${t.id}/qr`,
                            "POST",
                            {},
                          );
                          const image = await QRCode.toDataURL(value.value, {
                            width: 360,
                            errorCorrectionLevel: "M",
                          });
                          setQr({ value: value.value, image, label: t.label });
                        })
                      }
                    >
                      Masa QR
                    </button>
                  )}
                  {canWrite && (
                    <details>
                      <summary>Düzenle</summary>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const data = new FormData(e.currentTarget);
                          void mutate(async () => {
                            await call(
                              restaurantTableSchema,
                              `/api/business/tables/${t.id}`,
                              "PUT",
                              {
                                expectedVersion: t.version,
                                label: formText(data, "label"),
                                active: data.has("active"),
                              },
                            );
                          });
                        }}
                      >
                        <label>
                          Masa adı
                          <input name="label" defaultValue={t.label} maxLength={40} required />
                        </label>
                        <label className="check">
                          <input type="checkbox" name="active" defaultChecked={t.active} />
                          Etkin
                        </label>
                        <button className="primary" disabled={busy}>
                          Kaydet
                        </button>
                      </form>
                    </details>
                  )}
                </div>
              </article>
            ))}
          {canWrite && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                void mutate(async () => {
                  await call(restaurantTableSchema, "/api/business/tables", "POST", {
                    branchId: formText(data, "branchId"),
                    appInstanceId,
                    label: formText(data, "label"),
                    active: true,
                  });
                  form.reset();
                });
              }}
            >
              <h3>Yeni masa</h3>
              <label>
                Şube
                <select name="branchId" required>
                  {branches
                    .filter((b) => b.active)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Masa adı
                <input name="label" maxLength={40} required />
              </label>
              <button className="primary" disabled={busy}>
                Masa ekle
              </button>
            </form>
          )}
        </section>
        <section className="panel">
          {qr && (
            <div className="table-qr">
              <h2>{qr.label} · imzalı masa QR</h2>
              <Image
                src={qr.image}
                alt={`${qr.label} sipariş QR kodu`}
                width={280}
                height={280}
                unoptimized
              />
              <label>
                QR değeri
                <textarea aria-label="Masa QR değeri" readOnly value={qr.value} />
              </label>
              <button
                className="secondary"
                onClick={() => {
                  window.print();
                }}
              >
                Yazdır
              </button>
            </div>
          )}
          {bill ? (
            <>
              <h2>{bill.label} hesabı</h2>
              <p>
                Toplam {money(bill.totalMinor)} · Ödendi {money(bill.paidMinor)} · Kalan{" "}
                {money(bill.dueMinor)}
              </p>
              {bill.orders.map((o) => (
                <div className="item-row" key={o.id}>
                  <span>
                    #{o.id.slice(0, 8)} · {STATE_LABELS[o.status] ?? o.status} ·{" "}
                    {o.paid ? "Ödendi" : "Ödeme bekliyor"}
                  </span>
                  <button
                    className="secondary"
                    onClick={() =>
                      void mutate(async () => {
                        orderId.current = o.id;
                        const detail = await call(orderSchema, `/api/business/orders/${o.id}`);
                        if (orderId.current === o.id) setOrder(detail);
                      })
                    }
                  >
                    Siparişi aç
                  </button>
                </div>
              ))}
              {order && (
                <OrderActions
                  key={order.id}
                  order={order}
                  onChanged={async (detail) => {
                    if (orderId.current === detail.id) setOrder(detail);
                    await refresh();
                  }}
                />
              )}
              <button
                className="secondary danger"
                disabled={
                  busy ||
                  bill.status !== "open" ||
                  bill.dueMinor > 0 ||
                  bill.orders.some(
                    (o) => !["completed", "rejected", "cancelled"].includes(o.status),
                  )
                }
                onClick={() =>
                  void mutate(async () => {
                    await call(
                      z.object({ id: z.uuid(), status: z.string(), version: z.number() }),
                      `/api/business/table-sessions/${bill.id}/close`,
                      "POST",
                      { expectedVersion: bill.version },
                    );
                  })
                }
              >
                Masayı kapat
              </button>
              <p className="muted small">
                Yalnız tüm siparişler bitip hesap ödendiğinde kapanır. Yeni müşteri yeni oturum
                açar.
              </p>
            </>
          ) : (
            !qr && <p>Bir masanın hesabını veya QR kodunu seç.</p>
          )}
        </section>
      </div>
    </>
  );
}
