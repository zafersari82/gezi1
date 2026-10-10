"use client";

import { type BranchPerformance, branchPerformanceSchema } from "@vado/contracts";
import { useState } from "react";

import { call, errorMessage } from "../lib/client";

function money(minor: bigint): string {
  return `${(minor / 100n).toLocaleString("tr-TR")},${(minor % 100n).toString().padStart(2, "0")} ₺`;
}

export function PerformanceView({ initial }: { initial: BranchPerformance }) {
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const totalOrders = report.items.reduce((sum, row) => sum + row.orderCount, 0);
  const completedOrders = report.items.reduce((sum, row) => sum + row.completedCount, 0);
  const completedMinor = report.items.reduce(
    (sum, row) => sum + BigInt(row.completedAmountMinor),
    0n,
  );
  async function changeDays(value: "7" | "30") {
    setBusy(true);
    setError("");
    try {
      const latest = await call(
        branchPerformanceSchema,
        `/api/business/orders/performance?days=${value}`,
      );
      setReport(latest);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Şube performansı</h1>
          <p className="muted">Yalnızca yetkili olduğun şubelerin siparişleri gösterilir.</p>
        </div>
      </div>
      <section className="panel form-stack">
        <label>
          Dönem
          <select
            value={String(report.days)}
            disabled={busy}
            onChange={(event) => void changeDays(event.target.value as "7" | "30")}
          >
            <option value="7">Son 7 gün</option>
            <option value="30">Son 30 gün</option>
          </select>
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {busy && <p role="status">Rapor güncelleniyor…</p>}
        <div className="item-row">
          <span>Toplam sipariş</span>
          <strong>{totalOrders.toLocaleString("tr-TR")}</strong>
        </div>
        <div className="item-row">
          <span>Tamamlanan sipariş</span>
          <strong>{completedOrders.toLocaleString("tr-TR")}</strong>
        </div>
        <div className="item-row">
          <span>Tamamlanan siparişlerin tutarı</span>
          <strong>{money(completedMinor)}</strong>
        </div>
        <p className="small muted">
          Tutar, tamamlanan siparişlerin kayıtlı toplamıdır; tahsil edilmiş ödeme, net ciro veya kâr
          değildir. İadeler ve muhasebe mahsupları burada hesaplanmaz.
        </p>
      </section>
      <section className="panel">
        <h2>Şube karşılaştırması</h2>
        {report.items.length === 0 && (
          <p className="muted">Bu dönemde görüntüleyebileceğin sipariş bulunmuyor.</p>
        )}
        {report.items.map((row) => (
          <div className="item-row" key={row.branchId}>
            <div>
              <strong>{row.branchName}</strong>
              <span className="muted small">
                {row.orderCount} sipariş · {row.completedCount} tamamlandı · {row.cancelledCount}{" "}
                iptal/ret · {row.openCount} diğer
              </span>
            </div>
            <strong>{money(BigInt(row.completedAmountMinor))}</strong>
          </div>
        ))}
      </section>
    </>
  );
}
