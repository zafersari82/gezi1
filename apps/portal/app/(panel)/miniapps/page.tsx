import {
  adminMiniAppSummarySchema,
  adminSearchQuerySchema,
  CATEGORY_LABELS,
  listOf,
} from "@vado/contracts";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { SearchForm } from "@/components/search-form";
import { Tag } from "@/components/tag";
import { adminGet, getMe } from "@/lib/api";
import { formatDate, miniAppStatus } from "@/lib/format";

export const metadata: Metadata = { title: "Mini uygulamalar" };

export default async function MiniAppsPage({ searchParams }: PageProps<"/miniapps">) {
  const { q = "" } = adminSearchQuerySchema.parse(await searchParams);
  const me = await getMe();
  const { items: miniApps } = await adminGet(
    listOf(adminMiniAppSummarySchema),
    `/v1/admin/miniapps?q=${encodeURIComponent(q)}`,
  );

  return (
    <>
      <PageHeader
        title="Mini uygulamalar"
        lead="Her kayıt bir işletmenin vitrinidir: adı, simgesi, ayarları ve yayınladığı paket sürümü. Kayıt, doğrulanıp onaylı bir sürüm yayınlanana kadar kullanıcılara görünmez."
      >
        <div className="header-actions">
          <SearchForm label="Ad ya da kimlik" query={q} />
          {me.permissions.includes("miniapps.manage") && (
            <Link href="/miniapps/new" className="button button-primary">
              Yeni kayıt
            </Link>
          )}
        </div>
      </PageHeader>

      <div className="panel table-scroll">
        {miniApps.length === 0 ? (
          <p className="empty">
            {q === "" ? "Henüz uygulama kaydı yok." : `“${q}” ile eşleşen kayıt yok.`}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Kayıt</th>
                <th scope="col">Paket ve sürüm</th>
                <th scope="col">Durum</th>
                <th scope="col">Güncelleme</th>
              </tr>
            </thead>
            <tbody>
              {miniApps.map((miniApp) => (
                <tr key={miniApp.id}>
                  <td>
                    <Link href={`/miniapps/${miniApp.id}`} className="cell-title">
                      {miniApp.name}
                    </Link>
                    <span className="cell-sub">{CATEGORY_LABELS[miniApp.category]}</span>
                    <span className="cell-sub mono">{miniApp.id}</span>
                  </td>
                  <td>
                    {miniApp.release !== null ? (
                      <>
                        {miniApp.release.packageName}
                        <span className="cell-sub mono">
                          {miniApp.release.packageId} {miniApp.release.version}
                        </span>
                      </>
                    ) : miniApp.source === "url" ? (
                      <>
                        Geliştirme sunucusu
                        <span className="cell-sub mono">{miniApp.development?.entryUrl}</span>
                      </>
                    ) : (
                      <span className="muted">Sürüm yayınlanmadı</span>
                    )}
                  </td>
                  <td>
                    <Tag {...miniAppStatus(miniApp.offlineReason)} />
                  </td>
                  <td>{formatDate(miniApp.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
