"use client";
import type { appInstanceSchema } from "@vado/contracts";
import {
  type CapabilitySetting,
  type EngineCapabilityManifest,
  type InstanceCapabilities,
  instanceCapabilitiesSchema,
  type StudioConfiguration,
  studioTemplateById,
} from "@vado/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { formText } from "../lib/values";
const fieldSchema = z
  .object({
    type: z.string().optional(),
    title: z.string().optional(),
    enum: z.array(z.string()).optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
  })
  .loose();
const configShape = z.object({ properties: z.record(z.string(), fieldSchema).default({}) });
export function SettingsView({
  businessId,
  instances,
  selectedId,
  packages,
  resolved,
  canWrite,
  studio,
}: {
  businessId: string;
  instances: z.infer<typeof appInstanceSchema>[];
  selectedId: string | null;
  packages: EngineCapabilityManifest[];
  resolved: InstanceCapabilities | null;
  canWrite: boolean;
  studio: StudioConfiguration | null;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Sana uygun çalışma biçimi</span>
          <h1>Ayarlar</h1>
          <p className="muted">Kurulu uygulamanın yeteneklerini ve ayarlarını yönet.</p>
        </div>
      </div>
      <section className="panel settings-picker">
        <h2>Mağaza taslağın</h2>
        {studio === null ? (
          <p className="muted">
            Bu işletme için henüz bir şablon seçilmemiş. İlk mağaza oluşturucu açıldığında şablonunu
            buradan yöneteceksin.
          </p>
        ) : (
          <p>
            <strong>{studioTemplateById(studio.templateId).name}</strong> ·{" "}
            {studio.status === "draft" ? "Taslak" : "Hazır"}
          </p>
        )}
        <p className="small muted">
          Mağaza görünümünü telefonundan düzenleyebilirsin. Taslağı kaydetmek yayınlamak değildir.
        </p>
        <Link className="secondary" href="/studio">
          Mağazamı tasarla
        </Link>
      </section>
      <section className="panel settings-picker">
        <label>
          İşletme uygulaman
          <select
            value={selectedId ?? ""}
            disabled={busy || instances.length === 0}
            onChange={async (event) => {
              const instanceId = event.target.value;
              setBusy(true);
              setError("");
              try {
                await call(z.object({ ok: z.boolean() }), "/api/selection", "POST", {
                  businessId,
                  instanceId,
                });
                router.refresh();
              } catch (cause) {
                setError(errorMessage(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            {instances
              .filter((i) => i.active)
              .map((i, index) => (
                <option value={i.id} key={i.id}>
                  Uygulama {index + 1}
                </option>
              ))}
          </select>
        </label>
        <p className="small muted">
          Ayarların yeni siparişlere uygulanır. Başlamış siparişlerin akışı korunur.
        </p>
      </section>
      {error !== "" && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {selectedId === null || resolved === null ? (
        <section className="empty">
          <h2>Henüz kurulu uygulaman yok.</h2>
          <p>İşletmene uygulama bağlandığında yetenekleri burada yöneteceksin.</p>
        </section>
      ) : (
        <div className="settings-list">
          {packages.map((manifest) => (
            <PackageForm
              key={`${selectedId}:${manifest.id}`}
              instanceId={selectedId}
              manifest={manifest}
              setting={resolved.settings.find((s) => s.capabilityId === manifest.id)}
              canWrite={canWrite}
              onSaved={() => {
                router.refresh();
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
function PackageForm({
  instanceId,
  manifest,
  setting,
  canWrite,
  onSaved,
}: {
  instanceId: string;
  manifest: EngineCapabilityManifest;
  setting?: CapabilitySetting;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const fields = configShape.parse(manifest.configSchema).properties;
  const values = setting?.config ?? manifest.defaults;
  return (
    <section className="package-card">
      <div className="package-title">
        <div>
          <h2>{manifest.businessBlocks[0]?.title ?? "Ek yetenek"}</h2>
          <span className="small muted">Sürüm {manifest.version}</span>
        </div>
        <span className="badge">{setting?.enabled ? "Açık" : "Kapalı"}</span>
      </div>
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          setSaved(false);
          try {
            const config = Object.fromEntries(
              Object.entries(fields).map(([key, field]) => [
                key,
                field.type === "boolean"
                  ? data.has(key)
                  : field.type === "integer" || field.type === "number"
                    ? Number(formText(data, key))
                    : formText(data, key),
              ]),
            );
            await call(
              instanceCapabilitiesSchema,
              `/api/business/app-instances/${instanceId}/capabilities/${manifest.id}`,
              "PUT",
              { version: manifest.version, enabled: data.has("enabled"), config },
            );
            setSaved(true);
            onSaved();
          } catch (cause) {
            setError(errorMessage(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="editor-fieldset form-stack" disabled={!canWrite || busy}>
          <label className="check-label">
            <input type="checkbox" name="enabled" defaultChecked={setting?.enabled ?? false} />
            Bu yeteneği aç
          </label>
          {Object.entries(fields).map(([key, field]) =>
            field.type === "boolean" ? (
              <label className="check-label" key={key}>
                <input type="checkbox" name={key} defaultChecked={values[key] === true} />
                {field.title ?? "Ek ayar"}
              </label>
            ) : (
              <label key={key}>
                {field.title ?? "Ek ayar"}
                {field.enum === undefined ? (
                  <input
                    name={key}
                    type={field.type === "integer" || field.type === "number" ? "number" : "text"}
                    minLength={field.minLength}
                    maxLength={field.maxLength}
                    min={field.minimum}
                    max={field.maximum}
                    step={field.type === "integer" ? 1 : undefined}
                    defaultValue={
                      typeof values[key] === "string" || typeof values[key] === "number"
                        ? String(values[key])
                        : ""
                    }
                    required
                  />
                ) : (
                  <select
                    name={key}
                    defaultValue={typeof values[key] === "string" ? values[key] : ""}
                  >
                    {field.enum.map((choice) => (
                      <option value={choice} key={choice}>
                        {choice}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            ),
          )}
          <button className="primary">Ayarları kaydet</button>
        </fieldset>
        {!canWrite && (
          <p className="muted small">
            Paket ayarlarını işletme sahibi veya yönetici değiştirebilir.
          </p>
        )}
        {error !== "" && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="success" role="status">
            Ayarların kaydedildi.
          </p>
        )}
      </form>
    </section>
  );
}
