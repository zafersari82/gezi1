"use client";
import {
  type Branch,
  branchBodySchema,
  branchHoursBodySchema,
  branchSchema,
} from "@vado/contracts";
import { useRef, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { formText, minutesFromTime, timeFromMinutes } from "../lib/values";
import { BranchAvailabilityGrants } from "./branch-availability-grants";
import { BranchLocationFields } from "./branch-location-fields";
import { BusinessRegionsView } from "./business-regions-view";
import { OrderAccessGrants } from "./order-access-grants";
import { BranchOrderingView } from "./branch-ordering-view";
type Hours = z.infer<typeof branchHoursBodySchema>;
type Mutation = (run: () => Promise<void>) => Promise<void>;
const weekdays = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export function BranchesView({ initial, canWrite, canDelegate }: { initial: Branch[]; canWrite: boolean; canDelegate: boolean }) {
  const [branches, setBranches] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hoursRequest = useRef(0);
  const [hours, setHours] = useState<Hours | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const branch = branches.find((b) => b.id === selectedId);
  const mutate: Mutation = async (run) => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await run();
      setBranches(
        (await call(z.object({ items: z.array(branchSchema) }), "/api/business/branches")).items,
      );
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  async function open(id: string) {
    const request = ++hoursRequest.current;
    setHours(null);
    setSelectedId(id);
    setSaved(false);
    setError("");
    try {
      const latest = await call(branchHoursBodySchema, `/api/business/branches/${id}/hours`);
      if (request === hoursRequest.current) setHours(latest);
    } catch (cause) {
      if (request === hoursRequest.current) setError(errorMessage(cause));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">İşletmenin noktaları</span>
          <h1>Şubeler</h1>
          <p className="muted">Adreslerini ve çalışma saatlerini güncel tut.</p>
        </div>
        {canWrite && (
          <button
            className="primary"
            onClick={() => {
              hoursRequest.current++;
              setSelectedId(null);
              setHours(null);
              setSaved(false);
            }}
          >
            Yeni şube
          </button>
        )}
      </div>
      {error !== "" && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="success">
          Şube bilgilerin kaydedildi.
        </p>
      )}
      {canWrite && <BusinessRegionsView branches={branches} canEdit={canDelegate} />}
      <div className="editor-layout">
        <section className="panel">
          <div className="section-heading">
            <h2>Şubelerin</h2>
            <span className="muted small">{branches.length} şube</span>
          </div>
          {branches.map((b) => (
            <div className="item-row" key={b.id}>
              <div>
                <strong>{b.name}</strong>
                <span className="small muted">{b.address || "Adres eklenmemiş"}</span>
                <span className="badge">{b.active ? "Etkin" : "Kapalı"}</span>
              </div>
              <button className="secondary" onClick={() => open(b.id)}>
                {canWrite ? "Düzenle" : "Görüntüle"}
              </button>
            </div>
          ))}
          {branches.length === 0 && (
            <div className="empty">
              <h2>İlk şubeni ekle.</h2>
              <p>Her şubenin adresini ve çalışma saatlerini ayrı yönetebilirsin.</p>
            </div>
          )}
        </section>
        <section className="panel">
          <fieldset className="editor-fieldset" disabled={!canWrite || busy}>
            <div className="section-heading">
              <h2>{branch === undefined ? "Yeni şube" : branch.name}</h2>
            </div>
            <form
              key={branch?.id ?? "new"}
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void mutate(async () => {
                  const body = branchBodySchema.parse({
                    name: formText(data, "name"),
                    address: formText(data, "address"),
                    timezone: formText(data, "timezone"),
                    active: data.has("active"),
                    provinceId: formText(data, "provinceId") || null,
                    districtId: formText(data, "districtId") || null,
                  });
                  const result = await call(
                    branchSchema,
                    branch === undefined
                      ? "/api/business/branches"
                      : `/api/business/branches/${branch.id}`,
                    branch === undefined ? "POST" : "PUT",
                    body,
                  );
                  await open(result.id);
                });
              }}
            >
              <label>
                Şube adı
                <input name="name" maxLength={80} required defaultValue={branch?.name} />
              </label>
              <label>
                Adres
                <textarea name="address" maxLength={500} defaultValue={branch?.address} />
              </label>
              <BranchLocationFields provinceId={branch?.provinceId ?? null} districtId={branch?.districtId ?? null} />
              <label>
                Saat dilimi
                <input
                  name="timezone"
                  required
                  defaultValue={branch?.timezone ?? "Europe/Istanbul"}
                />
              </label>
              <label className="check-label">
                <input type="checkbox" name="active" defaultChecked={branch?.active ?? true} />
                Şube etkin
              </label>
              <button className="primary">Şubeyi kaydet</button>
            </form>
            {branch !== undefined && hours !== null && (
              <HoursForm
                key={`${branch.id}:${JSON.stringify(hours)}`}
                hours={hours}
                mutate={mutate}
                onSave={async (body) => {
                  await call(z.null(), `/api/business/branches/${branch.id}/hours`, "PUT", body);
                  setHours(body);
                }}
              />
            )}
          </fieldset>
          {branch && (
            <BranchOrderingView key={branch.id} branchId={branch.id} canWrite={canWrite} />
          )}
          {branch && canDelegate && <BranchAvailabilityGrants key={branch.id} branchId={branch.id} />}
          {branch && canDelegate && <OrderAccessGrants kind="branch" targetId={branch.id} />}
        </section>
      </div>
    </>
  );
}
function HoursForm({
  hours,
  mutate,
  onSave,
}: {
  hours: Hours;
  mutate: Mutation;
  onSave: (body: Hours) => Promise<void>;
}) {
  const [rows, setRows] = useState(hours.hours.map((h, i) => ({ ...h, key: `initial-${i}` })));
  return (
    <div className="subpanel">
      <h3>Çalışma saatleri</h3>
      <p className="small muted">
        Kapanış açılıştan önceyse ertesi gün sayılır. Bir güne birden fazla aralık ekleyebilirsin.
      </p>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void mutate(async () => {
            const body = branchHoursBodySchema.parse({
              hours: rows.map((row, i) => {
                const opensAt = minutesFromTime(formText(data, `open-${i}`));
                const closing = minutesFromTime(formText(data, `close-${i}`));
                return {
                  weekday: Number(formText(data, `day-${i}`)),
                  opensAt,
                  closesAt: closing <= opensAt ? closing + 1440 : closing,
                };
              }),
            });
            await onSave(body);
          });
        }}
      >
        <div>
          {rows.map((row, i) => (
            <div className="hour-row" key={row.key}>
              <label>
                Gün
                <select name={`day-${i}`} defaultValue={row.weekday}>
                  {weekdays.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Açılış
                <input
                  type="time"
                  name={`open-${i}`}
                  defaultValue={timeFromMinutes(row.opensAt)}
                  required
                />
              </label>
              <label>
                Kapanış
                <input
                  type="time"
                  name={`close-${i}`}
                  defaultValue={timeFromMinutes(row.closesAt)}
                  required
                />
              </label>
              <button
                type="button"
                className="secondary danger"
                aria-label="Saat aralığını kaldır"
                onClick={() => {
                  setRows(rows.filter((r) => r.key !== row.key));
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          className="secondary"
          type="button"
          disabled={rows.length >= 35}
          onClick={() => {
            setRows([
              ...rows,
              { weekday: 1, opensAt: 540, closesAt: 1020, key: crypto.randomUUID() },
            ]);
          }}
        >
          Saat aralığı ekle
        </button>
        <button className="primary">Saatleri kaydet</button>
      </form>
    </div>
  );
}
