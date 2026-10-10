# VADO 2.8 — Çok şubeli mobil fiyat yönetimi

Bu aşamada var olan `prices` tablosunu, şube bazlı fiyat önceliğini ve sipariş fiyatlandırma motorunu yeniden yazmak yerine, üzerlerine güvenli bir toplu yönetim akışı inşa edildi. Yeni bir veritabanı migrasyonu gerekmedi.

## Uçtan uca kaynak bağlantıları

- `apps/business/components/branch-price-matrix.tsx`: Ürünler > Şube fiyatları sekmesinde telefondan şube seçimi, ürün araması, genel/şube fiyatlarının ayrımı, KDV ve fiyat değişimi. Tek kayıtta en fazla 100 ürün; istenirse şubeye özel fiyat kaldırılarak genel fiyat kullanılır. Varsa diğer işlemlerden güncel kataloğu tekrar okumak için Yenile düğmesi.
- `packages/contracts/src/catalog.ts`: Şube + benzersiz ürün listesi + önceki ve yeni fiyat değerlerinin sıkı şekilde doğrulanması; istemci tarafından gönderilen işletme kimliği kabul edilmez.
- `apps/api/src/modules/catalog/catalog.routes.ts`: `PUT /v1/business/:businessId/catalog/branch-prices`.
- `apps/api/src/modules/catalog/catalog.service.ts`: Yalnızca sahip/yönetici; `withTenant` RLS + şube ve ürün aidiyet kontrolleri; deterministik kilitleme; her ürünün beklenen eski fiyatını kontrol etme; PostgreSQL tek transaction ile yazma/silme; denetim kaydı. Satır çakışması olursa **hiçbir değişiklik uygulanmaz**.
- `apps/business/lib/request-policy.ts`: Seçilmiş işletme dışında işlem açmayan Business API vekili izin listesi.
- `apps/api/test/branch-prices.test.ts`, `packages/contracts/test/branch-prices.test.ts`, `apps/business/test/business-input.test.ts`: Başarılı toplu işlem, varsayılan fiyata dönme, işlem bütünüyle geri alınmalı çakışması, yetkiler, başka işletmenin ürün/şubesi ve istek doğrulaması için regresyon testleri.

## Bilinçli sınırlar

- Şubeye özel fiyat kaydedilince o şubedeki yeni siparişlere **hemen** etki eder. Bu geliştirme fiyatlar için ayrıca taslak-onay-yayın sistemi getirmez.
- Her istekte en fazla 100 değişiklik vardır; arayüz aramayla ilk 100 eşleşmeyi gösterir. On binlerce SKU içeren müşteriler için sayfalama, dosyadan toplu aktarım ve onay akışları ayrı kurumsal geliştirme konusudur.
- İndirim politikası, para birimi çeşitliliği, franchise onay hiyerarşisi ve üçüncü taraf ERP entegrasyonu bu aşamada eklenmedi.
- Bu, büyük zincirlerin tüm gereksinimlerinin bittiği anlamına **gelmez**. İşletme organizasyon yönetimi ve şube personel yetkilerinin ayrıntıları sonraki geliştirme aşamalarıdır.

## Henüz gerekli kabul testleri

`npm ci && npm run check` ve gerçek PostgreSQL içinde fiyat okuma/yazma, çift cihaz çakışması, RLS, eşzamanlı işlem kilit sırası, sipariş toplamı ve kurumsal yük testleri. Docker ve gerçek cihaz testleri sona bırakıldı.
