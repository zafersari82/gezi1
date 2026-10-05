import "./globals.css";

import type { AdminOverview } from "@vado/contracts";
import type { Metadata } from "next";
import Link from "next/link";

import { Lattice } from "@/components/lattice";
import { Nav, type NavItem } from "@/components/nav";
import { getOverview } from "@/lib/api";

export const metadata: Metadata = {
  title: { default: "VADO Control", template: "%s | VADO Control" },
  description: "VADO yönetim paneli",
  robots: { index: false, follow: false },
};

function navItems(overview: AdminOverview | null): NavItem[] {
  return [
    { href: "/", label: "Genel bakış" },
    { href: "/users", label: "Kullanıcılar" },
    { href: "/businesses", label: "İşletmeler", count: overview?.pendingBusinesses },
    { href: "/miniapps", label: "Mini uygulamalar", count: overview?.unverifiedMiniApps },
    { href: "/packages", label: "Paketler", count: overview?.packagesInReview },
    { href: "/reports", label: "Şikayetler", count: overview?.openReports },
    { href: "/audit", label: "Denetim kaydı" },
  ];
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // API'ye ulaşılamasa da kenar çubuğu çizilir; hata, sayfanın kendi içeriğinde gösterilir.
  const overview = await getOverview().catch(() => null);

  return (
    <html lang="tr">
      <body>
        <aside className="rail">
          <Link href="/" className="brand">
            <Lattice />
            <span className="brand-name">VADO</span>
            <span className="brand-role">Control</span>
          </Link>
          <Nav items={navItems(overview)} />
          <ul className="rail-notes">
            {overview === null && <li className="alert">API'ye ulaşılamıyor</li>}
            {overview?.config.demoMode === true && (
              <li className="alert">Demo modu açık: SMS gönderilmiyor</li>
            )}
            {overview?.config.paymentMode === "sandbox" && <li>Ödemeler deneme modunda</li>}
          </ul>
        </aside>
        <main>{children}</main>
      </body>
    </html>
  );
}
