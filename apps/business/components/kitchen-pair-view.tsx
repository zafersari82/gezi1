"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
const pairingSchema = z.object({ code: z.string(), expiresAt: z.string() });
export function KitchenPairView() {
  const [pairing, setPairing] = useState<z.infer<typeof pairingSchema> | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function start() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setPairing(await call(pairingSchema, "/api/device-pairing/start", "POST", {}));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let disposed = false;
    let polling = false;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (pairing === null || Date.now() >= Date.parse(pairing.expiresAt) || polling) return;
      polling = true;
      void call(
        z.object({ status: z.enum(["pending", "approved"]) }),
        "/api/device-pairing/poll",
        "POST",
        {},
      )
        .then((result) => {
          if (!disposed && result.status === "approved") window.location.assign("/tablet");
        })
        .catch((cause: unknown) => {
          if (!disposed) setError(errorMessage(cause));
        })
        .finally(() => {
          polling = false;
        });
    }, 2500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [pairing]);
  const seconds =
    pairing === null ? 0 : Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - now) / 1000));
  return (
    <main className="pair-page panel">
      <span className="eyebrow">Ortak mutfak tableti</span>
      <h1>Tableti eşleştir</h1>
      <p>
        Kişisel hesap açmadan yalnızca bu şubenin mutfağını kullan. İşletme yöneticisi VADO Business
        içindeki Cihazlar ekranından kodu onaylar.
      </p>
      {pairing && seconds > 0 ? (
        <>
          <output className="pair-code" aria-label="Eşleştirme kodu">
            {pairing.code}
          </output>
          <p role="status">Onay bekleniyor · {seconds} saniye kaldı</p>
        </>
      ) : (
        <button className="primary" disabled={busy} onClick={() => void start()}>
          {pairing ? "Kod doldu · yeni kod oluştur" : "Eşleştirme kodu oluştur"}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
