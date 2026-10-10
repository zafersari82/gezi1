> **Sürüm notu:** Bu belge bir önceki aşamanın durumunu anlatır. EXIF, yeniden boyutlandırma ve kotalar için güncel bilgi `STUDIO_MEDYA_KOTA_VE_TEMIZLIK.md` dosyasındadır.

# VADO Business Studio — işletme ve katalog görselleri

## Kaynakta tamamlanan bağlantılar

- `POST /v1/business/:businessId/studio/media`: mevcut `media` depolama hizmetini kullanır. Kullanıcı oturumu, işletme üyeliği ve sahip/yönetici yetkisi zorunludur. JPEG/PNG/WebP imzası denetlenir; dosya boyutu 8 MB ile sınırlıdır. Depolama kaydı başarısızsa fiziksel dosya silinir.
- `business_media` işletme/medya sahipliği: **0027_studio_media.sql** migrasyonu, tenant RLS, bileşik FK. Başka işletmenin medya kimliği Studio veya katalog verisine atanamaz.
- `PUT /v1/business/:businessId/studio`: isteğe bağlı `logoMediaId` ve `coverMediaId`, aynı işletmeye ait olma kontrolünden sonra taslak olarak kaydedilir. Müşteri uygulamasının aldığı `published_design` ayrı anlık görüntüdür.
- `POST /v1/business/:businessId/studio/publish`: yayınlandığında logo/kapak kimlikleri anlık görüntüye dahil edilir; yayındaki URL yalnız kayıtlı depolama anahtarından türetilir.
- `PUT /v1/business/:businessId/catalog/items/:id/image`: ürün fotoğrafı için işletme kontrolü ve **beklenen ürün sürümü** zorunludur. Menüdeki ürün görselleri katalog verisinden gelir.
- `POST /api/business/media`: Business paneli için oturum taşıyan aynı-origin vekil. Gövde büyüklüğünü gerçek gelen baytlar üzerinden de sınırlar; işletme kimliğini oturumdaki seçimden alır.
- Mobil uyumlu `/studio`: galeri seçimi, görsel önizleme, kaldırma, ürün fotoğrafı ve taslak/yayın ayrımı. Yayındaki restoran vitrininde logo/kapak, katalogda ürün fotoğrafları görünür.

## Tasarım ve sınırlar

1. Şablon taslağı kaydedilmeden seçilen logo/kapak yayınlanmaz; müşteri vitrini sadece `published_design` okur. Ürün fotoğrafları ise **katalog işlemi** olduğundan kaydedilince müşteri menüsünde güncellenir (ayrı vitrin yayın adımı gerektirmez).
2. Ortak kullanıcı/sohbet medya depolama altyapısı korunur, ikinci bir depolama katmanı kurulmaz. Vitrin görselleri mevcut API'nin **herkese açık `/media/`** URL'lerinden sunulur; bu nedenle bu alana kişisel/saklı görsel yüklenmemelidir.
3. Sistem bu aşamada sunucuda görselleri yeniden boyutlandırmaz, EXIF temizlemez, gerçek piksel boyutlarını sınırlamaz ve görüntü CDN'i kullanmaz. Bunlar üretim öncesi güvenlik ve performans eksikleridir. Yüklenen/yerine geçen dosyaların işletme depolama kotası ve süpürme (garbage collection) politikası da tamamlanmalıdır.
4. Bu kod üzerinde üretim derlemesi, `npm ci`, PostgreSQL/RLS ve gerçek mobil cihaz testi yapılmadı. Özellikle işletme sahibinin hesabı silinmesi, arşiv/medya temizliği, 413 hata yanıtları ve büyük dosya saldırı testleri son kabulde ayrıca denetlenmelidir.

## Kabul adımları

1. `npm ci`, veritabanı migrasyonları **0024–0027** ve rol/grant kurulumlarını uygula.
2. Bir işletme sahibiyle Studio açıp bir JPEG/PNG/WebP logo ve kapak yükle; taslağı kaydet, sayfayı yenile. Yayınlamadan müşteri ekranında görünmemeli.
3. `Yayımla` ardından müşteri mağazasının görselini kontrol et. Yeni kapak ekle ama yayınlama: müşteri eskisini görmeli. İkinci yayın sonrası yenisini görmeli.
4. Bir katalog ürününe resim ekle, şubedeki menüsünde görünmesini kontrol et. Başka işletmenin kimliği, personel rolü ve eski ürün sürümüyle değiştirme denemeleri reddedilmeli.
5. Geçersiz içerik, 8 MB üstü yükleme, sahte dosya uzantısı, bozuk resim, aynı anda farklı cihazdan düzenleme ve tüm RLS/entegrasyon testlerini Docker/PostgreSQL üzerinde çalıştır.

Bu sürüm **VADO 2.8.0-alpha.3 geliştirme aşamasıdır; üretime hazır değildir.**
