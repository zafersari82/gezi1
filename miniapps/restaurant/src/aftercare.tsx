import type { Order, ReturnRequest, Review } from "@vado/contracts";
import { vado } from "@vado/miniapp-sdk";
import { useEffect, useState } from "react";

import { money } from "./model";

interface Props {
  order: Order;
  busy: boolean;
  onNotice: (message: string) => void;
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "İşlem tamamlanamadı.";

/** Siparişe bağlı işlemler yalnızca SDK'nın doğruladığı müşteri bağlamında yürütülür. */
export function Aftercare({ order, busy: parentBusy, onNotice }: Props) {
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [favorite, setFavorite] = useState<{ value: boolean; version: number } | null>(null);
  const disabled = busy || parentBusy;

  useEffect(() => {
    let current = true;
    setRequests([]);
    setReview(null);
    setFavorite(null);
    setError("");
    void Promise.all([
      vado.returns.list({ id: order.id }),
      vado.feedback.listReviews({ limit: 100 }),
      vado.feedback.listFavorites({ limit: 100 }),
    ])
      .then(([returns, reviews, favorites]) => {
        if (!current) return;
        setRequests(returns.items);
        const previous = reviews.items.find((item) => item.orderId === order.id) ?? null;
        setReview(previous);
        setRating(previous?.rating ?? 5);
        setComment(previous?.comment ?? "");
        const business = favorites.items.find((item) => item.itemId === null);
        setFavorite(
          business
            ? { value: business.value, version: business.version }
            : { value: false, version: 0 },
        );
      })
      .catch((cause: unknown) => {
        if (current) setError(messageOf(cause));
      });
    return () => {
      current = false;
    };
  }, [order.id]);

  async function execute(action: () => Promise<void>) {
    if (disabled) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="aftercare" aria-label="Sipariş sonrası işlemler">
      <h3>Sipariş sonrası işlemler</h3>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="secondary"
        disabled={disabled || favorite === null}
        onClick={() =>
          void execute(async () => {
            if (!favorite) return;
            const result = await vado.feedback.saveFavorite({
              itemId: null,
              value: !favorite.value,
              expectedVersion: favorite.version,
              key: crypto.randomUUID(),
            });
            setFavorite({ value: result.value, version: result.version });
          })
        }
      >
        {favorite?.value ? "Restoranı favorilerimden çıkar" : "Restoranı favorilerime ekle"}
      </button>
      <div className="aftercare-section">
        <h4>Değerlendirmen</h4>
        <label>
          Puan
          <select
            value={rating}
            disabled={disabled}
            onChange={(event) => { setRating(Number(event.target.value)); }}
          >
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} yıldız
              </option>
            ))}
          </select>
        </label>
        <label>
          Yorum
          <textarea
            maxLength={1000}
            value={comment}
            disabled={disabled}
            onChange={(event) => { setComment(event.target.value); }}
          />
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            void execute(async () => {
              const result = review
                ? await vado.feedback.editReview({
                    id: review.id,
                    rating,
                    comment,
                    expectedVersion: review.version,
                    key: crypto.randomUUID(),
                  })
                : await vado.feedback.createReview({
                    id: order.id,
                    rating,
                    comment,
                    expectedOrderVersion: order.version,
                    key: crypto.randomUUID(),
                  });
              setReview(result);
              onNotice("Değerlendirmen kaydedildi.");
            })
          }
        >
          {review ? "Değerlendirmeyi güncelle" : "Değerlendir"}
        </button>
        {review?.reply && <p>İşletmenin yanıtı: {review.reply}</p>}
      </div>
      <div className="aftercare-section">
        <h4>İptal veya iade</h4>
        {requests.map((request) => (
          <div key={request.id} className="aftercare-request">
            <span>
              {request.kind === "cancel" ? "İptal" : "İade"}: {request.status} ·{" "}
              {money(request.amountMinor)}
            </span>
            {request.status === "pending" && (
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={() =>
                  void execute(async () => {
                    const updated = await vado.returns.withdraw({
                      id: request.id,
                      expectedVersion: request.version,
                      key: crypto.randomUUID(),
                    });
                    setRequests((items) =>
                      items.map((item) => (item.id === updated.id ? updated : item)),
                    );
                  })
                }
              >
                Talebi geri çek
              </button>
            )}
          </div>
        ))}
        <label>
          Talep gerekçesi
          <textarea
            value={reason}
            minLength={3}
            maxLength={500}
            disabled={disabled}
            onChange={(event) => { setReason(event.target.value); }}
          />
        </label>
        <button
          type="button"
          disabled={
            disabled ||
            reason.trim().length < 3 ||
            requests.some((request) => request.status === "pending")
          }
          onClick={() =>
            void execute(async () => {
              const kind = order.paymentStatus === "paid" ? "refund" : "cancel";
              const created = await vado.returns.create({
                id: order.id,
                kind,
                expectedOrderVersion: order.version,
                reason: reason.trim(),
                amountMinor: kind === "refund" ? order.totalMinor : null,
                key: crypto.randomUUID(),
              });
              setRequests((items) => [created, ...items]);
              setReason("");
              onNotice("Talebin işletmeye iletildi.");
            })
          }
        >
          Talep gönder
        </button>
      </div>
    </section>
  );
}
