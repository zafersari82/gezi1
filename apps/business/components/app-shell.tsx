"use client";

import type { BusinessBlock, BusinessMemberRole } from "@vado/contracts";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { call } from "../lib/client";

const paths: Readonly<Record<BusinessBlock["view"], string>> = {
  kitchen: "M4 4h16v16H4z M8 2v8 M12 2v8 M16 2v8 M6 14h12",
  tables: "M3 8h18 M5 8v13 M19 8v13 M6 4h12v4",
  devices: "M5 2h14v20H5z M10 18h4",
  orders: "M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h5",
  returns: "M4 7h16 M4 7l4-4 M4 7l4 4 M7 13h14v8H7z",
  reviews: "M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  catalog: "M3 7l9-4 9 4v11l-9 4-9-4z M3 7l9 4 9-4 M12 11v11",
  branches: "M3 10l2-6h14l2 6 M5 10v10h14V10 M9 20v-6h6v6 M3 10h18",
  settings: "M5 6h14 M5 12h14 M5 18h14 M9 3v6 M15 9v6 M10 15v6",
};
export function AppShell({
  name,
  role,
  blocks,
  children,
}: {
  name: string;
  role: BusinessMemberRole;
  blocks: BusinessBlock[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const nav = (
    <>
      <Link
        href="/studio"
        className={pathname === "/studio" ? "nav-link active" : "nav-link"}
        aria-current={pathname === "/studio" ? "page" : undefined}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          aria-hidden="true"
        >
          <path d="M4 4h16v16H4z M4 11h16 M11 11v9 M8 7h3 M14 7h3" />
        </svg>
        <span>Mağaza tasarımı</span>
      </Link>
      {(role === "owner" || role === "manager") && (
        <Link href="/chats" className={pathname === "/chats" ? "nav-link active" : "nav-link"}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.65"
            aria-hidden="true"
          >
            <path d="M4 4h16v13H8l-4 3z M7 9h10 M7 13h7" />
          </svg>
          <span>Mesajlar</span>
        </Link>
      )}
      {(role === "owner" || role === "manager") && (
        <Link
          href="/bookings"
          className={pathname === "/bookings" ? "nav-link active" : "nav-link"}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.65"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M7 2v6 M17 2v6 M3 11h18 M8 15h3" />
          </svg>
          <span>Randevular</span>
        </Link>
      )}
      {(role === "owner" || role === "manager") && (
        <Link
          href="/channels"
          className={pathname === "/channels" ? "nav-link active" : "nav-link"}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.65"
            aria-hidden="true"
          >
            <path d="M3 11h4l12-7v16l-12-7H3z M7 13v6 M21 10v4" />
          </svg>
          <span>Duyurular</span>
        </Link>
      )}
      <Link
        href="/performance"
        className={pathname === "/performance" ? "nav-link active" : "nav-link"}
        aria-current={pathname === "/performance" ? "page" : undefined}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          aria-hidden="true"
        >
          <path d="M3 20V4 M3 20h18 M7 17v-5h3v5 M12 17V9h3v8 M17 17V5h3v12" />
        </svg>
        <span>Performans</span>
      </Link>
      {(role === "owner" || role === "manager") && (
        <Link
          href="/team"
          className={pathname === "/team" ? "nav-link active" : "nav-link"}
          aria-current={pathname === "/team" ? "page" : undefined}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.65"
            aria-hidden="true"
          >
            <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a7 7 0 0 1 14 0v2 M18 8a3 3 0 0 1 0 6 M19 16a5 5 0 0 1 3 5" />
          </svg>
          <span>Ekibim</span>
        </Link>
      )}
      {blocks.map((block) => {
        const active = block.path === `${pathname}${query === "" ? "" : `?${query}`}`;
        return (
          <Link
            href={{
              pathname: block.path.split("?")[0],
              query: Object.fromEntries(new URLSearchParams(block.path.split("?")[1])),
            }}
            key={block.id}
            className={active ? "nav-link active" : "nav-link"}
            aria-current={active ? "page" : undefined}
            title={block.title}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              aria-hidden="true"
            >
              <path d={paths[block.view]} />
            </svg>
            <span>{block.title}</span>
          </Link>
        );
      })}
    </>
  );
  return (
    <div className="app-shell">
      <aside className="rail">
        <Link href="/orders" className="brand">
          <span className="brand-mark">V</span>
          <span>
            VADO<small>BUSINESS</small>
          </span>
        </Link>
        <p className="rail-caption">Günlük işlerin, tek yerde.</p>
        <nav aria-label="Ana menü">{nav}</nav>
        <div className="rail-footer">
          <span className="status-dot" />
          VADO hesabınla güvende
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="business-heading">
            <span className="business-monogram">{name.slice(0, 1)}</span>
            <div>
              <strong>{name}</strong>
              <span className="small muted">
                {role === "owner" ? "İşletme sahibi" : role === "manager" ? "Yönetici" : "Personel"}
              </span>
            </div>
          </div>
          <div className="topbar-actions">
            <Link href="/businesses">İşletme değiştir</Link>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await call(z.object({ ok: z.boolean() }), "/api/auth/logout", "POST");
                } finally {
                  window.location.assign("/login");
                }
              }}
            >
              Çıkış
            </button>
          </div>
        </header>
        <main className="work-content">{children}</main>
      </div>
      <nav className="bottom-nav" aria-label="Mobil menü">
        {nav}
      </nav>
    </div>
  );
}
