import {
  packageFileContentSchema,
  packageIdSchema,
  packagePathSchema,
  versionSchema,
} from "@vado/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { AdminApiError, adminGet } from "@/lib/api";
import { formatBytes } from "@/lib/format";

export const metadata: Metadata = { title: "Paket dosyası" };

export default async function PackageFilePage({
  params,
}: PageProps<"/packages/[id]/[version]/files/[...path]">) {
  const { id, version, path: segments } = await params;
  const path = segments.map(decodeURIComponent).join("/");
  const valid =
    packageIdSchema.safeParse(id).success &&
    versionSchema.safeParse(version).success &&
    packagePathSchema.safeParse(path).success;
  if (!valid) notFound();

  const file = await adminGet(
    packageFileContentSchema,
    `/v1/admin/packages/${id}/versions/${version}/files/${path}`,
  ).catch((error: unknown) => {
    if (error instanceof AdminApiError && error.code === "package_version_not_found") notFound();
    throw error;
  });

  return (
    <>
      <Link href={`/packages/${id}/${version}`} className="back-link">
        {id} {version}
      </Link>
      <PageHeader
        title={file.path}
        lead={`${file.contentType.split(";")[0] ?? ""}, ${formatBytes(file.size)}`}
      />
      <dl className="panel facts digest">
        <div>
          <dt>Dosya özeti (SHA-256)</dt>
          <dd className="mono wrap">{file.sha256}</dd>
        </div>
      </dl>
      <section aria-labelledby="content-title">
        <h2 id="content-title">İçerik</h2>
        {file.text === null ? (
          <p className="panel empty">
            Bu dosya metin değil ya da burada gösterilemeyecek kadar büyük. Özeti, yüklenen
            paketteki dosyayla karşılaştırılabilir.
          </p>
        ) : (
          <pre className="panel code">{file.text}</pre>
        )}
      </section>
    </>
  );
}
