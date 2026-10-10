# VADO S10 — Shops: Mağaza / Market / Çiçekçi / Petshop

**Temel kaynak:** Claude A1 mimarisinden geliştirilmiş S9 tam ZIP. S1–S9 içeriklerinin üzerine aynı çalışma ağacında eklenmiştir; eski ZIP'lerle birleştirilmez. **Durum: kaynak geliştirme adayı, üretim onayı değildir.**

## Gerçekten geliştirilenler

- `miniapps/shop`: `magaza` kimlikli, React/Vite ve VADO Miniapp SDK kullanan yeni **satış vitrin paketi**. Tek paket birden fazla mağazaya uygulanabilir; ikinci sipariş veya sepet motoru yok.
- `ordering.getStore`: sektör-agnostik, tenant yetkili müşteri bağlamı. `restaurant.context` ile `store` aynı `createStorefrontContext` fonksiyonundan beslenir; eski `ordering.getRestaurant` uyumluluk için korunmuştur.
- Mağaza ekranı: yayımlanmış logo/kapak, aktif şube seçimi, güncel kategori/ürün/fiyat, ürün seçenekleri, adet, gel-al ve **isteğe bağlı** adrese teslimat; teslimat yalnız yetenek açık ve kayıtlı adres bölgesi uygunsa.
- Checkout: mevcut ordering API, sunucu quoteHash/version doğrulaması, idempotency anahtarıyla tekrar gönderim, fiyat değişikliği onayı, müşteri sipariş geçmişi. Otomatik online ödeme başlatılmaz.
- Restoran ve mağaza ortak katalog seçenekleri ile paylaşım/deep-link doğrulaması `@vado/miniapp-shared` çalışma alanı modülüne alınmıştır. Şubeye özel fiyat genel fiyatı geçersiz kılar.
- İşletme Studio için üç gerçek alışveriş şablonu: `shop-neighborhood`, `shop-boutique`, `shop-enterprise`; ilk katalog için fiyatı işletmeci tarafından girilecek market/petshop/çiçekçi örnekleri.
- Mobil kullanıcı açılışı: `shopping` kategorisi `magaza`, `food` kategorisi `restoran` paketine yönlenir. Sohbetten ürün ve adrese teslimat açılışı doğru paketi seçer. Ürün ve adres sahipliği sunucuda yeniden doğrulanır.
- Manifest: `miniapps/shop/public/vado.app.json`, minimum izinler `ordering.basic`, `location.addresses`, `storage.local`. Kullanıcıdan adres izni istemeden sadece gel-al kullanılabilir.

## Güvenlik ve ürün kararları

1. Şube, uygulama kimliği ve müşteri işletme bağlamı **API üzerinden** doğrulanır. Launch parametreleri yalnız açılış önerisidir.
2. Stok için **sayısal stok takibi yoktur**: mevcut katalog yalnız aktif/bulunurluk bayrağını destekler. Sipariş anında bulunurluk ve fiyat tekrar kontrol edilir. Stok garantisi **verilmez**.
3. Kayıtlı adrese teslimat, ilgili şubenin aktif bölgesi ve sunucu teklifiyle onaylanır; farklı adres/şube sepeti sessizce değiştirilmez.
4. Mini uygulama sipariş isteği gönderir; entegre online ödeme veya kurye takip sistemi **sunmaz**. Satıcının yasal ve operasyonel yükümlülükleri ayrıca değerlendirilir.
5. Ürün ve sektör şablonları eklenirken veritabanına yeni tablo veya migrasyon eklenmemiştir. Müşteri/satıcı/tenant RLS yapısı korunmuştur.

## Geliştirici kurulum ve yayımlama

- Bağımlılıkları çevrimiçi ortamda temiz kur: `npm ci`.
- Ortak kalite: `npm run check` (format, lint, conventions, typecheck, test, build).
- Mağaza paketi: `npm run build -w @vado/miniapp-shop`.
- Paket manifesti ve dist dosyaları doğrulanarak mevcut `miniapp:pack`/mini uygulama kayıt-yayın hattından `magaza` yayımlanır. Paket yayımlanmadan kullanıcı ona yönlendirilmez.
- İşletme kayıt/paneli `shopping` kategorisinde alışveriş şablonunu kullanır. Gerekli ordering pickup/delivery yetenekleri **işletmeye özgü** açılmalıdır.
- S9 restoran paketinde yeni ortak çalışma alanı bağımlılığı olduğundan **yeniden derlenmesi** ve yayınlanan eski paketin yeni sürüm için kontrol edilmesi gerekir.

## Kabul senaryoları (bağımlılıklar ve PostgreSQL gerektirir)

1. Gerçek PostgreSQL migrasyonlarını sıfır ve A1'den yükseltilmiş DB üzerinde doğrula, zorunlu RLS izolasyonunu ölç.
2. Bir restoran ve `shopping` kategorisinde iki mağaza kur; ayrı merchant, appInstance ve ürün kataloglarının karışmadığını doğrula.
3. Şubeye özel fiyatın mağaza kartı, seçenek modalı, sepet quoteHash ve checkout'ta aynı kaldığını denetle.
4. Alışveriş mağazasına S5 paylaşılan ürün → doğrulanmış `magaza` örneği → doğru şube → ürün seçenekleri → sepet akışını test et.
5. Keşifte kayıtlı adres → uygun mağaza şubesi → teslimat açılışı; yabancı, arşivli ve bölge dışı adresleri reddet.
6. Yanlış/iptal ürün, eski fiyat, kapalı şube, açık başka şube sepeti, aynı idempotency anahtarıyla tekrarlı checkout ve ağ kesintisi senaryolarını doğrula.
7. Restoran gel-al, masa, ürün paylaşımı ve teslimat regresyonlarını yeniden çalıştır.
8. Expo gerçek Android/iOS ve 390×844/768×1024/1440×900 ekranlarda UX kontrolü.
9. Mini uygulama yayınlama ve sandbox/izin regresyonlarını test et.

## Denenen ve denenmeyen

- Denendi (2.8.0-alpha.5, PostgreSQL 16, `vado_app`/`vado_platform` rolleriyle RLS altında): `npm run check`; `miniapps/shop/test/model.test.ts`, `packages/contracts/test/shop-studio.test.ts`, `miniapps/shared/test/*`, mobil bağlam ve açılış testleri; mağaza mini uygulamasının Vite derlemesi.
- Denenmedi: mağaza mini uygulamasının telefonda kullanımı, paketlenip yayımlanması.

## Sonraki iş

Mağaza stok miktarı, sipariş sonrası bildirimler ve iade süreçleri 2.8 planına göre (A2–A4, bkz. [PLAN_2.8.md](PLAN_2.8.md)) ele alınır. Rezervasyon motoru S11'de geldi. Vardiya planlama ve personel görev yönetimi kapsam dışıdır.
