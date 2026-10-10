"use client";
import { branchAvailabilityGrantSchema, branchAvailabilityGrantsSchema } from "@vado/contracts";
import { useEffect, useState } from "react";

import { call, errorMessage } from "../lib/client";

/** Owners delegate one operational action without giving full branch-management rights. */
export function BranchAvailabilityGrants({ branchId }: { branchId: string }) {
  const [members, setMembers] = useState<
    { userId: string; displayName: string; allowed: boolean }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    void call(
      branchAvailabilityGrantsSchema,
      `/api/business/branches/${branchId}/availability-grants`,
    )
      .then((value) => {
        if (alive) setMembers(value.items);
      })
      .catch((reason: unknown) => {
        if (alive) setError(errorMessage(reason));
      });
    return () => {
      alive = false;
    };
  }, [branchId]);
  async function toggle(userId: string, allowed: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await call(
        branchAvailabilityGrantSchema.pick({ userId: true, allowed: true }),
        `/api/business/branches/${branchId}/availability-grants`,
        "PUT",
        { userId, allowed },
      );
      setMembers((current) =>
        current.map((member) => (member.userId === userId ? { ...member, allowed } : member)),
      );
      setNotice("Personelin şube yetkisi güncellendi.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Şube ürün durumunu yönetebilen çalışanlar">
      <div className="section-heading">
        <h3>Şube personel yetkisi</h3>
        <p className="muted small">
          Seçtiğin çalışan yalnız bu şubenin ürünlerini satışa açabilir veya tükendi
          işaretleyebilir. Fiyat, şube bilgisi ve personel yetkisi kazanmaz.
        </p>
      </div>
      {members.length === 0 && (
        <p className="muted small">Yetkilendirmek için önce işletmene personel ekle.</p>
      )}
      {members.map((member) => (
        <label key={member.userId} className="check-label">
          <input
            type="checkbox"
            checked={member.allowed}
            disabled={busy}
            onChange={(event) => {
              void toggle(member.userId, event.target.checked);
            }}
          />
          {member.displayName}
        </label>
      ))}
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
    </section>
  );
}
