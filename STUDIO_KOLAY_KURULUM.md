# VADO Business Studio — telefondan kolay mağaza kurulumu (geliştirme adayı)

Bu aşama önceden teslim edilmiş 2.8.0-alpha.3 kaynaklarını ve görsel/kota katmanını korur. Docker ve gerçek PostgreSQL kabul testleri son aşamadadır.

## Yapılan gerçek kaynak değişiklikleri

1. `StudioStarterWizard`: Business Studio içinde üç aşamalı mobil başlangıç rehberi. Sektöre göre altı örnek ürün veya hizmetten seçim, fiyat ve KDV oranını açıkça girme, onay ve ilerleme durumu.
2. Ortak `studio-starter.ts` sözleşmesi: sınırlı sektör bazlı öneri kataloğu, yalnız izin verilen kimlikler, benzersiz seçim, pozitif tutar, geçerli KDV oranı ve ek alanları reddeden API şeması.
3. `POST /v1/business/:businessId/catalog/starter-items`: işletme üyeliği ve owner/manager yetkisi ile korunan, yalnızca **boş kataloğa** ilk aktarım yapan API. Ürün açıklamaları sabit ve sunucu tarafından seçiliyor; istemci işletme kimliği/ürün adı/SKU belirleyemiyor.
4. Aynı işletmeye ait aktarım tek veritabanı transaction'ında yapılır, satıcı/şube sınırı dışına çıkmaz, kayıt sırasında işletme satırı kilidi kullanılır. Standart katalog yazması da bu kilitleme protokolüne katılır. Başarı sonrası denetim kaydı oluşturulur.
5. Business proxy yalnızca `POST catalog/starter-items` yolunu açar. URL query ile yabancı işletme seçilemez.
6. Kayıt sonrası gerçek katalog tekrar okunup Studio'nun canlı önizlemesi aynı sayfada güncellenir. Taslak yayını ayrı kalır; zaten yayında olan mağazalarda yeni ürünler müşteri menüsünü hemen etkileyebileceğinden ayrıca uyarılır.
7. Sözleşme, API ve yönlendirme izinleri için regresyon testi kaynakları eklendi.

## Bilinçli tasarım kararları

- Örnek ürünlerin **fiyatları ve KDV oranları uydurulmaz**. İşletmeci kendisi girer ve onaylar. Mali yükümlülükleri doğrulamak işletmenin sorumluluğundadır.
- İlk aktarımda bir hata olursa hiçbir kısmi ürün kaydı oluşmaması amaçlanmıştır (SQL transaction). Aynı mağazaya ikinci aktarım reddedilir; kalan iş için mevcut **Ürünler** modülü kullanılır.
- Hazır isimler gerçek müşteri ürünleri için bir başlangıçtır; otomatik yeni mini uygulama, otomatik yayın, randevu motoru veya kurumlar için toplu dış sistem aktarımı **bu aşamada yoktur**.
- Yeni tablo veya migration eklenmedi; mevcut katalog motoruna entegre edildi. Var olan sektör şablonları ve eski kullanıcı kayıtları korunur.

## Çalıştırılması gereken kontroller (nihai kabul)

- `npm ci && npm run check` komutuyla türler, ESLint, Vitest, üretim derlemesi.
- PostgreSQL uygulaması içinde boş katalog aktarımı, aynı anda iki kullanıcı aktarımı, mevcut katalogla çakışma, yanlış sektör, yetkisiz personel, RLS sınırları, yanlış tutarın tam rollback olması.
- Telefon ekranında kurulum, fiyat değişimi, önizleme, taslak yayınlama ve güncellenen katalog testleri.
- Mevcut görüntü/medya katmanı testleri; uygulama kabuğu ve büyük kurum operatörleri için ayrı kabul.

**Sürüm final değildir.** Syntax ve proje kuralları kontrollerinin geçmesi çalışma/entegrasyon onayı anlamına gelmez.
