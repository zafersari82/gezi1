import { vado } from "@vado/miniapp-sdk";
import { useEffect, useState } from "react";

/**
 * Eski randevu örneği gerçek bir sunucu rezervasyonu oluşturmuyordu: saatler sabitti,
 * 'onay' yalnızca cihaz depolamasına yazılıyordu. Bunun gerçek rezervasyonmuş gibi
 * gösterilmesi engellendi. S11'in gerçek rezervasyon ekranı VADO mobil içindedir.
 * Mini uygulama-kabuk köprüsü ileriki sürümde aynı S11 API'sine bağlanacaktır.
 */
export function App() {
  const insideVado = vado.isAvailable();
  const [businessName, setBusinessName] = useState("İşletme");
  const [loading, setLoading] = useState(insideVado);
  useEffect(() => {
    if (!insideVado) return;
    vado.app
      .getContext()
      .then((context) => {
        if (typeof context.config.businessName === "string")
          setBusinessName(context.config.businessName);
      })
      .catch(() => {
        // Doğrulanmamış bağlam işletme kimliği olarak kullanılmaz.
      })
      .finally(() => {
        setLoading(false);
      });
  }, [insideVado]);
  return (
    <main className="page">
      <header className="intro">
        <h1>{loading ? "VADO Randevu" : businessName}</h1>
        <p className="lead">Randevu önizlemesi</p>
      </header>
      <section className="notice" role="status">
        Bu örnek mini uygulama gerçek randevu oluşturmaz ve ödeme almaz. Müsait saatleri görmek ve
        gerçek randevu almak için VADO'da işletme profiline dönüp
        <strong> Randevu al </strong> bölümünü kullan.
      </section>
      {insideVado && (
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            void vado.container.close();
          }}
        >
          İşletme profiline dön
        </button>
      )}
    </main>
  );
}
