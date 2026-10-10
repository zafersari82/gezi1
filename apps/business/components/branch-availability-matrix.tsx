"use client";

import {
  accessibleBranchesSchema,
  branchAvailabilityBatchBodySchema,
  branchAvailabilityBatchResultSchema,
  branchAvailabilityListSchema,
  type Branch,
  type Catalog,
} from "@vado/contracts";
import { useEffect, useState } from "react";

import { call, errorMessage } from "../lib/client";

type Change = { expectedVersion: number; available: boolean };
/** Small-screen, branch-scoped availability management. Never edits company-wide item flags. */
export function BranchAvailabilityMatrix({ catalog, branches }: { catalog: Catalog; branches: Branch[] }) {
  const [allowed, setAllowed] = useState<string[]>([]);
  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<Record<string, { version: number; available: boolean }>>({});
  const [edits, setEdits] = useState<Record<string, Change>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    void call(accessibleBranchesSchema, "/api/business/branches/availability-access/me")
      .then((value) => { if (alive) { setAllowed(value.items); setBranchId(value.items[0] ?? ""); } })
      .catch((reason: unknown) => { if (alive) setError(errorMessage(reason)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!branchId) return;
    let alive = true;
    setLoading(true);
    setRows({});
    setEdits({});
    void call(branchAvailabilityListSchema, `/api/business/branches/${branchId}/availability`)
      .then((value) => {
        if (alive) setRows(Object.fromEntries(value.items.map((item) =>
          [item.itemId, { version: item.version, available: item.available }])));
      })
      .catch((reason: unknown) => { if (alive) setError(errorMessage(reason)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [branchId]);
  const filtered = catalog.items.filter((item) => item.active &&
    item.name.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")));
  const count = Object.keys(edits).length;
  function change(itemId: string, available: boolean) {
    const original = rows[itemId] ?? { version: 0, available: true };
    setEdits((current) => {
      const next = { ...current };
      if (original.available === available) delete next[itemId];
      else next[itemId] = { expectedVersion: original.version, available };
      return next;
    });
    setNotice("");
  }
  async function save() {
    if (!branchId || count === 0 || count > 100 || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await call(branchAvailabilityBatchResultSchema, "/api/business/branches/availability-batch", "PUT",
        branchAvailabilityBatchBodySchema.parse({ branchId, changes: Object.entries(edits).map(
          ([itemId, value]) => ({ itemId, ...value })) }));
      const updated = await call(branchAvailabilityListSchema,
        `/api/business/branches/${branchId}/availability`);
      setRows(Object.fromEntries(updated.items.map((item) =>
        [item.itemId, { version: item.version, available: item.available }])));
      setEdits({});
      setNotice("Şubenin ürün durumları kaydedildi.");
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Şube ürün bulunurluğu">
    <div className="section-heading"><h2>Şubede satış durumu</h2>
      <p className="muted small">Ürün tükendiğinde yalnız seçili şubede satışını durdur.
        Diğer şubeler etkilenmez. Değişiklikler kaydedildiğinde hemen geçerlidir.</p></div>
    <div className="form-grid">
      <label>Şube
        <select value={branchId} disabled={busy || loading} onChange={(event) => {
          if (count > 0 && !window.confirm("Kaydedilmemiş değişiklikler silinsin mi?")) return;
          setError(""); setNotice(""); setBranchId(event.target.value);
        }}>
          {branches.filter((branch) => allowed.includes(branch.id)).map((branch) =>
            <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
      <label>Ürün ara
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="Ürün adı" />
      </label>
    </div>
    {loading && <p role="status">Şube bilgileri yükleniyor…</p>}
    {!loading && allowed.length === 0 && <p className="notice">Bu işlem için yetkili olduğun şube bulunmuyor.</p>}
    {error && <p className="error" role="alert">{error} Güncel bilgileri görmek için şubeyi yeniden seçebilirsin.</p>}
    {notice && <p role="status" className="success">{notice}</p>}
    <p className="muted small">{filtered.length} ürün · {count} bekleyen değişiklik (tek seferde en fazla 100)</p>
    {!!branchId && !loading && filtered.slice(0, 100).map((item) => {
      const current = edits[item.id]?.available ?? rows[item.id]?.available ?? true;
      return <div className="item-row" key={item.id}>
        <strong>{item.name}</strong>
        <label className="check-label"><input type="checkbox" checked={current} disabled={busy}
          onChange={(event) => change(item.id, event.target.checked)} />
          {current ? "Satışta" : "Tükendi"}</label>
      </div>;
    })}
    {filtered.length > 100 && <p className="muted small">İlk 100 ürün gösteriliyor. Arama yaparak diğerlerini bul.</p>}
    {!!branchId && <div className="form-actions">
      <button className="primary" disabled={busy || loading || count === 0 || count > 100}
        type="button" onClick={() => { void save(); }}>
        {busy ? "Kaydediliyor…" : `${count} ürün değişikliğini kaydet`}</button>
      <button type="button" className="secondary" disabled={busy || count === 0}
        onClick={() => setEdits({})}>Vazgeç</button>
    </div>}
  </section>;
}
