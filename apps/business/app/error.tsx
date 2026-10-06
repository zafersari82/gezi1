"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="chooser-page">
      <h1>Şu anda bu sayfa açılamıyor.</h1>
      <p>Bağlantını veya işletme üyeliğini kontrol edip yeniden dene.</p>
      <button className="primary" onClick={reset}>
        Tekrar dene
      </button>
      <Link href="/businesses">İşletmelerime dön</Link>
    </main>
  );
}
