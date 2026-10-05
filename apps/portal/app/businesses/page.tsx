import {
  adminBusinessSchema,
  adminSearchQuerySchema,
  CATEGORY_LABELS,
  listOf,
} from "@vado/contracts";
import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { SearchForm } from "@/components/search-form";
import { SubmitButton } from "@/components/submit-button";
import { Tag } from "@/components/tag";
import { updateBusiness } from "@/lib/actions";
import { adminGet } from "@/lib/api";
import { BUSINESS_STATUS, formatDate, USER_STATUS } from "@/lib/format";

export const metadata: Metadata = { title: "İşletmeler" };

export default async function BusinessesPage({ searchParams }: PageProps<"/businesses">) {
  const { q = "" } = adminSearchQuerySchema.parse(await searchParams);
  const { items: businesses } = await adminGet(
    listOf(adminBusinessSchema),
    `/v1/admin/businesses?q=${encodeURIComponent(q)}`,
  );

  return (
    <>
      <PageHeader
        title="İşletmeler"
        lead="Onaylanan işletme Keşfet bölümünde listelenir ve mini uygulamalar üzerinden ödeme alabilir. Vergi numarasını onaydan önce doğrula."
      >
        <SearchForm label="İşletme adı, adres veya şehir" query={q} />
      </PageHeader>

      <div className="panel table-scroll">
        {businesses.length === 0 ? (
          <p className="empty">
            {q === "" ? "Henüz işletme başvurusu yok." : `“${q}” ile eşleşen işletme yok.`}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">İşletme</th>
                <th scope="col">Sahibi</th>
                <th scope="col">Vergi numarası</th>
                <th scope="col">Durum</th>
                <th scope="col">Başvuru</th>
                <th scope="col">
                  <span className="visually-hidden">İşlem</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => {
                // Sahibinin hesabı silinmiş veya askıdaysa işletme yayınlanamaz.
                const ownerActive = business.ownerStatus === "active";
                return (
                  <tr key={business.id}>
                    <td>
                      <span className="cell-title">{business.name}</span>
                      <span className="cell-sub">
                        {CATEGORY_LABELS[business.category]}, {business.city}
                      </span>
                      <span className="cell-sub mono">{business.slug}</span>
                    </td>
                    <td>
                      {business.owner.displayName}
                      {!ownerActive && (
                        <span className="cell-sub">
                          Hesap {USER_STATUS[business.ownerStatus].label.toLocaleLowerCase("tr")}
                        </span>
                      )}
                    </td>
                    <td>
                      {business.taxNumber === null ? (
                        <span className="muted">Girilmemiş</span>
                      ) : (
                        <span className="mono">{business.taxNumber}</span>
                      )}
                    </td>
                    <td>
                      <Tag {...BUSINESS_STATUS[business.status]} />
                      {business.verified && <Tag label="Doğrulanmış" tone="positive" />}
                    </td>
                    <td>{formatDate(business.createdAt)}</td>
                    <td className="actions">
                      {business.status === "pending" && (
                        <>
                          {ownerActive && (
                            <form
                              action={updateBusiness.bind(null, business.id, {
                                verified: true,
                                status: "active",
                              })}
                            >
                              <SubmitButton variant="primary">Onayla ve yayınla</SubmitButton>
                            </form>
                          )}
                          <form
                            action={updateBusiness.bind(null, business.id, { status: "suspended" })}
                          >
                            <SubmitButton variant="danger">Reddet</SubmitButton>
                          </form>
                        </>
                      )}
                      {business.status === "active" && (
                        <form
                          action={updateBusiness.bind(null, business.id, { status: "suspended" })}
                        >
                          <SubmitButton
                            variant="danger"
                            confirm={`${business.name} askıya alınsın mı? Listeden kalkar ve ödeme alamaz.`}
                          >
                            Askıya al
                          </SubmitButton>
                        </form>
                      )}
                      {business.status === "suspended" && ownerActive && (
                        <form
                          action={updateBusiness.bind(null, business.id, {
                            verified: true,
                            status: "active",
                          })}
                        >
                          <SubmitButton>Yeniden yayınla</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
