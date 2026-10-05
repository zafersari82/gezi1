import { ADMIN_ROLE_LABELS, adminSessionSchema, listOf } from "@vado/contracts";
import type { Metadata } from "next";

import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { PasswordForm } from "@/components/password-form";
import { RecoveryCodesForm } from "@/components/recovery-codes-form";
import { revokeSession } from "@/lib/actions";
import { adminGet, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Hesabım" };

export default async function AccountPage() {
  const me = await getMe();
  const { items: sessions } = await adminGet(listOf(adminSessionSchema), "/v1/admin/me/sessions");
  const { account } = me;

  return (
    <>
      <PageHeader
        title="Hesabım"
        lead={`${account.displayName} (${account.username}) · ${ADMIN_ROLE_LABELS[account.role]}`}
      />

      {account.mustChangePassword && (
        <p className="notice">
          Parolanı bir yönetici belirledi. Panelin geri kalanını kullanmadan önce kendi parolanı
          seç.
        </p>
      )}

      <section>
        <h2>Parola</h2>
        <PasswordForm />
      </section>

      <section>
        <h2>Açık oturumlar</h2>
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Tarayıcı</th>
                <th scope="col">IP adresi</th>
                <th scope="col">Açıldı</th>
                <th scope="col">Son kullanım</th>
                <th scope="col">
                  <span className="visually-hidden">İşlem</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>
                    <span className="cell-title">
                      {session.current ? "Bu tarayıcı" : "Başka bir tarayıcı"}
                    </span>
                    <span className="cell-sub">{session.userAgent ?? "Bilinmiyor"}</span>
                  </td>
                  <td className="mono">{session.ip ?? ""}</td>
                  <td>{formatDateTime(session.createdAt)}</td>
                  <td>{formatDateTime(session.lastSeenAt)}</td>
                  <td className="actions">
                    {!session.current && (
                      <ActionForm
                        action={revokeSession.bind(null, session.id)}
                        label="Oturumu kapat"
                        variant="danger"
                        saved="Kapatıldı."
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted section-note">
          Oturum 30 dakika kullanılmazsa ya da 12 saat dolunca kendiliğinden kapanır.
        </p>
      </section>

      <section>
        <h2>Kurtarma kodları</h2>
        <RecoveryCodesForm />
      </section>
    </>
  );
}
