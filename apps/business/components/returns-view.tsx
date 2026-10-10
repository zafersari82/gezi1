"use client";

import {
  type ReturnDecisionBody,
  returnDecisionBodySchema,
  type ReturnRequest,
  returnRequestSchema,
} from "@vado/contracts";
import { type FormEvent, useRef, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { money } from "../lib/values";

const listSchema = z.object({
  items: z.array(returnRequestSchema),
  nextCursor: z.string().nullable(),
});
type Page = z.infer<typeof listSchema>;
type Filter = "pending" | "approved" | "rejected" | "withdrawn" | "all";
const statuses: readonly { id: Filter; label: string }[] = [
  { id: "pending", label: "Bekleyen" },
  { id: "approved", label: "Onaylanan" },
  { id: "rejected", label: "Reddedilen" },
  { id: "withdrawn", label: "Geri çekilen" },
  { id: "all", label: "Tümü" },
];
const statusLabel: Record<ReturnRequest["status"], string> = {
  pending: "Karar bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  withdrawn: "Geri çekildi",
};

export function ReturnsView({ initial }: { initial: Page }) {
  const [page, setPage] = useState(initial);
  const [filter, setFilter] = useState<Filter>("pending");
  const [selected, setSelected] = useState<ReturnRequest | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("reject");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const decisionLock = useRef(false);

  async function load(nextFilter: Filter, cursor?: string) {
    const request = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "30" });
      if (nextFilter !== "all") query.set("status", nextFilter);
      if (cursor !== undefined) query.set("cursor", cursor);
      const result = await call(listSchema, `/api/business/returns?${query}`);
      if (request !== requestId.current) return;
      setPage((previous) =>
        cursor === undefined
          ? result
          : {
              items: [
                ...new Map([...previous.items, ...result.items].map((r) => [r.id, r])).values(),
              ],
              nextCursor: result.nextCursor,
            },
      );
    } catch (cause) {
      if (request === requestId.current) setError(errorMessage(cause));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === null || selected.status !== "pending" || decisionLock.current) return;
    const target = selected;
    decisionLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const fields = new FormData(event.currentTarget);
      const needsReceipt =
        decision === "approve" && (target.kind === "refund" || target.amountMinor > 0);
      const body: ReturnDecisionBody = returnDecisionBodySchema.parse({
        expectedVersion: target.version,
        expectedOrderVersion: target.orderVersion,
        decision,
        reason: String(fields.get("reason") ?? ""),
        physicalRefund: needsReceipt
          ? {
              method: fields.get("method") === "card" ? "card" : "cash",
              reference: String(fields.get("reference") ?? ""),
            }
          : null,
      });
      const updated = await call(
        returnRequestSchema,
        `/api/business/returns/${target.id}/decision`,
        "PUT",
        body,
        crypto.randomUUID(),
      );
      setSelected(updated);
      setPage((previous) => ({
        ...previous,
        items:
          filter !== "all" && updated.status !== filter
            ? previous.items.filter((item) => item.id !== updated.id)
            : previous.items.map((item) => (item.id === updated.id ? updated : item)),
      }));
      setNotice("Karar kaydedildi. İşlem ve denetim kayıtları güncellendi.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      decisionLock.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Satış sonrası</span>
          <h1>İade ve iptal talepleri</h1>
          <p className="muted">
            Talepleri incele, gerekçeli karar ver ve fiziksel ödeme kaydını sakla.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <div className="tabs" aria-label="İade durumu">
          {statuses.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={filter === id ? "selected" : ""}
              aria-pressed={filter === id}
              onClick={() => {
                if (id === filter) return;
                setFilter(id);
                setSelected(null);
                setDecision("reject");
                setPage({ items: [], nextCursor: null });
                setNotice("");
                void load(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="secondary"
          type="button"
          disabled={loading || busy}
          onClick={() => void load(filter)}
        >
          Yenile
        </button>
      </div>
      {error !== "" && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice !== "" && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <div className="editor-layout">
        <section className="panel">
          <div className="section-heading">
            <h2>Talepler</h2>
            <span className="muted small">{page.items.length} kayıt</span>
          </div>
          {page.items.map((item) => (
            <button
              className={selected?.id === item.id ? "record-card selected" : "record-card"}
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => {
                setSelected(item);
                setDecision("reject");
                setError("");
                setNotice("");
              }}
            >
              <span className="record-heading">
                <strong>#{item.orderId.slice(0, 8).toUpperCase()}</strong>
                <span className="badge">{statusLabel[item.status]}</span>
              </span>
              <span className="small muted">
                {item.kind === "cancel" ? "Sipariş iptali" : "Tutar iadesi"} ·{" "}
                {new Date(item.createdAt).toLocaleDateString("tr-TR")}
              </span>
              <strong>{money(item.amountMinor)}</strong>
            </button>
          ))}
          {loading && (
            <p role="status" className="muted">
              Talepler yükleniyor…
            </p>
          )}
          {!loading && page.items.length === 0 && (
            <p className="muted">Bu durumda talep bulunmuyor.</p>
          )}
          {page.nextCursor !== null && (
            <button
              className="secondary"
              disabled={loading || busy}
              onClick={() => void load(filter, page.nextCursor ?? undefined)}
            >
              Daha fazla göster
            </button>
          )}
        </section>
        <section className="panel">
          {selected === null ? (
            <div className="empty">
              <h2>Bir talep seç</h2>
              <p>Talebin gerekçesi ve karar alanı burada açılacak.</p>
            </div>
          ) : (
            <div className="form-stack">
              <div className="section-heading">
                <h2>Talep #{selected.id.slice(0, 8).toUpperCase()}</h2>
                <span className="badge">{statusLabel[selected.status]}</span>
              </div>
              <dl className="record-facts">
                <div>
                  <dt>Sipariş</dt>
                  <dd>#{selected.orderId.slice(0, 8).toUpperCase()}</dd>
                </div>
                <div>
                  <dt>Tür</dt>
                  <dd>{selected.kind === "cancel" ? "İptal" : "Tutar iadesi"}</dd>
                </div>
                <div>
                  <dt>Tutar</dt>
                  <dd>{money(selected.amountMinor)}</dd>
                </div>
                <div>
                  <dt>Müşteri gerekçesi</dt>
                  <dd>{selected.reason}</dd>
                </div>
                {selected.decisionReason !== null && (
                  <div>
                    <dt>İşletme kararı</dt>
                    <dd>{selected.decisionReason}</dd>
                  </div>
                )}
                {selected.receipt !== null && (
                  <div>
                    <dt>Fiziksel ödeme kaydı</dt>
                    <dd>
                      {selected.receipt.method === "card" ? "Kart" : "Nakit"} ·{" "}
                      {selected.receipt.reference}
                    </dd>
                  </div>
                )}
              </dl>
              {selected.status === "pending" && (
                <form
                  key={selected.id}
                  className="form-stack"
                  onSubmit={(event) => void decide(event)}
                >
                  <fieldset className="editor-fieldset form-stack" disabled={busy}>
                    <label>
                      Karar
                      <select
                        name="decision"
                        required
                        value={decision}
                        onChange={(event) => { setDecision(event.target.value === "approve" ? "approve" : "reject"); }
                        }
                      >
                        <option value="reject">Talebi reddet</option>
                        <option value="approve">Talebi onayla</option>
                      </select>
                    </label>
                    <label>
                      Gerekçe
                      <textarea
                        name="reason"
                        minLength={3}
                        maxLength={500}
                        required
                        placeholder="Kararın gerekçesini yaz"
                      />
                    </label>
                    {decision === "approve" &&
                      (selected.kind === "refund" || selected.amountMinor > 0) && (
                        <>
                          <label>
                            Gerçekleştirilen fiziksel iade yöntemi
                            <select name="method" defaultValue="cash" required>
                              <option value="cash">Nakit</option>
                              <option value="card">Kart</option>
                            </select>
                          </label>
                          <label>
                            İşlem referansı
                            <input
                              name="reference"
                              minLength={1}
                              maxLength={120}
                              required
                              placeholder="Dekont veya banka işlem referansı"
                            />
                          </label>
                          <label className="check-label">
                            <input type="checkbox" required />
                            <span>
                              {money(selected.amountMinor)} tutarındaki gerçek iadeyi yaptım ve
                              referansını doğruladım.
                            </span>
                          </label>
                        </>
                      )}
                    <p className="muted small">
                      Onay işlemi sipariş ve muhasebe kayıtlarını değiştirir; seçimini kaydetmeden
                      önce kontrol et.
                    </p>
                    <button type="submit" className="primary">
                      Kararı kaydet
                    </button>
                  </fieldset>
                </form>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
