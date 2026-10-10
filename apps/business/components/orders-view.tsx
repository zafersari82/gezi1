"use client";
import {
  FULFILMENT_LABELS,
  mergeOrderSnapshot,
  type Order,
  orderSchema,
  type OrderSummary,
  orderSummarySchema,
  TERMINAL_ORDER_STATES,
} from "@vado/contracts";
import { useCallback, useRef, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { operationalDateTime, orderDisplayNumber } from "../lib/order-display";
import { type OrderFilter, orderListSearch } from "../lib/order-query";
import { money, STATE_LABELS } from "../lib/values";
import { OrderActions } from "./order-actions";
import { useBusinessLive } from "./use-business-live";

const listSchema = z.object({
  items: z.array(orderSummarySchema),
  nextCursor: z.string().nullable(),
});
type OrderList = z.infer<typeof listSchema>;
export function OrdersView({
  businessId,
  initial,
  title,
  states,
  manageBranchIds,
}: {
  businessId: string;
  initial: OrderList;
  title: string;
  states: string[];
  /** Siparişi işleyebildiği şubeler; `null` bütün şubeler. */
  manageBranchIds: string[] | null;
}) {
  const [list, setList] = useState(initial);
  const [filter, setFilter] = useState<OrderFilter>("active");
  const filterRef = useRef<OrderFilter>("active");
  const pages = useRef(1);
  const listRequest = useRef(0);
  const [selected, setSelected] = useState<Order | null>(null);
  const selectedId = useRef<string | null>(null);
  const selectionRequest = useRef(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshed, setRefreshed] = useState<Date | null>(null);
  const acceptDetail = useCallback((detail: Order) => {
    if (selectedId.current !== detail.id) return;
    setSelected((current) => {
      if (selectedId.current !== detail.id) return current;
      return mergeOrderSnapshot(current, detail);
    });
  }, []);
  const refresh = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    try {
      const items: OrderSummary[] = [];
      let cursor: string | undefined;
      let nextCursor: string | null = null;
      for (let page = 0; page < pages.current; page++) {
        const latest = await call(
          listSchema,
          `/api/business/orders?${orderListSearch(filterRef.current, states, cursor)}`,
        );
        if (request !== listRequest.current) return;
        items.push(...latest.items);
        nextCursor = latest.nextCursor;
        if (nextCursor === null) break;
        cursor = nextCursor;
      }
      setList({ items: [...new Map(items.map((item) => [item.id, item])).values()], nextCursor });
      setRefreshed(new Date());
      const id = selectedId.current;
      const selection = selectionRequest.current;
      if (id !== null) {
        const detail = await call(orderSchema, `/api/business/orders/${id}`);
        if (request === listRequest.current && selection === selectionRequest.current)
          acceptDetail(detail);
      }
    } catch (cause) {
      if (request === listRequest.current) setError(errorMessage(cause));
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [states, acceptDetail]);
  const live = useBusinessLive(businessId, refresh);
  async function open(order: OrderSummary) {
    const selection = ++selectionRequest.current;
    selectedId.current = order.id;
    setSelected(null);
    setError("");
    try {
      const detail = await call(orderSchema, `/api/business/orders/${order.id}`);
      if (selection === selectionRequest.current) acceptDetail(detail);
    } catch (cause) {
      if (selection === selectionRequest.current) setError(errorMessage(cause));
    }
  }
  const terminal: readonly string[] = TERMINAL_ORDER_STATES;
  const active = list.items.filter((o) => !terminal.includes(o.status));
  const visible = list.items;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Günlük operasyon</span>
          <h1>{title}</h1>
          <p className="muted">Gelen işleri gör, doğru adımla ilerlet.</p>
        </div>
        <div className="live-status" role="status">
          <span className={live === "Canlı" ? "status-dot" : "status-dot paused"} />
          {live}
        </div>
      </div>
      <div className="metrics">
        <div>
          <span>Listelenen aktif</span>
          <strong>{active.length}</strong>
        </div>
        <div>
          <span>Listelenen yeni</span>
          <strong>{list.items.filter((o) => o.status === "placed").length}</strong>
        </div>
        <div>
          <span>Listelenen tutar</span>
          <strong>{money(list.items.reduce((sum, o) => sum + o.totalMinor, 0))}</strong>
        </div>
      </div>
      <div className="toolbar">
        <div className="tabs" aria-label="Sipariş süzgeci">
          {(
            [
              ["active", "Aktif"],
              ["placed", "Yeni"],
              ["all", "Tümü"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "selected" : ""}
              onClick={() => {
                if (filterRef.current === value) return;
                filterRef.current = value;
                pages.current = 1;
                setFilter(value);
                setList({ items: [], nextCursor: null });
                setError("");
                void refresh();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="secondary" onClick={refresh}>
          Yenile
        </button>
      </div>
      {error !== "" && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="orders-layout">
        <section className="panel order-list">
          <div className="section-heading">
            <h2>Sipariş akışı</h2>
            <span className="muted small">{visible.length} sipariş</span>
          </div>
          {visible.map((o) => (
            <button
              key={o.id}
              className={selected?.id === o.id ? "order-card selected" : "order-card"}
              onClick={() => open(o)}
            >
              <div className="order-top">
                <strong>{orderDisplayNumber(o.id)}</strong>
                <span className={`badge status-${o.status}`}>
                  {STATE_LABELS[o.status] ?? o.status}
                </span>
              </div>
              <div className="order-bottom">
                <span className="muted">
                  {operationalDateTime(o.createdAt, o.branchTimezone)} ·{" "}
                  {FULFILMENT_LABELS[o.fulfilment]}
                </span>
                <strong>{money(o.totalMinor)}</strong>
              </div>
            </button>
          ))}
          {visible.length === 0 && loading && <p role="status">Siparişler yükleniyor.</p>}
          {visible.length === 0 && !loading && (
            <div className="empty">
              <span className="empty-symbol">✓</span>
              <h2>Burada bekleyen iş yok.</h2>
              <p>Yeni sipariş geldiğinde kendiliğinden görünecek.</p>
            </div>
          )}
          {list.nextCursor !== null && (
            <button
              className="secondary"
              disabled={loading}
              onClick={() => {
                pages.current++;
                void refresh();
              }}
            >
              Daha eski siparişleri göster
            </button>
          )}
        </section>
        <section className="panel order-detail">
          {selected === null ? (
            <div className="empty">
              <span className="empty-symbol">↗</span>
              <h2>Bir sipariş seç.</h2>
              <p>Ürünleri, tutarı ve sıradaki adımı burada göreceksin.</p>
            </div>
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Sipariş ayrıntısı</span>
                  <h2>{orderDisplayNumber(selected.id)}</h2>
                </div>
                <span className={`badge status-${selected.status}`}>
                  {STATE_LABELS[selected.status] ?? selected.status}
                </span>
              </div>
              <ul className="order-lines">
                {selected.lines.map((line) => (
                  <li key={line.id}>
                    <div>
                      <strong>
                        {line.quantity} × {line.name}
                      </strong>
                      {line.note && <span className="order-note">{line.note}</span>}
                      {line.options.map((option) => (
                        <span className="small muted" key={option.id}>
                          {option.name}
                        </span>
                      ))}
                    </div>
                    <strong>{money(line.totalMinor)}</strong>
                  </li>
                ))}
              </ul>
              <dl className="order-total">
                <dt>KDV dahil toplam</dt>
                <dd>{money(selected.totalMinor)}</dd>
                <dt>İçindeki KDV</dt>
                <dd>{money(selected.vatMinor)}</dd>
              </dl>
              {manageBranchIds === null || manageBranchIds.includes(selected.branchId) ? (
                <OrderActions
                  key={selected.id}
                  order={selected}
                  onChanged={async (detail) => {
                    acceptDetail(detail);
                    await refresh();
                  }}
                />
              ) : (
                <p className="muted small">
                  Bu siparişi görüntüleyebilirsiniz; işlem yapma yetkiniz yok.
                </p>
              )}
              <h3 className="history-title">İşlem geçmişi</h3>
              <ol className="history">
                {selected.history.map((entry) => (
                  <li key={entry.version}>
                    <span>{STATE_LABELS[entry.toStatus] ?? entry.toStatus}</span>
                    <time>{operationalDateTime(entry.createdAt, selected.branchTimezone)}</time>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
      <p className="small muted page-foot">
        {refreshed === null
          ? "Canlı bağlantı kurulduğunda liste yenilenir."
          : `Son yenileme ${refreshed.toLocaleTimeString("tr-TR")}`}
      </p>
    </>
  );
}
