"use client";

import {
  type AccessGrant,
  type Branch,
  type BusinessPermission,
  type BusinessRegion,
  type MemberAccess,
  memberAccessListSchema,
  memberAccessSchema,
  type StaffInvitation,
  staffInvitationCreatedSchema,
  staffInvitationsSchema,
} from "@vado/contracts";
import { useState } from "react";
import { z } from "zod";

import { grantSummary, plainGrants } from "../lib/access";
import { call, errorMessage } from "../lib/client";
import { AccessGrantEditor } from "./access-grant-editor";

const roleLabels = {
  owner: "İşletme sahibi",
  manager: "Yönetici (bütün şubeler)",
  staff: "Personel",
  courier: "Kurye",
};
const statusLabels = {
  pending: "Bekliyor",
  expired: "Süresi doldu",
  accepted: "Kabul edildi",
  revoked: "İptal edildi",
};

/**
 * Ekip: üyeler, personel izinleri ve telefonla davet. İzinleri ve davetleri yalnız işletme
 * sahibi değiştirir; yönetici yalnız görür.
 */
export function TeamView({
  isOwner,
  permissions,
  branches,
  regions,
  initialMembers,
  initialInvitations,
}: {
  isOwner: boolean;
  permissions: readonly BusinessPermission[];
  branches: readonly Branch[];
  regions: readonly BusinessRegion[];
  initialMembers: MemberAccess[];
  initialInvitations: StaffInvitation[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [editing, setEditing] = useState<{ member: MemberAccess; grants: AccessGrant[] } | null>(
    null,
  );
  const [phone, setPhone] = useState("");
  const [inviteGrants, setInviteGrants] = useState<AccessGrant[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    setMembers((await call(memberAccessListSchema, "/api/business/access/members")).items);
    if (isOwner)
      setInvitations((await call(staffInvitationsSchema, "/api/business/invitations")).items);
  }
  async function run(operation: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await operation());
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Ekibim</h1>
          <p className="muted">
            Çalışanlarını telefonla davet et; her birine yalnız gereken izni, gereken şubede ver.
          </p>
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

      {editing !== null && (
        <section className="panel" aria-label="İzinleri düzenle">
          <h2>{editing.member.displayName} · izinler</h2>
          <AccessGrantEditor
            permissions={permissions}
            branches={branches}
            regions={regions}
            value={editing.grants}
            disabled={busy}
            onChange={(grants) => {
              setEditing({ ...editing, grants });
            }}
          />
          <div className="row-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setEditing(null);
              }}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await call(
                    memberAccessSchema,
                    `/api/business/access/members/${editing.member.memberId}`,
                    "PUT",
                    { grants: editing.grants, expectedVersion: editing.member.version },
                  );
                  setEditing(null);
                  return "İzinler kaydedildi.";
                })
              }
            >
              İzinleri kaydet
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Üyeler</h2>
        {members.map((member) => {
          const lines = member.role === "staff" ? grantSummary(member.grants) : [];
          return (
            <div className="item-row" key={member.memberId}>
              <div>
                <strong>{member.displayName}</strong>
                <span className="small muted">
                  {roleLabels[member.role]} · {member.active ? "Etkin" : "Erişimi kapalı"}
                </span>
                {member.role === "staff" && member.active && (
                  <ul className="grant-summary small">
                    {lines.length === 0 ? <li>Henüz izin verilmedi.</li> : null}
                    {lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
              {isOwner && (member.role === "staff" || member.role === "manager") && (
                <span className="row-actions">
                  {member.role === "staff" && member.active && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditing({ member, grants: plainGrants(member.grants) });
                      }}
                    >
                      İzinleri düzenle
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          member.active
                            ? `${member.displayName} için işletme erişimi kapatılsın mı? Bütün izinleri silinir.`
                            : `${member.displayName} için işletme erişimi açılsın mı? İzinleri yeniden vermen gerekir.`,
                        )
                      )
                        return;
                      void run(async () => {
                        await call(z.null(), "/api/business/members", "PUT", {
                          userId: member.userId,
                          role: member.role,
                          active: !member.active,
                        });
                        return member.active ? "Erişim kapatıldı." : "Erişim açıldı.";
                      });
                    }}
                  >
                    {member.active ? "Erişimi kapat" : "Erişimi aç"}
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </section>

      {isOwner && (
        <section className="panel">
          <h2>Yeni çalışan davet et</h2>
          <p className="small muted">
            Davet, yazdığın telefon numarasıyla giriş yapılmış VADO hesabında açılır; 72 saat
            geçerlidir ve bir kez kullanılır. SMS gönderilmez: bağlantıyı çalışanına kendin ilet.
          </p>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const result = await call(
                  staffInvitationCreatedSchema,
                  "/api/business/invitations",
                  "POST",
                  { phone, grants: inviteGrants },
                );
                setLink(`${window.location.origin}/join#${result.token}`);
                setPhone("");
                setInviteGrants([]);
                return "Davet hazır. Bağlantıyı yalnız davet ettiğin kişiye gönder.";
              });
            }}
          >
            <label>
              Çalışanın telefon numarası
              <input
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="05xx xxx xx xx"
                value={phone}
                maxLength={32}
                required
                onChange={(event) => {
                  setPhone(event.target.value);
                }}
              />
            </label>
            <AccessGrantEditor
              permissions={permissions}
              branches={branches}
              regions={regions}
              value={inviteGrants}
              disabled={busy}
              onChange={setInviteGrants}
            />
            <button className="primary" disabled={busy || inviteGrants.length === 0}>
              Davet bağlantısı oluştur
            </button>
          </form>
          {link !== "" && (
            <div className="subpanel">
              <p className="small">Bu bağlantı yalnız şimdi gösterilir; sonra görüntülenemez.</p>
              <input
                aria-label="Davet bağlantısı"
                readOnly
                value={link}
                onFocus={(event) => {
                  event.currentTarget.select();
                }}
              />
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(link)
                    .then(() => {
                      setNotice("Bağlantı kopyalandı.");
                    })
                    .catch(() => {
                      setError("Bağlantıyı alandan seçip kopyalayabilirsin.");
                    })
                }
              >
                Bağlantıyı kopyala
              </button>
            </div>
          )}
        </section>
      )}

      {isOwner && (
        <section className="panel">
          <h2>Davetler</h2>
          {invitations.length === 0 && <p className="muted">Henüz davet yok.</p>}
          {invitations.map((invitation) => (
            <div className="item-row" key={invitation.id}>
              <div>
                <strong>{invitation.phone}</strong>
                <span className="small muted">{statusLabels[invitation.status]}</span>
                <ul className="grant-summary small">
                  {grantSummary(invitation.grants).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              {invitation.status === "pending" && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("Bu davet iptal edilsin mi?")) return;
                    void run(async () => {
                      await call(
                        z.null(),
                        `/api/business/invitations/${invitation.id}/revoke`,
                        "POST",
                        {},
                      );
                      return "Davet iptal edildi.";
                    });
                  }}
                >
                  İptal et
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
