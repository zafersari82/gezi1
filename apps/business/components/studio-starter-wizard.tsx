"use client";

import {
  type Category,
  STUDIO_STARTER_ITEMS,
  studioStarterCatalogBodySchema,
  studioStarterCatalogResultSchema,
} from "@vado/contracts";
import { useState } from "react";

import { call, ClientApiError, errorMessage } from "../lib/client";
import { decimalToMinor } from "../lib/values";

interface StarterEntry {
  selected: boolean;
  price: string;
  vat: string;
}

/** İlk kurulum: örnek isimler sağlanır, gerçek fiyat ve vergi kararı kullanıcıda kalır. */
export function StudioStarterWizard({
  category,
  itemCount,
  draftSaved,
  isPublished,
  canWrite,
  onImported,
}: {
  category: Category;
  itemCount: number;
  draftSaved: boolean;
  isPublished: boolean;
  canWrite: boolean;
  onImported: () => Promise<void>;
}) {
  const suggestions = STUDIO_STARTER_ITEMS.filter((entry) => entry.category === category);
  const [entries, setEntries] = useState<Record<string, StarterEntry>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (suggestions.length === 0) return null;

  function change(id: string, update: Partial<StarterEntry>) {
    setEntries((state) => ({
      ...state,
      [id]: {
        selected: false,
        price: "",
        vat: "",
        ...state[id],
        ...update,
      },
    }));
    setError("");
  }

  async function create() {
    if (!canWrite || busy || itemCount > 0) return;
    setError("");
    setNotice("");
    try {
      const selected = suggestions.filter((item) => entries[item.id]?.selected === true);
      if (selected.length === 0) throw new Error("En az bir ürün veya hizmet seç.");
      const body = studioStarterCatalogBodySchema.parse({
        items: selected.map((item) => {
          const entry = entries[item.id];
          if (entry === undefined || entry.price.trim() === "" || entry.vat.trim() === "")
            throw new Error("Seçtiğin her ürün için fiyat ve KDV oranını gir.");
          const rate = Number(entry.vat.replace(",", "."));
          if (!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(entry.vat.trim()) || !Number.isFinite(rate))
            throw new Error("KDV oranını yüzde olarak yaz (örneğin 10).");
          return {
            id: item.id,
            amountMinor: decimalToMinor(entry.price),
            vatBasisPoints: Math.round(rate * 100),
          };
        }),
      });
      if (
        !window.confirm(
          `${body.items.length} ürün/hizmet belirlediğin fiyat ve vergilerle kataloğa eklensin mi? ` +
            (isPublished
              ? "Canlı mağazadaki ürün listesi hemen güncellenebilir; tasarım ayrı yayımlanır."
              : "Bu işlem mağaza tasarımını kendiliğinden yayımlamaz."),
        )
      )
        return;
      setBusy(true);
      const result = await call(
        studioStarterCatalogResultSchema,
        "/api/business/catalog/starter-items",
        "POST",
        body,
      );
      try {
        await onImported();
        setNotice(
          `${result.imported} kayıt oluşturuldu. Şimdi mağaza görünümünü kaydedip inceleyebilirsin.`,
        );
      } catch {
        // İşlem sunucuda başarılıysa yeniden POST yapmak yerine kataloğu tekrar oku.
        window.location.reload();
      }
    } catch (cause) {
      setError(
        cause instanceof ClientApiError && cause.status === 409
          ? "Bu işletmenin kataloğu başka bir işlemde doldurulmuş. Sayfayı yenileyip ürünlerini incele."
          : errorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel studio-starter" aria-label="Mağaza kurulum rehberi">
      <span className="eyebrow">VADO Business Studio</span>
      <h2>Mağazanı 3 adımda hazırla</h2>
      <p className="muted small">
        Telefonundan ilerle; bilgisayar veya teknik bilgi gerekmez. İstediğin zaman geri
        dönebilirsin.
      </p>
      <ol className="studio-setup-steps">
        <li>
          <strong>1. Tasarım</strong>
          <span>{draftSaved ? "Taslağın kayıtlı" : "Aşağıdan şablon, isim ve renk seç"}</span>
        </li>
        <li>
          <strong>2. {category === "food" ? "Menün" : "Hizmetlerin"}</strong>
          <span>
            {itemCount > 0 ? `${itemCount} kayıt mevcut` : "Ürünlerini ve gerçek fiyatlarını ekle"}
          </span>
        </li>
        <li>
          <strong>3. Yayın</strong>
          <span>
            {isPublished ? "Mağaza görünümün yayında" : "Önizle, kaydet ve hazır olduğunda yayımla"}
          </span>
        </li>
      </ol>
      {category === "beauty" && (
        <p className="muted small">
          Randevu takvimi sonraki sürümde tamamlanacak; bu aşamada hizmetlerin ve fiyatların
          kaydedilir.
        </p>
      )}
      {itemCount === 0 ? (
        <div className="studio-starter-items">
          <h3>{category === "food" ? "Menüye ne ekleyelim?" : "Hangi hizmetleri sunuyorsun?"}</h3>
          <p className="muted small">
            Hazır önerileri seç; yalnızca kendi sattıklarını işaretle. Fiyat ve KDV oranını sen
            belirlersin. Fiyatları biz tahmin etmiyoruz.
          </p>
          <div className="studio-starter-grid">
            {suggestions.map((item) => {
              const entry = entries[item.id] ?? { selected: false, price: "", vat: "" };
              return (
                <div className="studio-starter-item" key={item.id}>
                  <label className="studio-starter-check">
                    <input
                      type="checkbox"
                      checked={entry.selected}
                      disabled={!canWrite || busy}
                      onChange={(event) => { change(item.id, { selected: event.target.checked }); }}
                    />
                    <span>{item.name}</span>
                  </label>
                  {entry.selected && (
                    <div className="studio-starter-fields">
                      <label>
                        Fiyat (TL)
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Örn. 150,00"
                          maxLength={12}
                          value={entry.price}
                          disabled={!canWrite || busy}
                          onChange={(event) => { change(item.id, { price: event.target.value }); }}
                        />
                      </label>
                      <label>
                        KDV oranı (%)
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Oranı gir"
                          maxLength={6}
                          value={entry.vat}
                          disabled={!canWrite || busy}
                          onChange={(event) => { change(item.id, { vat: event.target.value }); }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted small">
            Uygulanacak KDV oranlarını gerekirse mali müşavirinle doğrula. Bu kayıtlar yalnız kendi
            işletmende oluşturulur.
          </p>
          <button
            className="primary"
            type="button"
            disabled={!canWrite || busy}
            onClick={() => void create()}
          >
            {busy ? "Kayıtlar oluşturuluyor…" : "Seçtiklerimi kataloğa ekle"}
          </button>
        </div>
      ) : (
        <p className="small muted">
          Kataloğun hazır. Ürün, fiyat ve hizmetlerini <a href="/catalog">Ürünler</a> bölümünden her
          zaman düzenleyebilirsin.
        </p>
      )}
      {error !== "" && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice !== "" && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {!canWrite && (
        <p className="muted small">
          Kurulumu yalnız işletme sahibi veya yöneticisi düzenleyebilir.
        </p>
      )}
    </section>
  );
}
