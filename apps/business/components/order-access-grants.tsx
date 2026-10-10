"use client";

import { orderGrantSchema, orderGrantsSchema, type OrderGrantBody } from "@vado/contracts";
import { useEffect, useState } from "react";

import { call, errorMessage } from "../lib/client";

/** Owner-only, phone-first order delegation. No global manager role is assigned. */
export function OrderAccessGrants({ kind, targetId }: {
  kind: "region" | "branch";
  targetId: string;
}) {
  const [items, setItems] = useState<Array<{ userId: string; displayName: string; access: OrderGrantBody["access"] }>>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const path = kind === "region" ? `/api/business/regions/${targetId}/order-grants`
    : `/api/business/branches/${targetId}/order-grants`;
  useEffect(() => {
    let active = true;
    setItems([]);
    void call(orderGrantsSchema, path).then((response) => {
      if (active) setItems(response.items);
    }).catch((cause: unknown) => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [path]);
  async function save(userId: string, access: OrderGrantBody["access"]) {
    setBusyId(userId);
    setError("");
    setNotice("");
    try {
      await call(orderGrantSchema.pick({ userId: true, access: true }), path, "PUT", { userId, access });
      const updated = await call(orderGrantsSchema, path);
      setItems(updated.items);
      setNotice("Sipariş yetkisi kaydedildi.");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusyId(null); }
  }
  return <section className="subpanel" aria-label="Sipariş erişim yetkileri">
    <h3>Sipariş erişimi</h3>
    <p className="small muted">Personel yalnızca bu {kind === "region" ? "bölgedeki" : "şubedeki"} siparişleri
      görüntüleyebilir. İşlem yetkisi ayrıca verilirse siparişi kabul, reddetme ve ödeme kaydı açılır.
      İade, işletme ayarları ve genel yönetim yetkisi verilmez.</p>
    {items.length === 0 && <p className="small muted">Yetki verilebilecek aktif personel yok.</p>}
    {items.map((item) => <label key={item.userId}>{item.displayName}
      <select value={item.access} disabled={busyId !== null} onChange={(event) => {
        void save(item.userId, event.target.value as OrderGrantBody["access"]);
      }}>
        <option value="none">Erişim yok</option>
        <option value="view">Siparişleri görsün</option>
        <option value="manage">Siparişleri yönetsin</option>
      </select>
    </label>)}
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status" className="success">{notice}</p>}
  </section>;
}
