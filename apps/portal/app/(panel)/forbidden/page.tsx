import { ADMIN_ROLE_LABELS, isScopedRole } from "@vado/contracts";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { getMe } from "@/lib/api";

export const metadata: Metadata = { title: "Yetki yok" };

export default async function ForbiddenPage() {
  const me = await getMe();
  // İşletme hesabının rolü değişmez; bu bölümler VADO ekibine aittir.
  const scoped = isScopedRole(me.account.role);
  return (
    <>
      <PageHeader
        title="Bu bölüm için yetkin yok"
        lead={
          scoped
            ? "İşletme hesabı yalnızca kendi mini uygulamalarını görür; bu bölüm VADO ekibine aittir."
            : `Rolün (${ADMIN_ROLE_LABELS[me.account.role]}) bu bölümü görmeye izin vermiyor. Erişim gerekiyorsa panelin sahibinden rolünü değiştirmesini iste.`
        }
      />
      <Link href={scoped ? "/miniapps" : "/"} className="button">
        {scoped ? "Mini uygulamalarına dön" : "Genel bakışa dön"}
      </Link>
    </>
  );
}
