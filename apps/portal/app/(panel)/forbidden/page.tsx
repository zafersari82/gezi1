import { ADMIN_ROLE_LABELS } from "@vado/contracts";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { getMe } from "@/lib/api";

export const metadata: Metadata = { title: "Yetki yok" };

export default async function ForbiddenPage() {
  const me = await getMe();
  return (
    <>
      <PageHeader
        title="Bu bölüm için yetkin yok"
        lead={`Rolün (${ADMIN_ROLE_LABELS[me.account.role]}) bu bölümü görmeye izin vermiyor. Erişim gerekiyorsa panelin sahibinden rolünü değiştirmesini iste.`}
      />
      <Link href="/" className="button">
        Genel bakışa dön
      </Link>
    </>
  );
}
