"use client";

import {
  type Branch,
  type BusinessMembership,
  businessMembershipSchema,
  type StaffInvitation,
  staffInvitationCreatedSchema,
  staffInvitationsSchema,
} from "@vado/contracts";
import { type FormEvent,useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";

const rosterSchema = z.object({ items: z.array(businessMembershipSchema) });
const roleLabels = {
  owner: "İşletme sahibi",
  manager: "Tam yetkili yönetici",
  staff: "Personel",
  courier: "Kurye",
};
const statusLabels = {
  pending: "Bekliyor",
  expired: "Süresi doldu",
  accepted: "Kabul edildi",
  revoked: "İptal edildi",
};

export function TeamView({
  initial,
  branches,
  initialInvitations,
}: {
  initial: BusinessMembership[];
  branches: Branch[];
  initialInvitations: StaffInvitation[];
}) {
  const [members, setMembers] = useState(initial);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [phone, setPhone] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [orderAccess, setOrderAccess] = useState<"none" | "view" | "manage">("view");
  const [availability, setAvailability] = useState(false);
  const [link, setLink] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const [updated, pending] = await Promise.all([
      call(rosterSchema, "/api/business/members"),
      call(staffInvitationsSchema, "/api/business/invitations"),
    ]);
    setMembers(updated.items);
    setInvitations(pending.items);
  }
  async function toggle(member: BusinessMembership) {
    if (
      !window.confirm(
        `${member.displayName ?? "Personel"} için ${member.active ? "erişimi kapatmak" : "erişimi açmak"} istiyor musun?`,
      )
    )
      return;
    setError("");
    setNotice("");
    setBusyId(member.userId);
    try {
      await call(z.null(), "/api/business/members", "PUT", {
        userId: member.userId,
        role: member.role,
        active: !member.active,
      });
      await refresh();
      setNotice("Üyelik güncellendi. Kapatılan kişinin eski şube ve bölge izinleri kaldırılır.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLink("");
    setBusyId("invite");
    try {
      const result = await call(staffInvitationCreatedSchema, "/api/business/invitations", "POST", {
        phone,
        branchIds,
        orderAccess,
        canManageAvailability: availability,
      });
      const url = `${window.location.origin}/join#${result.token}`;
      setLink(url);
      setPhone("");
      setNotice("Davet hazır. Bağlantıyı yalnızca davet ettiğin kişiye gönder.");
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }
  async function revoke(invitation: StaffInvitation) {
    if (!window.confirm("Bu daveti iptal etmek istiyor musun?")) return;
    setError("");
    setNotice("");
    setLink("");
    setBusyId(invitation.id);
    try {
      await call(z.null(), `/api/business/invitations/${invitation.id}/revoke`, "POST", {});
      await refresh();
      setNotice("Davet iptal edildi.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }
  function selectBranch(id: string, selected: boolean) {
    setBranchIds((old) => (selected ? [...old, id] : old.filter((item) => item !== id)));
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Ekibim</h1>
          <p className="muted">Çalışanlarını telefonundan davet et ve şube izinlerini yönet.</p>
        </div>
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
      <section className="panel">
        <h2>Yeni çalışan davet et</h2>
        <p className="small muted">
          Davet yalnızca yazdığın telefon numarasıyla doğrulanmış VADO hesabında açılır. 72 saat
          geçerlidir ve bir kez kullanılabilir. Davet, tam yetkili yönetici rolü vermez.
        </p>
        {branches.length === 0 ? (
          <p>Önce Şubeler ekranından en az bir şube oluştur.</p>
        ) : (
          <form className="form-stack" onSubmit={(event) => void invite(event)}>
            <label>
              Çalışanın telefon numarası
              <input
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="05xx xxx xx xx"
                value={phone}
                onChange={(event) => { setPhone(event.target.value); }}
                required
                maxLength={32}
              />
            </label>
            <fieldset className="editor-fieldset">
              <legend>Erişebileceği şubeler</legend>
              {branches
                .filter((branch) => branch.active)
                .map((branch) => (
                  <label key={branch.id} className="item-row">
                    <span>{branch.name}</span>
                    <input
                      type="checkbox"
                      checked={branchIds.includes(branch.id)}
                      onChange={(event) => { selectBranch(branch.id, event.target.checked); }}
                    />
                  </label>
                ))}
            </fieldset>
            <label>
              Sipariş izni
              <select
                value={orderAccess}
                onChange={(event) => { setOrderAccess(event.target.value as typeof orderAccess); }}
              >
                <option value="none">Sipariş erişimi yok</option>
                <option value="view">Yalnız görüntüle</option>
                <option value="manage">Siparişleri yönet</option>
              </select>
            </label>
            <label className="item-row">
              <span>Bu şubelerde ürünlerin satışta/tükendi durumunu değiştirebilsin</span>
              <input
                type="checkbox"
                checked={availability}
                onChange={(event) => { setAvailability(event.target.checked); }}
              />
            </label>
            <button
              className="primary"
              type="submit"
              disabled={
                busyId !== null ||
                branchIds.length === 0 ||
                (orderAccess === "none" && !availability)
              }
            >
              {busyId === "invite" ? "Hazırlanıyor…" : "Davet bağlantısı oluştur"}
            </button>
          </form>
        )}
        {link !== "" && (
          <div className="panel">
            <p className="small">Bu bağlantı yalnızca şimdi gösterilir; tekrar görüntülenemez.</p>
            <input
              aria-label="Davet bağlantısı"
              readOnly
              value={link}
              onFocus={(event) => { event.currentTarget.select(); }}
            />
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(link)
                  .then(() => { setNotice("Bağlantı kopyalandı."); })
                  .catch(() => { setError("Bağlantıyı alandan seçip kopyalayabilirsin."); })
              }
            >
              Bağlantıyı kopyala
            </button>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Bekleyen ve geçmiş davetler</h2>
        {invitations.length === 0 && <p className="muted">Henüz davet bulunmuyor.</p>}
        {invitations.map((invite) => (
          <div className="item-row" key={invite.id}>
            <div>
              <strong>{invite.phone}</strong>
              <span className="small muted">
                {invite.branches.map((branch) => branch.name).join(", ")} ·{" "}
                {statusLabels[invite.status]}
              </span>
            </div>
            {invite.status === "pending" && (
              <button
                type="button"
                className="secondary"
                disabled={busyId !== null}
                onClick={() => void revoke(invite)}
              >
                İptal et
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>İşletme üyeleri</h2>
        <p className="small muted">Şube izinlerini Şubeler menüsünden ayrıca değiştirebilirsin.</p>
        {members.map((member) => (
          <div className="item-row" key={member.userId}>
            <div>
              <strong>{member.displayName ?? "İşletme üyesi"}</strong>
              <span className="small muted">
                {roleLabels[member.role]} · {member.active ? "Aktif" : "Kapalı"}
              </span>
            </div>
            {member.role !== "owner" && member.role !== "courier" && (
              <button
                type="button"
                className="secondary"
                disabled={busyId !== null}
                onClick={() => void toggle(member)}
              >
                {member.active ? "Erişimi kapat" : "Erişimi aç"}
              </button>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
