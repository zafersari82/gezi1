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
