"use client";

import {
  businessRegionAssignmentSchema,
  businessRegionBodySchema,
  businessRegionBranchSchema,
  businessRegionBranchesSchema,
  businessRegionOperatorSchema,
  businessRegionOperatorsSchema,
  businessRegionSchema,
  businessRegionsSchema,
  businessRegionUpdateSchema,
  type Branch,
  type BusinessRegion,
} from "@vado/contracts";
import { useEffect, useState } from "react";

import { call, errorMessage } from "../lib/client";
import { OrderAccessGrants } from "./order-access-grants";

/** Phone-first organisation management, without a second permission implementation. */
export function BusinessRegionsView({ branches, canEdit }: { branches: Branch[]; canEdit: boolean }) {
  const [regions, setRegions] = useState<BusinessRegion[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [selectedId, setSelectedId] = useState("");
  const [members, setMembers] = useState<Array<{ userId: string; displayName: string; allowed: boolean }>>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    const [loadedRegions, loadedAssignments] = await Promise.all([
      call(businessRegionsSchema, "/api/business/regions"),
      call(businessRegionBranchesSchema, "/api/business/regions/branches"),
    ]);
    setRegions(loadedRegions.items);
    setAssignments(Object.fromEntries(loadedAssignments.items.map((entry) =>
      [entry.branchId, entry.regionId])));
    setSelectedId((old) => loadedRegions.items.some((r) => r.id === old)
      ? old : (loadedRegions.items[0]?.id ?? ""));
  }
  useEffect(() => {
    void load().catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);
  useEffect(() => {
    if (!canEdit || selectedId === "") return;
    let active = true;
    void call(businessRegionOperatorsSchema, `/api/business/regions/${selectedId}/operators`)
      .then((value) => { if (active) setMembers(value.items); })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; };
  }, [selectedId, canEdit]);
  async function mutate(operation: () => Promise<void>, label: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      await load();
      setNotice(label);
    } catch (reason) {
      setError(errorMessage(reason));
      await load().catch(() => undefined);
    } finally { setBusy(false); }
  }
  const selected = regions.find((region) => region.id === selectedId);
  return <section className="panel" aria-label="Bölge ve şube organizasyonu">
    <div className="section-heading">
      <h2>Bölge yönetimi</h2>
      <p className="muted small">Şubelerini bölgelere ayır. Bölgeye atanan personel yalnız
        o bölgedeki ürünlerin satış durumunu yönetebilir; fiyat veya personel yetkisi kazanmaz.</p>
    </div>
    {canEdit && <form className="form-stack" onSubmit={(event) => {
      event.preventDefault();
      const body = businessRegionBodySchema.parse({ name });
      void mutate(async () => {
        await call(businessRegionSchema, "/api/business/regions", "POST", body);
        setName("");
      }, "Bölge oluşturuldu.");
    }}>
      <label>Yeni bölgenin adı
        <input value={name} maxLength={80} required disabled={busy}
          placeholder="Örneğin Marmara" onChange={(event) => setName(event.target.value)} />
      </label>
      <button className="secondary" disabled={busy}>Bölge ekle</button>
    </form>}
    {regions.length === 0 ? <p className="muted small">Henüz bölge yok. Tek şubeli işletmelerin
      bölge oluşturması gerekmez.</p> : <>
      <label>Bölge seç
        <select value={selectedId} disabled={busy} onChange={(event) => setSelectedId(event.target.value)}>
          {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
        </select>
      </label>
      {selected && canEdit && <form className="form-stack" key={selected.id}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const update = businessRegionUpdateSchema.parse({
            name: data.get("regionName"), expectedVersion: selected.version,
          });
          void mutate(async () => {
            await call(businessRegionSchema, `/api/business/regions/${selected.id}`, "PUT", update);
          }, "Bölge adı güncellendi.");
        }}>
        <label>Bölgeyi yeniden adlandır
          <input name="regionName" required maxLength={80} defaultValue={selected.name} disabled={busy} />
        </label>
        <button className="secondary" disabled={busy}>Adı kaydet</button>
      </form>}
    </>}
    {branches.length > 0 && <div className="form-stack">
      <h3>Şubelerin bölgeleri</h3>
      {branches.map((branch) => <label key={branch.id}>{branch.name}
        <select value={assignments[branch.id] ?? ""} disabled={!canEdit || busy}
          onChange={(event) => {
            const regionId = event.target.value === "" ? null : event.target.value;
            const expectedRegionId = assignments[branch.id] ?? null;
            const body = businessRegionAssignmentSchema.parse({ regionId, expectedRegionId });
            void mutate(async () => {
              await call(businessRegionBranchSchema, `/api/business/regions/branches/${branch.id}`, "PUT", body);
            }, "Şubenin bölgesi değiştirildi.");
          }}>
          <option value="">Bölge atanmamış</option>
          {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
        </select>
      </label>)}
    </div>}
    {canEdit && selected && <div className="form-stack">
      <h3>{selected.name} — ürün sorumluları</h3>
      <p className="small muted">Personel buradaki tüm şubelerde ürünleri satışa açıp kapatabilir.
        Şubenin bölgesi değişirse yetkisi de anında değişir.</p>
      {members.length === 0 && <p className="muted small">Önce işletmene personel ekle.</p>}
      {members.map((member) => <label className="check-label" key={member.userId}>
        <input type="checkbox" disabled={busy} checked={member.allowed}
          onChange={(event) => {
            const allowed = event.target.checked;
            void mutate(async () => {
              await call(businessRegionOperatorSchema.pick({ userId: true, allowed: true }),
                `/api/business/regions/${selected.id}/operators`, "PUT", { userId: member.userId, allowed });
              setMembers((previous) => previous.map((candidate) => candidate.userId === member.userId
                ? { ...candidate, allowed } : candidate));
            }, "Bölge personel yetkisi güncellendi.");
          }}/>{member.displayName}
      </label>)}
    </div>}
    {canEdit && selected && <OrderAccessGrants key={selected.id} kind="region" targetId={selected.id} />}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="success" role="status">{notice}</p>}
  </section>;
}
