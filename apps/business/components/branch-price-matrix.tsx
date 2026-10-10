"use client";

import {
  type Branch,
  branchPriceBatchBodySchema,
  branchPriceBatchResultSchema,
  type Catalog,
  catalogSchema,
} from "@vado/contracts";
import { useState } from "react";

import { call, errorMessage } from "../lib/client";
import { decimalToMinor, money } from "../lib/values";

interface Edit { enabled: boolean; price: string; vat: string }

/** Şube fiyatları yalnız seçilen işletmenin mevcut kataloğundan hazırlanır. */
export function BranchPriceMatrix({
  initial,
  branches,
  canWrite,
}: {
  initial: Catalog;
  branches: Branch[];
  canWrite: boolean;
}) {
  const [catalog, setCatalog] = useState(initial);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const branch = branches.find((item) => item.id === branchId);
  const filtered = catalog.items.filter((item) =>
    item.name.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")),
  );
  const changes = Object.keys(edits).length;

  function existing(itemId: string) {
    return catalog.prices.find((price) => price.itemId === itemId && price.branchId === branchId);
  }
  function base(itemId: string) {
    return catalog.prices.find((price) => price.itemId === itemId && price.branchId === null);
  }
  function edit(itemId: string, value: Edit) {
    setEdits((current) => ({ ...current, [itemId]: value }));
    setNotice("");
  }
  async function refresh() {
    const current = await call(catalogSchema, "/api/business/catalog");
    setCatalog(current);
    setEdits({});
  }
  async function save() {
    if (!branchId || !canWrite || changes === 0 || changes > 100 || busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const body = branchPriceBatchBodySchema.parse({
        branchId,
        changes: Object.entries(edits).map(([itemId, value]) => {
          const previous = existing(itemId);
          return {
            itemId,
            expected:
              previous === undefined
                ? null
                : {
                    amountMinor: previous.amountMinor,
                    vatBasisPoints: previous.vatBasisPoints,
                  },
            next: value.enabled
              ? {
                  amountMinor: decimalToMinor(value.price),
                  vatBasisPoints: decimalToMinor(value.vat),
                }
              : null,
          };
        }),
      });
      await call(branchPriceBatchResultSchema, "/api/business/catalog/branch-prices", "PUT", body);
      await refresh();
      setNotice("Şube fiyatları birlikte kaydedildi.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Şubeye özel fiyatlar">
      <div className="section-heading">
        <h2>Şube fiyatları</h2>
        <p className="muted small">
          Merkez fiyatını değiştirmeden şubeye özel fiyat tanımla. İşaretini kaldırdığın ürün genel
          fiyata döner. Değişiklikler tek işlemde kaydedilir ve siparişlerde hemen geçerli olur.
        </p>
      </div>
      <div className="form-grid">
        <label>
          Yönetilecek şube
          <select
            value={branchId}
            disabled={busy}
            onChange={(event) => {
              if (changes > 0 && !window.confirm("Kaydedilmemiş değişiklikler silinsin mi?"))
                return;
              setBranchId(event.target.value);
              setEdits({});
              setError("");
              setNotice("");
            }}
          >
            {branches.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ürün ara
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
            placeholder="Ürün adı"
          />
        </label>
      </div>
      {!branch && <p className="notice">Önce Şubeler bölümünden bir şube ekleyin.</p>}
      {!canWrite && (
        <p className="notice">
          Fiyatları görüntüleyebilirsin. Güncellemek için yönetici yetkisi gerekir.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error} Güncel durumu kontrol etmek için "Yenile" seçeneğini kullan.
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <div className="toolbar">
        <span className="muted small">
          {filtered.length} ürün · {changes} bekleyen değişiklik (en fazla 100)
        </span>
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() => {
            if (changes > 0 && !window.confirm("Kaydedilmemiş değişiklikler silinsin mi?")) return;
            void refresh().catch((cause: unknown) => { setError(errorMessage(cause)); });
          }}
        >
          Yenile
        </button>
      </div>
      {branch &&
        filtered.slice(0, 100).map((item) => {
          const override = existing(item.id);
          const general = base(item.id);
          const value = edits[item.id] ?? {
            enabled: override !== undefined,
            price: ((override ?? general)?.amountMinor ?? 0) / 100 + "",
            vat: ((override ?? general)?.vatBasisPoints ?? 0) / 100 + "",
          };
          return (
            <div className="subpanel" key={item.id}>
              <div className="section-heading">
                <strong>{item.name}</strong>
                <span className="muted small">
                  Genel fiyat: {general ? money(general.amountMinor) : "Belirlenmemiş"}
                </span>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={value.enabled}
                  disabled={!canWrite || busy}
                  onChange={(e) => { edit(item.id, { ...value, enabled: e.target.checked }); }}
                />
                Bu şubeye özel fiyat
              </label>
              <div className="form-grid">
                <label>
                  Şube fiyatı (TL)
                  <input
                    inputMode="decimal"
                    value={value.price}
                    disabled={!canWrite || busy || !value.enabled}
                    onChange={(e) => { edit(item.id, { ...value, price: e.target.value }); }}
                  />
                </label>
                <label>
                  KDV (%)
                  <input
                    inputMode="decimal"
                    value={value.vat}
                    disabled={!canWrite || busy || !value.enabled}
                    onChange={(e) => { edit(item.id, { ...value, vat: e.target.value }); }}
                  />
                </label>
              </div>
            </div>
          );
        })}
      {filtered.length > 100 && (
        <p className="muted small">İlk 100 sonuç gösteriliyor. Diğer ürünler için arama yapın.</p>
      )}
      {branch && canWrite && (
        <div className="form-actions">
          <button
            className="primary"
            type="button"
            disabled={busy || changes === 0 || changes > 100}
            onClick={() => {
              void save();
            }}
          >
            {busy ? "Kaydediliyor…" : `${changes} değişikliği kaydet`}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || changes === 0}
            onClick={() => { setEdits({}); }}
          >
            Vazgeç
          </button>
        </div>
      )}
    </section>
  );
}
