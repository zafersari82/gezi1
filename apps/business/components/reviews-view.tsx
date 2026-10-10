"use client";

import { type Review, reviewReplyBodySchema, reviewSchema } from "@vado/contracts";
import { type SyntheticEvent, useRef, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { orderDisplayNumber } from "../lib/order-display";
import { formText } from "../lib/values";

const listSchema = z.object({
  items: z.array(reviewSchema),
  nextCursor: z.string().nullable(),
});
type Page = z.infer<typeof listSchema>;

export function ReviewsView({ initial, canReply }: { initial: Page; canReply: boolean }) {
  const [page, setPage] = useState(initial);
  const [selected, setSelected] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const replyLock = useRef(false);

  async function load(cursor?: string) {
    const request = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "30" });
      if (cursor !== undefined) query.set("cursor", cursor);
      const result = await call(listSchema, `/api/business/reviews?${query}`);
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
      if (cursor === undefined)
        setSelected((current) => result.items.find((item) => item.id === current?.id) ?? null);
    } catch (cause) {
      if (request === requestId.current) setError(errorMessage(cause));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }

  async function reply(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canReply || selected === null || replyLock.current) return;
    replyLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const fields = new FormData(event.currentTarget);
      const body = reviewReplyBodySchema.parse({
        expectedVersion: selected.version,
        reply: formText(fields, "reply"),
      });
      const updated = await call(
        reviewSchema,
        `/api/business/reviews/${selected.id}/reply`,
        "PUT",
        body,
        crypto.randomUUID(),
      );
      setPage((previous) => ({
        ...previous,
        items: previous.items.map((item) => (item.id === updated.id ? updated : item)),
      }));
      setSelected(updated);
      setNotice("İşletme yanıtı kaydedildi.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      replyLock.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Müşteri deneyimi</span>
          <h1>Değerlendirmeler</h1>
          <p className="muted">
            Siparişlerden gelen gerçek değerlendirmeleri gör ve müşterilere yanıt ver.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <span className="muted small">En yeni değerlendirmeler önce listelenir.</span>
        <button className="secondary" disabled={loading || busy} onClick={() => void load()}>
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
            <h2>Müşteri yorumları</h2>
            <span className="muted small">{page.items.length} kayıt</span>
          </div>
          {page.items.map((item) => (
            <button
              key={item.id}
              className={selected?.id === item.id ? "record-card selected" : "record-card"}
              type="button"
              disabled={busy}
              onClick={() => {
                setSelected(item);
                setError("");
                setNotice("");
              }}
            >
              <span className="record-heading">
                <strong aria-label={`${item.rating} / 5 yıldız`}>
                  {"★".repeat(item.rating)}
                  {"☆".repeat(5 - item.rating)}
                </strong>
                <span className="small muted">
                  {new Date(item.createdAt).toLocaleDateString("tr-TR")}
                </span>
              </span>
              <span className="record-preview">{item.comment || "Yazılı yorum bırakılmamış."}</span>
              <span className="small muted">
                Sipariş {orderDisplayNumber(item.orderId)} ·{" "}
                {item.visibility === "published" ? "Yayında" : "Gizli"}
              </span>
              {item.reply !== null && <span className="badge">Yanıtlandı</span>}
            </button>
          ))}
          {loading && (
            <p role="status" className="muted">
              Değerlendirmeler yükleniyor…
            </p>
          )}
          {!loading && page.items.length === 0 && (
            <p className="muted">Henüz değerlendirme bulunmuyor.</p>
          )}
          {page.nextCursor !== null && (
            <button
              className="secondary"
              disabled={loading || busy}
              onClick={() => void load(page.nextCursor ?? undefined)}
            >
              Daha fazla göster
            </button>
          )}
        </section>
        <section className="panel">
          {selected === null ? (
            <div className="empty">
              <h2>Bir değerlendirme seç</h2>
              <p>Yorumun tamamını ve işletme yanıtını burada göreceksin.</p>
            </div>
          ) : (
            <div className="form-stack">
              <div className="section-heading">
                <h2>Sipariş {orderDisplayNumber(selected.orderId)}</h2>
                <span className="badge">{selected.rating} / 5</span>
              </div>
              <p className="record-comment">{selected.comment || "Yazılı yorum bırakılmamış."}</p>
              {selected.reply !== null && (
                <p className="small muted">Mevcut işletme yanıtı: {selected.reply}</p>
              )}
              {canReply ? (
                <form
                  key={`${selected.id}:${selected.version}`}
                  className="form-stack"
                  onSubmit={(event) => void reply(event)}
                >
                  <fieldset className="editor-fieldset form-stack" disabled={busy}>
                    <label>
                      İşletme yanıtı
                      <textarea
                        name="reply"
                        minLength={1}
                        maxLength={1000}
                        required
                        defaultValue={selected.reply ?? ""}
                        placeholder="Müşteriye açıklayıcı ve nazik bir yanıt yaz"
                      />
                    </label>
                    <button type="submit" className="primary">
                      Yanıtı kaydet
                    </button>
                  </fieldset>
                </form>
              ) : (
                <p className="muted">
                  Yanıt yazma yetkisi yalnızca işletme sahibi ve yöneticilerde.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
