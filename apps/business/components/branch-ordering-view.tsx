"use client";
import {
  branchHoursExceptionBodySchema,
  branchOrderingSettingsBodySchema,
  branchOrderingSettingsSchema,
  operationTimeWindowSchema,
} from "@vado/contracts";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { formText, minutesFromTime, timeFromMinutes } from "../lib/values";
const exceptionsSchema = z.object({
  items: z.array(
    z.object({ date: z.string(), hours: z.array(operationTimeWindowSchema), version: z.number() }),
  ),
});
export function BranchOrderingView({
  branchId,
  canWrite,
}: {
  branchId: string;
  canWrite: boolean;
}) {
  const [settings, setSettings] = useState<z.infer<typeof branchOrderingSettingsSchema> | null>(
    null,
  );
  const [exceptions, setExceptions] = useState<z.infer<typeof exceptionsSchema>["items"]>([]);
  const [date, setDate] = useState("");
  const [hours, setHours] = useState<z.infer<typeof operationTimeWindowSchema>[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const root = `/api/business/branches/${branchId}`;
  useEffect(() => {
    let active = true;
    void Promise.all([
      call(branchOrderingSettingsSchema, `${root}/ordering-settings`),
      call(exceptionsSchema, `${root}/hours-exceptions`),
    ])
      .then(([s, e]) => {
        if (active) {
          setSettings(s);
          setExceptions(e.items);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [root]);
  async function mutate(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice("Sipariş ayarları kaydedildi.");
    } catch (cause) {
      setError(errorMessage(cause));
      try {
        setSettings(await call(branchOrderingSettingsSchema, `${root}/ordering-settings`));
        setExceptions((await call(exceptionsSchema, `${root}/hours-exceptions`)).items);
      } catch {
        setError("Bağlantı kesildi. Güncel ayarları görmek için yeniden aç.");
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="subpanel">
      <h3>Hazırlık ve ileri saat</h3>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {settings && (
        <form
          key={settings.version}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void mutate(async () => {
              const body = branchOrderingSettingsBodySchema.parse({
                expectedVersion: settings.version,
                preparationMinutes: Number(formText(data, "prep")),
                slotMinutes: Number(formText(data, "slot")),
                advanceDays: Number(formText(data, "days")),
              });
              setSettings(
                await call(branchOrderingSettingsSchema, `${root}/ordering-settings`, "PUT", body),
              );
            });
          }}
        >
          <fieldset className="editor-fieldset" disabled={!canWrite || busy}>
            <label>
              Hazırlık süresi (dk)
              <input
                name="prep"
                type="number"
                min={1}
                max={240}
                defaultValue={settings.preparationMinutes}
                required
              />
            </label>
            <label>
              Saat aralığı (dk)
              <input
                name="slot"
                type="number"
                min={5}
                max={60}
                defaultValue={settings.slotMinutes}
                required
              />
            </label>
            <label>
              Kaç gün ileri sipariş alınsın?
              <input
                name="days"
                type="number"
                min={1}
                max={30}
                defaultValue={settings.advanceDays}
                required
              />
            </label>
            <button className="primary">Sipariş ayarlarını kaydet</button>
          </fieldset>
        </form>
      )}
      <h3>Özel gün saatleri</h3>
      <p className="muted small">
        Bu tarih için haftalık saatlerin yerini alır. Aralık yoksa şube tüm gün kapalıdır.
      </p>
      <label>
        Tarih
        <input
          type="date"
          value={date}
          onChange={(e) => {
            const next = e.target.value;
            setDate(next);
            setHours(exceptions.find((v) => v.date === next)?.hours ?? []);
          }}
        />
      </label>
      <div className="chip-list">
        {exceptions.map((v) => (
          <button
            className="secondary"
            key={v.date}
            onClick={() => {
              setDate(v.date);
              setHours(v.hours);
            }}
          >
            {v.date} · {v.hours.length === 0 ? "Kapalı" : `${v.hours.length} aralık`}
          </button>
        ))}
      </div>
      {date && (
        <form
          key={date}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void mutate(async () => {
              const body = branchHoursExceptionBodySchema.parse({
                date,
                expectedVersion: exceptions.find((v) => v.date === date)?.version ?? 0,
                hours: hours.map((_, i) => {
                  const opensAt = minutesFromTime(formText(data, `open-${i}`));
                  const closing = minutesFromTime(formText(data, `close-${i}`));
                  return { opensAt, closesAt: closing <= opensAt ? closing + 1440 : closing };
                }),
              });
              await call(
                z.object({
                  date: z.string(),
                  hours: z.array(operationTimeWindowSchema),
                  version: z.number(),
                }),
                `${root}/hours-exceptions`,
                "PUT",
                body,
              );
              setExceptions((await call(exceptionsSchema, `${root}/hours-exceptions`)).items);
            });
          }}
        >
          <fieldset className="editor-fieldset" disabled={!canWrite || busy}>
            {hours.map((h, i) => (
              <div className="hour-row" key={`${date}:${i}`}>
                <label>
                  Açılış
                  <input
                    type="time"
                    name={`open-${i}`}
                    defaultValue={timeFromMinutes(h.opensAt)}
                    required
                  />
                </label>
                <label>
                  Kapanış
                  <input
                    type="time"
                    name={`close-${i}`}
                    defaultValue={timeFromMinutes(h.closesAt)}
                    required
                  />
                </label>
                <button
                  className="secondary danger"
                  type="button"
                  onClick={() => {
                    setHours((current) => current.filter((_, index) => index !== i));
                  }}
                >
                  Kaldır
                </button>
              </div>
            ))}
            <button
              className="secondary"
              type="button"
              disabled={hours.length >= 5}
              onClick={() => {
                setHours((current) => [...current, { opensAt: 540, closesAt: 1020 }]);
              }}
            >
              Özel saat ekle
            </button>
            <button className="primary">Özel günü kaydet</button>
          </fieldset>
        </form>
      )}
    </div>
  );
}
