"use client";
import { type Branch, type OperationDevice, operationDeviceSchema } from "@vado/contracts";
import { useRef, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { formText } from "../lib/values";
import { useNow } from "./use-now";
export function DevicesView({
  initial,
  branches,
  appInstanceId,
}: {
  initial: OperationDevice[];
  branches: Branch[];
  appInstanceId: string;
}) {
  const [devices, setDevices] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const now = useNow(10_000);
  const [notice, setNotice] = useState("");
  async function mutate(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      setDevices(
        (await call(z.object({ items: z.array(operationDeviceSchema) }), "/api/business/devices"))
          .items,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Sınırlı cihaz yetkisi</span>
          <h1>Mutfak tabletleri</h1>
          <p className="muted">
            Kod yalnızca beş dakika geçerlidir. Onaylanan tabletin yetkisi seçilen şube ve uygulama
            kaydının mutfağıyla sınırlıdır.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      <div className="editor-layout">
        <section className="panel">
          <h2>Bağlı cihazlar</h2>
          {devices.map((d) => (
            <article className="item-row" key={d.id}>
              <div>
                <strong>{d.label}</strong>
                <span>{branches.find((b) => b.id === d.branchId)?.name ?? "Şube"}</span>
                <span className="small muted">
                  {d.revokedAt
                    ? "Uzaktan kapatıldı"
                    : Date.parse(d.expiresAt) <= now
                      ? "Yetki süresi doldu"
                      : `Yetki sonu: ${new Date(d.expiresAt).toLocaleString("tr-TR")}`}
                </span>
              </div>
              <button
                className="secondary danger"
                disabled={busy || d.revokedAt !== null}
                onClick={() =>
                  void mutate(async () => {
                    await call(
                      operationDeviceSchema,
                      `/api/business/devices/${d.id}/revoke`,
                      "POST",
                      {},
                    );
                    setNotice("Tablet yetkisi kapatıldı. Açık bağlantısı da sonlandırılır.");
                  })
                }
              >
                Uzaktan kapat
              </button>
            </article>
          ))}
          {devices.length === 0 && <p>Henüz eşleştirilen tablet yok.</p>}
        </section>
        <section className="panel">
          <h2>Tableti onayla</h2>
          <p>
            Ortak tablette{" "}
            <a href="/kitchen-pair" target="_blank" rel="noreferrer">
              eşleştirme ekranını
            </a>{" "}
            aç. Orada görünen kodu buraya yaz.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = new FormData(form);
              void mutate(async () => {
                await call(operationDeviceSchema, "/api/business/devices", "POST", {
                  code: formText(data, "code"),
                  label: formText(data, "label"),
                  branchId: formText(data, "branchId"),
                  appInstanceId,
                });
                form.reset();
                setNotice("Tablet onaylandı. Eşleştirme ekranı mutfağa yönlendirecek.");
              });
            }}
          >
            <label>
              Eşleştirme kodu
              <input
                name="code"
                pattern="[0-9]{8}"
                inputMode="numeric"
                minLength={8}
                maxLength={8}
                required
              />
            </label>
            <label>
              Tablet adı
              <input name="label" maxLength={40} required placeholder="Örneğin: sıcak mutfak" />
            </label>
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
            <button className="primary" disabled={busy}>
              Tableti onayla
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
