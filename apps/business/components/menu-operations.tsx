"use client";
import { type Branch, menuWindowBodySchema, menuWindowsBodySchema } from "@vado/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { formText, minutesFromTime, timeFromMinutes } from "../lib/values";
const windowsSchema = z.object({
  branchId: z.uuid(),
  version: z.number(),
  windows: z.array(menuWindowBodySchema),
});
const availabilitySchema = z.object({
  items: z.array(z.object({ itemId: z.uuid(), available: z.boolean(), version: z.number() })),
});
const days = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export function MenuOperations({
  id,
  kind,
  branches,
}: {
  id: string;
  kind: "item" | "category";
  branches: Branch[];
}) {
  const [branch, setBranch] = useState(branches.find((b) => b.active)?.id ?? "");
  const [windows, setWindows] = useState<z.infer<typeof windowsSchema> | null>(null);
  const [rows, setRows] = useState<(z.infer<typeof menuWindowBodySchema> & { key: string })[]>([]);
  const [availability, setAvailability] = useState<{ available: boolean; version: number }>({
    available: true,
    version: 0,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const selectedBranch = useRef(branch);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const generation = useRef(0);
  const root = `/api/business/catalog/${kind === "item" ? "items" : "categories"}/${id}/menu-windows`;
  const load = useCallback(
    async (branchId: string) => {
      if (selectedBranch.current !== branchId) return false;
      const request = ++generation.current;
      const active = () => request === generation.current && selectedBranch.current === branchId;
      setLoading(true);
      setWindows(null);
      setRows([]);
      setError("");
      try {
        const current = await call(windowsSchema, `${root}?branchId=${branchId}`);
        if (current.branchId !== branchId) throw new Error("Şube menüsü uyuşmuyor.");
        let available = { available: true, version: 0 };
        if (kind === "item") {
          const list = await call(
            availabilitySchema,
            `/api/business/branches/${branchId}/availability`,
          );
          available = list.items.find((v) => v.itemId === id) ?? available;
        }
        if (!active()) return false;
        setWindows(current);
        setRows(current.windows.map((w) => ({ ...w, key: crypto.randomUUID() })));
        setAvailability(available);
        return true;
      } catch (cause) {
        if (active()) setError(errorMessage(cause));
        return false;
      } finally {
        if (active()) setLoading(false);
      }
    },
    [id, kind, root],
  );
  useEffect(() => {
    const generationRef = generation;
    let disposed = false;
    queueMicrotask(() => {
      if (branch && !disposed) void load(branch);
    });
    return () => {
      disposed = true;
      generationRef.current++;
    };
  }, [branch, load]);
  async function mutate(action: () => Promise<void>) {
    if (
      lock.current ||
      loading ||
      windows?.branchId !== branch ||
      selectedBranch.current !== branch
    )
      return;
    const target = branch;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      const loaded = await load(target);
      if (loaded && selectedBranch.current === target) setNotice("Menü ayarı kaydedildi.");
    } catch (cause) {
      await load(target);
      if (selectedBranch.current === target) setError(errorMessage(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="subpanel">
      <h3>Şube menüsü ve bulunurluk</h3>
      <label>
        Şube
        <select
          value={branch}
          disabled={busy}
          onChange={(e) => {
            selectedBranch.current = e.target.value;
            generation.current++;
            setWindows(null);
            setRows([]);
            setLoading(true);
            setError("");
            setBranch(e.target.value);
            setNotice("");
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
      {loading && <p role="status">Şube menüsü yükleniyor…</p>}
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
      {kind === "item" && windows && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void mutate(async () => {
              await call(
                z.object({
                  itemId: z.uuid(),
                  branchId: z.uuid(),
                  available: z.boolean(),
                  version: z.number(),
                }),
                `/api/business/catalog/items/${id}/availability`,
                "PUT",
                {
                  branchId: branch,
                  expectedVersion: availability.version,
                  available: !availability.available,
                },
              );
            })
          }
        >
          {availability.available ? "Bu şubede tükendi olarak işaretle" : "Bu şubede yeniden sun"}
        </button>
      )}
      <p className="muted small">
        Saat aralığı yoksa normal şube saatleri geçerlidir. Aralıkları doldurduğunda ürün yalnız bu
        saatlerde sunulur. Kapanış açılıştan erken ise ertesi güne uzar.
      </p>
      {windows && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void mutate(async () => {
              const body = menuWindowsBodySchema.parse({
                branchId: branch,
                expectedVersion: windows.version,
                windows: rows.map((_, i) => {
                  const opensAt = minutesFromTime(formText(data, `open-${i}`));
                  const closing = minutesFromTime(formText(data, `close-${i}`));
                  return {
                    weekday: Number(formText(data, `day-${i}`)),
                    opensAt,
                    closesAt: closing <= opensAt ? closing + 1440 : closing,
                  };
                }),
              });
              await call(windowsSchema, root, "PUT", body);
            });
          }}
        >
          {rows.map((r, i) => (
            <div className="hour-row" key={r.key}>
              <label>
                Gün
                <select name={`day-${i}`} defaultValue={r.weekday} disabled={busy}>
                  {days.map((d, index) => (
                    <option key={d} value={index}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Açılış
                <input
                  type="time"
                  name={`open-${i}`}
                  defaultValue={timeFromMinutes(r.opensAt)}
                  required
                  disabled={busy}
                />
              </label>
              <label>
                Kapanış
                <input
                  type="time"
                  name={`close-${i}`}
                  defaultValue={timeFromMinutes(r.closesAt)}
                  required
                  disabled={busy}
                />
              </label>
              <button
                type="button"
                className="secondary danger"
                disabled={busy}
                onClick={() => {
                  setRows((current) => current.filter((v) => v.key !== r.key));
                }}
              >
                Kaldır
              </button>
            </div>
          ))}
          <button
            className="secondary"
            type="button"
            disabled={busy || rows.length >= 35}
            onClick={() => {
              setRows((current) => [
                ...current,
                { weekday: 1, opensAt: 540, closesAt: 1020, key: crypto.randomUUID() },
              ]);
            }}
          >
            Menü saati ekle
          </button>
          <button className="primary" disabled={busy}>
            Menü saatlerini kaydet
          </button>
        </form>
      )}
    </div>
  );
}
