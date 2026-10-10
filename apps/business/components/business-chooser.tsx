"use client";

import type { BusinessMembership } from "@vado/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";

const roles = { owner: "İşletme sahibi", manager: "Yönetici", staff: "Personel", courier: "Kurye" };
export function BusinessChooser({ memberships }: { memberships: BusinessMembership[] }) {
  const managementMemberships = memberships.filter((membership) => membership.role !== "courier");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function choose(businessId: string) {
    setBusy(true);
    setError("");
    try {
      await call(z.object({ ok: z.boolean() }), "/api/selection", "POST", { businessId });
      router.push("/orders");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }
  return (
    <>
      <div className="business-grid">
        {managementMemberships.map((m) => (
          <button
            disabled={busy}
            className="business-card"
            key={m.id}
            onClick={() => choose(m.businessId)}
          >
            <span className="business-monogram">{m.businessName.slice(0, 1)}</span>
            <strong>{m.businessName}</strong>
            <span className="muted">{roles[m.role]}</span>
            <span className="card-arrow">Devam et →</span>
          </button>
        ))}
      </div>
      {managementMemberships.length === 0 && (
        <section className="empty">
          <h2>Henüz bir işletmeye bağlı değilsin.</h2>
          <p>İşletme sahibi seni VADO hesabınla üye olarak eklediğinde burada görünecek.</p>
        </section>
      )}
      {error !== "" && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        className="text-button"
        onClick={async () => {
          await call(z.object({ ok: z.boolean() }), "/api/auth/logout", "POST");
          window.location.assign("/login");
        }}
      >
        Çıkış yap
      </button>
    </>
  );
}
