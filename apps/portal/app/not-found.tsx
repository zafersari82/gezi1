import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth">
      <header className="page-header">
        <div>
          <h1>Sayfa bulunamadı</h1>
          <p className="lead">Aradığın kayıt silinmiş ya da adres yanlış yazılmış olabilir.</p>
        </div>
      </header>
      <Link href="/" className="button">
        Genel bakışa dön
      </Link>
    </main>
  );
}
