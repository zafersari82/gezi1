# VADO Business Studio — katalog önizlemesi ve yayın sürümü

## Bu aşamada gerçekten kodlanan

1. İşletme Studio ekranında ürünleri artık gerçek `catalog` kaydından (yalnız aktif ve mevcut ürün/kategori) görüyor. Varsayılan genel fiyatı varsa TRY olarak gösteriyor, yalnız şubeye özel fiyat varsa uydurma fiyat yazmıyor.
2. Studio taslağı ayrı, müşteri görünümü ayrı. `0026_studio_publication.sql` migrasyonu `published_design`, `published_version`, `published_at` alanlarını mevcut RLS'li `business_studio` tablosuna ekliyor.
3. `POST /v1/business/:businessId/studio/publish`: yalnız sahip/yönetici, doğrulanmış ve etkin işletme, beklenen taslak sürümü; değişiklik denetim kaydına yazılır. Taslak `PUT` sonraki kayıtlarda yayınlanmış sürümü değiştirmez.
4. Next.js Business panelindeki kontrollü `POST /api/business/studio/publish` vekili aktif işletme kimliğini oturumdan alır; başka işletme ID'si alamaz.
5. Restoran müşteri mini uygulaması zaten var olan `ordering.getRestaurant` köprüsünde `storefront` alanını alarak yalnız yayınlanmış adı/tanıtımı, renk paletini ve yerleşimi gösterir. Mini uygulama arka uç kimliklerini kendisi seçmez.
6. Yayınlama için test senaryoları: bekleyen işletme, yanlış sürüm, yabancı kişi, personel yetkisi, taslak güncellenince eski yayının korunması, yeni yayın sonrası müşteri ekranı.

## Bilerek henüz yapılmayanlar

- Güvenli logo/kapak yükleme, medya saklama ve müşteri erişimi (mevcut özel medya altyapısına doğru bağlanması gerekiyor).
- Ürün fotoğrafı şeması, upload ve boyutlandırma; editörde ürün metinleri ve genel fiyatlar mevcut.
- Gelişmiş görsel blok editörü ve 30 gerçek şablon; 6 başlangıç şablonu düzenlenebilir.
- Beauty/berber müşteri rezervasyon görünümüne Studio yayınının bağlanması; bu aşamada restoran mini uygulaması etkilenir.
- Gerçek PostgreSQL/RLS entegrasyonu, mobil cihaz ve tüm otomatik testler (npm bağımlılıkları bulunamadı). Bunlar başarılı ilan edilemez.

## Kurulum ve kabul sırası

`npm ci`, `npm run db:up`, `npm run db:migrate`, `npm run db:roles`; ardından `npm run check` çalıştırılmalı.

1. İşletmenin kataloguna en az bir aktif ürün ve genel fiyat ekle.
2. Business `/studio` sayfasında gerçek ürün ve fiyatı gör; taslağı kaydet.
3. Onaylanmamış işletmeden yayımlamayı dene: `verification_required` beklenir.
4. Etkin ve doğrulanmış işletmeden yayımla. Restoran mini uygulamasında yeni isim/tanıtım/renk görünmeli.
5. Taslağı düzenle ve yeniden kaydet ama yayımlama: müşteride eski yayın değişmemeli.
6. Yeni sürümü yayımla: müşteride güncel sürüm görünmeli. Eski sürüm, personel ve yabancı işletme denemeleri reddedilmeli.
7. Gerçek telefonda kaydetme/yayınlama, ekran genişliği, veri yalıtımı ve RLS testlerini tamamla.

Bu paket **VADO 2.8.0-alpha.3 geliştirme kaynağıdır**, final/üretime hazır sürüm değildir. Kodda kayıt ve yayın ayrımı sağlanmıştır; bağımlılıklar ve veritabanı olmadan çalışma doğrulaması yapılamadı.
