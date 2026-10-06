import {
  ADMIN_ROLE_LABELS,
  type AdminMe,
  type AdminOverview,
  type AdminPermission,
} from "@vado/contracts";
import Link from "next/link";

import { Lattice } from "@/components/lattice";
import { Nav, type NavItem } from "@/components/nav";
import { SubmitButton } from "@/components/submit-button";
import { logout } from "@/lib/actions";
import { AdminApiError, getMe, getOverview } from "@/lib/api";

interface NavEntry extends NavItem {
  /** Bölümü görmek için gereken izin; hesabın izni yoksa bölüm menüde gösterilmez. */
  permission: AdminPermission;
}

function navItems(me: AdminMe, overview: AdminOverview | null): NavItem[] {
  const entries: NavEntry[] = [
    { href: "/", label: "Genel bakış", permission: "overview.read" },
    { href: "/users", label: "Kullanıcılar", permission: "users.read" },
    {
      href: "/businesses",
      label: "İşletmeler",
      count: overview?.pendingBusinesses,
      permission: "businesses.read",
    },
    {
      href: "/miniapps",
      label: "Mini uygulamalar",
      count: overview?.unverifiedMiniApps,
      permission: "miniapps.read",
    },
    {
      href: "/packages",
      label: "Paketler",
      count: overview?.packagesInReview,
      permission: "packages.read",
    },
    {
      href: "/reports",
      label: "Şikayetler",
      count: overview?.openReports,
      permission: "reports.read",
    },
    { href: "/events", label: "Olay teslimleri", permission: "events.read" },
    { href: "/audit", label: "Denetim kaydı", permission: "audit.read" },
    { href: "/accounts", label: "Panel hesapları", permission: "accounts.manage" },
  ];
  // Menüyü gizlemek yetki değildir: her sayfanın verisini API, hesabın iznine bakarak verir.
  return entries
    .filter((entry) => me.permissions.includes(entry.permission))
    .map(({ permission: _permission, ...item }) => item);
}

/** API'ye ulaşılamıyorsa `null`; oturum geçersizse giriş sayfasına yönlendirme sürer. */
async function unlessUnreachable<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AdminApiError && error.code === "unreachable") return null;
    throw error;
  }
}

export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const me = await unlessUnreachable(getMe);
  // Parolasını değiştirmesi gereken hesap sayıları göremez; yalnızca hesap sayfası açılır.
  const canSeeCounts =
    me !== null && !me.account.mustChangePassword && me.permissions.includes("overview.read");
  const overview = canSeeCounts ? await unlessUnreachable(getOverview) : null;

  return (
    <>
      <aside className="rail">
        <Link href="/" className="brand">
          <Lattice />
          <span className="brand-name">VADO</span>
          <span className="brand-role">Control</span>
        </Link>
        {me !== null && <Nav items={navItems(me, overview)} />}
        <ul className="rail-notes">
          {me === null && <li className="alert">API'ye ulaşılamıyor</li>}
          {overview?.config.demoMode === true && (
            <li className="alert">Demo modu açık: SMS gönderilmiyor</li>
          )}
          {overview?.config.paymentMode === "sandbox" && <li>Ödemeler deneme modunda</li>}
        </ul>
        {me !== null && (
          <div className="rail-account">
            <Link href="/account">
              <span className="rail-account-name">{me.account.displayName}</span>
              <span className="rail-account-role">{ADMIN_ROLE_LABELS[me.account.role]}</span>
            </Link>
            <form action={logout}>
              <SubmitButton>Çıkış yap</SubmitButton>
            </form>
          </div>
        )}
      </aside>
      <main>{children}</main>
    </>
  );
}
