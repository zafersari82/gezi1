import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PwaRegistration } from "../components/pwa-registration";

export const metadata: Metadata = {
  title: { default: "VADO Business", template: "%s · VADO Business" },
  description: "İşletmenin günlük işlerini VADO hesabınla yönet.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
