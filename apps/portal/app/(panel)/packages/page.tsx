import { adminPackageSchema, listOf } from "@vado/contracts";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import { adminGet } from "@/lib/api";
import { formatDate, formatNumber, packageStatus } from "@/lib/format";

export const metadata: Metadata = { title: "Paketler" };

export default async function PackagesPage() {
  const { items: packages } = await adminGet(listOf(adminPackageSchema), "/v1/admin/packages");

  return (
    <>
      <PageHeader
        title="Paketler"
        lead="Paket, incelenmiş mini uygulama kodudur. Yüklenen her sürüm değişmez; onaylanan sürüm, ayrı ayrı kod incelemesi gerekmeden istenen sayıda işletmenin uygulama kaydında yayınlanır."
      >
        <Link href="/packages/new" className="button button-primary">
          Yeni paket
        </Link>
      </PageHeader>

      <div className="panel table-scroll">
        {packages.length === 0 ? (
          <p className="empty">
            Henüz paket yok. Önce paketin kimlik kaydını oluştur, sonra sürümünü yükle.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Paket</th>
                <th scope="col">Geliştirici</th>
                <th scope="col">Son sürüm</th>
                <th scope="col">İnceleme bekleyen</th>
                <th scope="col">Yayınlayan kayıt</th>
                <th scope="col">Oluşturma</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((item) => {
                const [latest] = item.versions;
                const waiting = item.versions.filter((version) => version.status === "in_review");
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/packages/${item.id}`} className="cell-title">
                        {item.name}
                      </Link>
                      <span className="cell-sub mono">{item.id}</span>
                    </td>
                    <td>{item.developerName}</td>
                    <td>
                      {latest === undefined ? (
                        <span className="muted">Sürüm yüklenmedi</span>
                      ) : (
                        <>
                          <span className="mono">{latest.version}</span>{" "}
                          <Tag {...packageStatus(latest.status)} />
                        </>
                      )}
                    </td>
                    <td>
                      {waiting.length === 0 ? (
                        <span className="muted">Yok</span>
                      ) : (
                        <Tag label={`${waiting.length} sürüm`} tone="warning" />
                      )}
                    </td>
                    <td>{formatNumber(item.appCount)}</td>
                    <td>{formatDate(item.createdAt)}</td>
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
