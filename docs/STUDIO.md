# VADO Business Studio

İşletme sahibinin telefonundan vitrinini kurduğu bölüm. Studio yalnız **görünümdür**: işletmenin
kataloğu, fiyatı, şubesi ve siparişleri ayrı kalır. Ayrı mağaza motoru, ayrı katalog tablosu ya da
kopyalanmış mini uygulama yoktur.

## Şablonlar

Şablonlar `packages/contracts/src/studio.ts` dosyasındaki kayıttan gelir; veritabanı şablon
kimliğini yalnız biçim olarak denetler. Yeni şablon şema değişikliği gerektirmez.

| Kimlik              | Ad                 | Düzen           | Motor       |
| ------------------- | ------------------ | --------------- | ----------- |
| `food-fast`         | Hızlı Servis       | Kompakt         | Sipariş     |
| `food-classic`      | Klasik Restoran    | Klasik          | Sipariş     |
| `food-premium`      | Seçkin Restoran    | Fotoğraf odaklı | Sipariş     |
| `food-enterprise`   | Kurumsal Zincir    | Kurumsal        | Sipariş     |
| `shop-neighborhood` | Mahalle Mağazası   | Kompakt         | Sipariş     |
| `shop-boutique`     | Butik ve Çiçekçi   | Fotoğraf odaklı | Sipariş     |
| `shop-enterprise`   | Çok Şubeli Mağaza  | Kurumsal        | Sipariş     |
| `beauty-solo`       | Tek Kişilik Berber | Kompakt         | Rezervasyon |
| `beauty-team`       | Ekipli Salon       | Klasik          | Rezervasyon |
| `beauty-premium`    | Seçkin Salon       | Fotoğraf odaklı | Rezervasyon |

Motoru yayında olmayan şablon sunulmaz (`OFFERED_STUDIO_TEMPLATES`). Rezervasyon motoru S11'de
geldi, ama randevu mini uygulamasının köprüsü henüz yok; güzellik şablonları bu köprüyle birlikte
açılır (Mağazam planı, M1).

Bu tablo, sektör paketi × düzen × renk ve blok sistemine geçişte (Mağazam planı, M1) yerini sektör
paketlerine bırakır: [PLAN_MAGAZAM.md](PLAN_MAGAZAM.md).

Renkler sabit bir setten seçilir (deniz yeşili, doğal yeşil, lacivert, mürdüm); istemciden serbest
CSS alınmaz.

## Taslak ve yayın

- `PUT /v1/business/:businessId/studio` taslağı kaydeder. Beklenen sürüm başka cihazın kaydını
  ezmeyi önler (409).
- `POST /v1/business/:businessId/studio/publish` taslağın anlık görüntüsünü yayına alır. Yalnız
  etkin ve doğrulanmış işletmede, sahip ya da yönetici yapar; denetim kaydına yazılır.
- Müşteri yalnız yayını görür: işletme profili (`BusinessDetail.storefront`) ve restoran mini
  uygulaması. Taslak, sürüm bilgisi ve iç medya kimlikleri müşteriye gitmez.
- Taslak son yayından ilerideyse durumu "taslak", değilse "yayında" görünür.

## Görseller

- `POST /v1/business/:businessId/studio/media`: JPEG, PNG ya da WebP; en çok 8 MB. Sunucu görseli
  `sharp` ile çözer ve tek kareli WebP olarak yeniden yazar: en uzun kenar 1600 piksel, en çok
  20 milyon piksel, EXIF/IPTC/XMP (GPS dahil) atılır.
- Görsel işletmeye bağlıdır (`business_media`); başka işletmenin görseli vitrine ya da ürüne
  bağlanamaz.
- İşletme başına kota 256 MiB'tır; aşımda `409 media_quota_exceeded`. Aynı işletmenin eş zamanlı
  yüklemeleri işletme satırı kilidiyle sıralanır.
- Temizlik: sahip ya da yönetici, 7 günden eski ve hiçbir yerde (taslak, yayın, ürün, avatar,
  mesaj, an) kullanılmayan görselleri 100'erli gruplarla siler. Depodan silinemeyen dosya kuyrukta
  kalır ve sonraki temizlikte yeniden denenir.
- Ürün fotoğrafı katalog verisidir: `PUT .../catalog/items/:id/image` beklenen ürün sürümüyle
  kaydedilir ve menüde hemen görünür.
- Vitrin görselleri herkese açık `/media/` adresinden sunulur; kişisel görsel yüklenmemelidir.

## Kolay kurulum ve çok şubeli işler

- **İlk ürünler:** `POST .../catalog/starter-items` yalnız boş kataloğa, sektöre göre önerilmiş
  ürünleri tek işlemde ekler. Fiyat ve KDV oranını işletmeci girer; uydurulmaz.
- **Şube fiyatları:** `PUT .../catalog/branch-prices` tek seferde en çok 100 ürün; her ürünün
  beklenen eski fiyatı denetlenir, tek uyuşmazlık bütün işlemi geri alır.
- **Şube satış durumu:** `PUT .../branches/availability-batch` en çok 100 ürün; `catalog.availability`
  izniyle personel de yapabilir (bkz. [YETKI.md](YETKI.md)).

## Olmayanlar

Görsel CDN'i ve boyut türevleri, zamanlanmış otomatik temizlik, CSV/ERP aktarımı. Blok tabanlı
sayfa, sektör paketleri ve yapay zekâ ile ürün listesi önerisi Mağazam planındadır
([PLAN_MAGAZAM.md](PLAN_MAGAZAM.md)).

## Denenen ve denenmeyen

- Denendi (PostgreSQL üzerinde): `studio`, `studio-publication`, `studio-media`,
  `business-image-processing`, `business-media-lifecycle`, `studio-starter`, `branch-prices`,
  `branch-availability-batch` testleri.
- Denenmedi: Studio ekranının tarayıcıda ve telefonda kullanımı, büyük dosya saldırı denemeleri,
  Docker imajında `sharp` (2.8 kapanışında).
