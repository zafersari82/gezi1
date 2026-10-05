import { adminSearchQuerySchema, adminUserSchema, formatPhone, listOf } from "@vado/contracts";
import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { SearchForm } from "@/components/search-form";
import { SubmitButton } from "@/components/submit-button";
import { Tag } from "@/components/tag";
import { setUserStatus } from "@/lib/actions";
import { adminGet } from "@/lib/api";
import { formatDate, USER_STATUS } from "@/lib/format";

export const metadata: Metadata = { title: "Kullanıcılar" };

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const { q = "" } = adminSearchQuerySchema.parse(await searchParams);
  const { items: users } = await adminGet(
    listOf(adminUserSchema),
    `/v1/admin/users?q=${encodeURIComponent(q)}`,
  );

  return (
    <>
      <PageHeader
        title="Kullanıcılar"
        lead="Askıya alınan hesabın tüm oturumları kapanır ve hesap yeniden açılana kadar giriş yapamaz."
      >
        <SearchForm label="Ad, VADO kimliği veya telefon" query={q} />
      </PageHeader>

      <div className="panel table-scroll">
        {users.length === 0 ? (
          <p className="empty">
            {q === "" ? "Henüz kayıtlı kullanıcı yok." : `“${q}” ile eşleşen kullanıcı yok.`}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Kullanıcı</th>
                <th scope="col">Telefon</th>
                <th scope="col">Durum</th>
                <th scope="col">Kayıt</th>
                <th scope="col">
                  <span className="visually-hidden">İşlem</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span className="cell-title">{user.displayName ?? "Ad girilmemiş"}</span>
                    {user.username !== null && <span className="cell-sub">@{user.username}</span>}
                  </td>
                  <td>{user.phone === null ? "" : formatPhone(user.phone)}</td>
                  <td>
                    <Tag {...USER_STATUS[user.status]} />
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td className="actions">
                    {user.status === "active" && (
                      <form action={setUserStatus.bind(null, user.id, "suspended")}>
                        <SubmitButton
                          variant="danger"
                          confirm={`${user.displayName ?? "Bu hesap"} askıya alınsın mı? Açık oturumları kapanır.`}
                        >
                          Askıya al
                        </SubmitButton>
                      </form>
                    )}
                    {user.status === "suspended" && (
                      <form action={setUserStatus.bind(null, user.id, "active")}>
                        <SubmitButton>Yeniden aç</SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
