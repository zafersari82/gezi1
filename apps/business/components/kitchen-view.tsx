"use client";
import {
  type Branch,
  type LiveEvent,
  mergeOrderSnapshot,
  type Order,
  orderSchema,
} from "@vado/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { STATE_LABELS } from "../lib/values";
import { OrderActions } from "./order-actions";
import { useBusinessLive } from "./use-business-live";
const queueSchema = z.object({ items: z.array(orderSchema), nextCursor: z.string().nullable() });
export function KitchenView({
  businessId,
  appInstanceId,
  branches,
  initial,
  device = false,
  title,
}: {
  businessId: string;
  appInstanceId: string;
  branches: Branch[];
  initial: z.infer<typeof queueSchema>;
  device?: boolean;
  title: string;
}) {
  const [list, setList] = useState(initial);
  const [branch, setBranch] = useState(branches[0]?.id ?? "");
  const branchRef = useRef(branch);
  const pages = useRef(1);
  const request = useRef(0);
  const [error, setError] = useState("");
  const [sound, setSound] = useState(false);
  const [wakeStatus, setWakeStatus] = useState("Ekranı açık tutmak için aşağıdaki düğmeye dokun.");
  const audio = useRef<AudioContext | null>(null);
  const wake = useRef<WakeLockSentinel | null>(null);
  const keepAwake = useRef(false);
  const disposed = useRef(false);
  const refresh = useCallback(async () => {
    const generation = ++request.current;
    try {
      const items: Order[] = [];
      let cursor: string | undefined;
      let nextCursor: string | null = null;
      for (let page = 0; page < pages.current; page++) {
        const query = new URLSearchParams({ limit: "50", active: "true" });
        if (cursor) query.set("cursor", cursor);
        if (!device) {
          query.set("appInstanceId", appInstanceId);
          if (branchRef.current) query.set("branchId", branchRef.current);
        }
        const response = await call(
          queueSchema,
          `${device ? "/api/kitchen/queue" : "/api/business/kitchen-queue"}?${query}`,
        );
        if (generation !== request.current) return;
        items.push(...response.items);
        nextCursor = response.nextCursor;
        if (nextCursor === null) break;
        cursor = nextCursor;
      }
      setList((current) => ({
        items: items.map((o) =>
          mergeOrderSnapshot(current.items.find((c) => c.id === o.id) ?? null, o),
        ),
        nextCursor,
      }));
      setError("");
    } catch (cause) {
      if (generation === request.current) setError(errorMessage(cause));
      throw cause;
    }
  }, [appInstanceId, device]);
  const beep = useCallback(() => {
    const context = audio.current;
    if (context?.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.15, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.4);
  }, []);
  const newOrder = useCallback(
    (event: LiveEvent) => {
      if (
        event.appInstanceId === appInstanceId &&
        (branchRef.current === "" || event.branchId === branchRef.current)
      )
        beep();
    },
    [appInstanceId, beep],
  );
  const live = useBusinessLive(businessId, refresh, device, newOrder);
  const acquireWake = useCallback(async () => {
    const wantsWake = () => keepAwake.current && !disposed.current;
    if (!keepAwake.current || document.visibilityState !== "visible" || wake.current !== null)
      return;
    if (!("wakeLock" in navigator)) {
      setWakeStatus(
        "Bu tarayıcı ekran kilidini desteklemiyor. Tablet ayarlarından uyku süresini uzat.",
      );
      return;
    }
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      if (!wantsWake()) {
        await sentinel.release();
        return;
      }
      wake.current = sentinel;
      setWakeStatus("Ekran açık tutuluyor.");
      sentinel.addEventListener("release", () => {
        if (wake.current === sentinel) wake.current = null;
        if (!disposed.current)
          setWakeStatus("Ekran kilidi serbest kaldı. Görünür olduğunda yeniden alınır.");
      });
    } catch {
      setWakeStatus("Ekran kilidi alınamadı. Pil veya tarayıcı ayarlarını kontrol et.");
    }
  }, []);
  async function activate() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      if (audio.current.state !== "running") throw new Error("Ses açılamadı.");
      setSound(true);
      beep();
    } catch {
      setError("Ses açılamadı. Ses düğmesine yeniden dokun ve tablet sesini kontrol et.");
    }
    keepAwake.current = true;
    await acquireWake();
  }
  useEffect(() => {
    disposed.current = false;
    const visibility = () => {
      if (document.visibilityState === "visible") {
        void acquireWake();
        void refresh().catch((cause: unknown) => {
          setError(errorMessage(cause));
        });
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed.current = true;
      keepAwake.current = false;
      void wake.current?.release();
      void audio.current?.close();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh, acquireWake]);
  const accept = async (o: Order) => {
    setList((current) => ({
      ...current,
      items: current.items.map((c) => (c.id === o.id ? mergeOrderSnapshot(c, o) : c)),
    }));
    await refresh();
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Mutfak operasyonu</span>
          <h1>{title}</h1>
          <p className="muted">
            {branches.find((b) => b.id === branch)?.name ?? "Eşleştirilen şube"} · Notlar ve teslim
            saatleri
          </p>
        </div>
        <span role="status" className={live === "Canlı" ? "live-status" : "connection-warning"}>
          {live}
        </span>
      </div>
      <div className="kitchen-controls">
        <button className="primary" onClick={() => void activate()}>
          {sound ? "Deneme sesi çal" : "Sesi ve ekranı aç"}
        </button>
        <span role="status">
          {sound ? "Ses açık" : "Ses kapalı"} · {wakeStatus}
        </span>
        {!device && (
          <label>
            Şube
            <select
              value={branch}
              onChange={(e) => {
                branchRef.current = e.target.value;
                setBranch(e.target.value);
                pages.current = 1;
                setList({ items: [], nextCursor: null });
                void refresh().catch((cause: unknown) => {
                  setError(errorMessage(cause));
                });
              }}
            >
              {branches
                .filter((b) => b.active)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <button
          className="secondary"
          onClick={() =>
            void refresh().catch((cause: unknown) => {
              setError(errorMessage(cause));
            })
          }
        >
          Yenile
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="muted small">
        {list.items.length} aktif sipariş · En eski siparişler önce. İleri saatler ayrıca
        işaretlenir.
      </p>
      <div className="kitchen-grid">
        {list.items.map((o) => (
          <article
            className={`panel kitchen-card status-${o.status}`}
            key={o.id}
            data-order-id={o.id}
          >
            <div className="section-heading">
              <h2>#{o.id.slice(0, 8).toUpperCase()}</h2>
              <span className={`badge status-${o.status}`}>
                {STATE_LABELS[o.status] ?? o.status}
              </span>
            </div>
            <p>
              {o.fulfilment === "dine_in" ? "Masada servis" : "Gel al"} ·{" "}
              {new Date(o.createdAt).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {o.fulfilment === "dine_in" && o.tableLabel && (
              <p>
                <strong>{o.tableLabel}</strong>
              </p>
            )}
            {o.scheduledAt && (
              <p className="scheduled-time">
                İleri saat · {new Date(o.scheduledAt).toLocaleString("tr-TR")}
              </p>
            )}
            <ul className="kitchen-lines">
              {o.lines.map((l) => (
                <li key={l.id}>
                  <strong>
                    {l.quantity} × {l.name}
                  </strong>
                  {l.options.length > 0 && <span>{l.options.map((p) => p.name).join(", ")}</span>}
                  {l.note && <p className="order-note">{l.note}</p>}
                </li>
              ))}
            </ul>
            <OrderActions order={o} onChanged={accept} device={device} />
          </article>
        ))}
      </div>
      {list.items.length === 0 && (
        <div className="panel empty">
          <h2>Bekleyen sipariş yok.</h2>
          <p>Yeni işler canlı akışta görünecek.</p>
        </div>
      )}
      {list.nextCursor !== null && (
        <button
          className="secondary"
          onClick={() => {
            pages.current++;
            void refresh().catch((cause: unknown) => {
              setError(errorMessage(cause));
            });
          }}
        >
          Diğer siparişleri göster
        </button>
      )}
    </>
  );
}
