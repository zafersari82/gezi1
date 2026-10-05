"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: Route;
  label: string;
  /** Karar bekleyen kayıt sayısı; sıfırsa rozet gösterilmez. */
  count?: number;
}

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Bölümler">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
        >
          {item.label}
          {item.count !== undefined && item.count > 0 && (
            <span className="count" aria-label={`${item.count} kayıt karar bekliyor`}>
              {item.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
