import { type AdminPackage, adminPackageSchema, packageIdSchema } from "@vado/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PackageForm } from "@/components/package-form";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import { UploadForm } from "@/components/upload-form";
import { AdminApiError, adminGet, getOverview } from "@/lib/api";
import {
  formatBytes,
  formatDateTime,
  formatNumber,
  packageStatus,
  shortDigest,
} from "@/lib/format";

export const metadata: Metadata = { title: "Paket" };

async function loadPackage(id: string): Promise<AdminPackage> {
  if (!packageIdSchema.safeParse(id).success) notFound();
  try {
    return await adminGet(adminPackageSchema, `/v1/admin/packages/${id}`);
  } catch (error) {
    if (error instanceof AdminApiError && error.code === "package_not_found") notFound();
    throw error;
  }
}

export default async function PackagePage({ params }: PageProps<"/packages/[id]">) {
  const { id } = await params;
  const [item, overview] = await Promise.all([loadPackage(id), getOverview()]);

  return (
    <>
      <Link href="/packages" className="back-link">
        Paketler
      </Link>
      <PageHeader
        title={item.name}
        lead={`${formatNumber(item.appCount)} uygulama kaydı bu paketin bir sürümünü yayınlıyor.`}
      />

      <section aria-labelledby="versions-title">
        <h2 id="versions-title">Sürümler</h2>
        <div className="panel">
          {item.versions.length === 0 ? (
            <p className="empty">Henüz sürüm yüklenmedi.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Sürüm</th>
                    <th scope="col">Durum</th>
                    <th scope="col">Boyut</th>
                    <th scope="col">Bulgular</th>
                    <th scope="col">İçerik özeti</th>
                    <th scope="col">Yükleme</th>
                  </tr>
                </thead>
                <tbody>
                  {item.versions.map((version) => (
                    <tr key={version.version}>
                      <td>
                        <Link
                          href={`/packages/${item.id}/${version.version}`}
                          className="cell-title mono"
                        >
                          {version.version}
                        </Link>
                      </td>
                      <td>
                        <Tag {...packageStatus(version.status)} />
                      </td>
                      <td>
                        {formatBytes(version.sizeBytes)}
                        <span className="cell-sub">{version.fileCount} dosya</span>
                      </td>
                      <td>
                        {version.findingCounts.blocked > 0 && (
                          <Tag
                            label={`${version.findingCounts.blocked} engellenir`}
                            tone="danger"
                          />
                        )}
                        {version.findingCounts.review > 0 && (
                          <Tag label={`${version.findingCounts.review} incele`} tone="warning" />
                        )}
                        {version.findingCounts.blocked + version.findingCounts.review === 0 && (
                          <span className="muted">Yok</span>
                        )}
                      </td>
                      <td className="mono">{shortDigest(version.digest)}</td>
                      <td>{formatDateTime(version.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="bordered">
            <UploadForm packageId={item.id} maxBytes={overview.config.packageMaxBytes} />
          </div>
        </div>
      </section>

      <section aria-labelledby="record-title">
        <h2 id="record-title">Kayıt</h2>
        <PackageForm
          mode="edit"
          initial={{ id: item.id, name: item.name, developerName: item.developerName }}
        />
      </section>
    </>
  );
}
