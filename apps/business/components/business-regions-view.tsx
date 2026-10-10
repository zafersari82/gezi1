"use client";

import {
  type Branch,
  type BusinessRegion,
  businessRegionBodySchema,
  businessRegionSchema,
  businessRegionsSchema,
  businessRegionUpdateSchema,
} from "@vado/contracts";
import { useEffect, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";

const assignmentSchema = z.object({ branchId: z.string(), regionId: z.string().nullable() });

/**
 * Şubeleri bölgelere ayırır (Marmara, Ege gibi). Bölge tek başına yetki vermez; personele bölge
 * kapsamlı izin Ekibim ekranından verilir. Düzenlemeyi yalnız işletme sahibi yapar.
 */
export function BusinessRegionsView({
  branches,
  canEdit,
}: {
  branches: Branch[];
  canEdit: boolean;
}) {
  const [regions, setRegions] = useState<BusinessRegion[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setRegions((await call(businessRegionsSchema, "/api/business/regions")).items);
  }
  useEffect(() => {
    let active = true;
    call(businessRegionsSchema, "/api/business/regions")
      .then((loaded) => {
        if (active) setRegions(loaded.items);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  async function mutate(operation: () => Promise<void>, done: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      await load();
      setNotice(done);
    } catch (reason) {
      setError(errorMessage(reason));
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const regionOf = (branchId: string) =>
    regions.find((region) => region.branchIds.includes(branchId))?.id ?? null;

  return (
    <section className="panel" aria-label="Bölgeler">
      <div className="section-heading">
        <h2>Bölgeler</h2>
        <p className="muted small">
          Çok şubeli işletmede şubeleri bölgelere ayır. Bölge sorumlusuna izni Ekibim ekranında
          &quot;bölge&quot; kapsamıyla verirsin; şube başka bölgeye taşınınca erişim kendiliğinden
          değişir.
        </p>
      </div>
      {error !== "" && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice !== "" && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {canEdit && (
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const body = businessRegionBodySchema.parse({ name });
            void mutate(async () => {
              await call(businessRegionSchema, "/api/business/regions", "POST", body);
              setName("");
            }, "Bölge eklendi.");
          }}
        >
          <label>
            Yeni bölgenin adı
            <input
              value={name}
              maxLength={80}
              required
              disabled={busy}
              placeholder="Örneğin Marmara"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <button className="secondary" disabled={busy}>
            Bölge ekle
          </button>
        </form>
      )}
      {regions.length === 0 ? (
        <p className="muted">Henüz bölge yok. Tek şubeli işletmede bölgeye gerek yoktur.</p>
      ) : (
        regions.map((region) => (
          <div className="item-row" key={region.id}>
            <div>
              <strong>{region.name}</strong>
              <span className="small muted">{region.branchIds.length} şube</span>
            </div>
            {canEdit && (
              <span className="row-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    const next = window.prompt("Bölgenin yeni adı", region.name)?.trim();
                    if (next === undefined || next === "" || next === region.name) return;
                    const body = businessRegionUpdateSchema.parse({
                      name: next,
                      expectedVersion: region.version,
                    });
                    void mutate(async () => {
                      await call(
                        businessRegionSchema,
                        `/api/business/regions/${region.id}`,
                        "PUT",
                        body,
                      );
                    }, "Bölgenin adı değişti.");
                  }}
                >
                  Adını değiştir
                </button>
                <button
                  type="button"
                  className="secondary danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `${region.name} bölgesi silinsin mi? Şubeleri bölgesiz kalır; bu bölgeye verilmiş personel izinleri kalkar.`,
                      )
                    )
                      return;
                    void mutate(async () => {
                      await call(z.null(), `/api/business/regions/${region.id}/delete`, "POST", {
                        expectedVersion: region.version,
                      });
                    }, "Bölge silindi.");
                  }}
                >
                  Sil
                </button>
              </span>
            )}
          </div>
        ))
      )}
      {regions.length > 0 && (
        <div className="subpanel">
          <h3>Şubelerin bölgeleri</h3>
          {branches.map((branch) => {
            const current = regionOf(branch.id);
            return (
              <label className="item-row" key={branch.id}>
                <span>{branch.name}</span>
                <select
                  value={current ?? ""}
                  disabled={!canEdit || busy}
                  onChange={(event) => {
                    const regionId = event.target.value === "" ? null : event.target.value;
                    void mutate(async () => {
                      await call(
                        assignmentSchema,
                        `/api/business/branches/${branch.id}/region`,
                        "PUT",
                        { regionId, expectedRegionId: current },
                      );
                    }, "Şubenin bölgesi değişti.");
                  }}
                >
                  <option value="">Bölgesiz</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
