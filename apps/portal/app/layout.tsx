import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "VADO Control", template: "%s | VADO Control" },
  description: "VADO yönetim paneli",
  robots: { index: false, follow: false },
};

/** Ortak belge iskeleti. Kenar çubuğu yalnızca giriş yapılmış sayfalarda, (panel) içindedir. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
