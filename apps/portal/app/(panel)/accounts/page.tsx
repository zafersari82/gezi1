import { ADMIN_ROLE_LABELS, adminAccountSchema, listOf } from "@vado/contracts";
import type { Metadata } from "next";

import { AccountForm } from "@/components/account-form";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { RoleForm } from "@/components/role-form";
import { Tag } from "@/components/tag";
import { resetAccountTotp, updateAccount } from "@/lib/actions";
import { adminGet, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Panel hesapları" };

export default async function AccountsPage() {
  const [me, { items: accounts }] = await Promise.all([
    getMe(),
    adminGet(listOf(adminAccountSchema), "/v1/admin/accounts"),
  ]);

  return (
    <>
      <PageHeader
        title="Panel hesapları"
        lead="Her yönetici kendi hesabıyla ve iki adımlı doğrulamayla girer. Rol, parola ya da ikinci adım değişince hesabın açık oturumları kapanır."
      />

      <section>
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Hesap</th>
                <th scope="col">Rol</th>
                <th scope="col">Durum</th>
                <th scope="col">Son giriş</th>
                <th scope="col">
                  <span className="visually-hidden">İşlem</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <span className="cell-title">
                      {account.displayName}
                      {account.id === me.account.id && " (sen)"}
                    </span>
                    <span className="cell-sub mono">{account.username}</span>
                  </td>
                  <td>
                    {account.status === "active" ? (
                      <RoleForm accountId={account.id} role={account.role} />
                    ) : (
                      ADMIN_ROLE_LABELS[account.role]
                    )}
                  </td>
                  <td>
                    <>
                      {account.status === "disabled" ? (
                        <Tag label="Kapalı" tone="neutral" />
                      ) : (
                        <Tag label="Etkin" tone="positive" />
                      )}
                      {!account.totpEnabled && <Tag label="İkinci adım kurulmadı" tone="warning" />}
                      {account.lockedUntil !== null && <Tag label="Kilitli" tone="danger" />}
                      {account.mustChangePassword && (
                        <Tag label="Parolasını değiştirecek" tone="neutral" />
                      )}
                    </>
                  </td>
                  <td>
                    {account.lastLoginAt === null ? "Hiç" : formatDateTime(account.lastLoginAt)}
                  </td>
                  <td className="actions actions-stack">
                    <ResetPasswordForm accountId={account.id} name={account.displayName} />
                    {account.totpEnabled && (
                      <ActionForm
                        action={resetAccountTotp.bind(null, account.id)}
                        label="İkinci adımı sıfırla"
                        confirm={`${account.displayName} için iki adımlı doğrulama sıfırlansın mı? Bir sonraki girişte yeniden kurar.`}
                        saved="Sıfırlandı."
                      />
                    )}
                    {account.status === "active" ? (
                      <ActionForm
                        action={updateAccount.bind(null, account.id, { status: "disabled" })}
                        label="Hesabı kapat"
                        variant="danger"
                        confirm={`${account.displayName} hesabı kapatılsın mı? Açık oturumları kapanır.`}
                        saved="Kapatıldı."
                      />
                    ) : (
                      <ActionForm
                        action={updateAccount.bind(null, account.id, { status: "active" })}
                        label="Yeniden aç"
                        saved="Açıldı."
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Yeni hesap</h2>
        <AccountForm />
      </section>
    </>
  );
}
