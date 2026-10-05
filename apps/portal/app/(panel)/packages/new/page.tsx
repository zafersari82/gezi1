import type { Metadata } from "next";
import Link from "next/link";

import { PackageForm } from "@/components/package-form";
import { PageHeader } from "@/components/page-header";
import { EMPTY_PACKAGE } from "@/lib/form-state";

export const metadata: Metadata = { title: "Yeni paket" };

export default function NewPackagePage() {
  return (
    <>
      <Link href="/packages" className="back-link">
        Paketler
      </Link>
      <PageHeader
        title="Yeni paket"
        lead="Önce paketin kimlik kaydı oluşturulur; sürümler, paketin sayfasından zip dosyası olarak yüklenir."
      />
      <PackageForm mode="create" initial={EMPTY_PACKAGE} />
    </>
  );
}
