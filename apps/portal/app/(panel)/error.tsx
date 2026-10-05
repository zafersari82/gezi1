"use client";

interface ErrorPageProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * Sayfa verisi alınamadığında gösterilir. Canlı ortamda hata ayrıntısı tarayıcıya gönderilmediği
 * için burada en olası nedenler anlatılır.
 */
export default function ErrorPage({ error, retry }: ErrorPageProps) {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Veriler alınamadı</h1>
          <p className="lead">
            Panel API'ye ulaşamadı ya da API isteği reddetti. API'nin çalıştığını ve paneldeki
            VADO_ADMIN_API_KEY değerinin API'dekiyle aynı olduğunu kontrol et.
          </p>
        </div>
      </header>
      <button type="button" className="button button-primary" onClick={retry}>
        Yeniden dene
      </button>
      {error.digest !== undefined && <p className="muted mono digest">Hata kodu: {error.digest}</p>}
    </>
  );
}
