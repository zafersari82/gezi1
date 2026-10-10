# VADO Business Studio — güvenli medya işleme, kota ve temizlik

Bu aşama `VADO_2.8_business_studio_gorsel_yonetimi_tam_kaynak.zip` üzerindeki çalışma olarak hazırlandı; servisleri çatallamadan mevcut medya ve işletme katmanları kullanıldı.

## İşletme görselleri

`POST /v1/business/:businessId/studio/media`, oturum/rol kontrolünden sonra JPEG, PNG veya WebP içeriğini `sharp` ile çözer ve **tek kare WebP** olarak yeniden yazar. Fotoğrafın EXIF/IPTC/XMP bilgileri, GPS dahil, çıktıya alınmaz. EXIF yön bilgisi çıktıdan önce uygulanır. Görsellerin en uzun kenarı **1600 piksel** ve çözülmüş görüntü sınırı **20 milyon piksel**dir. Gelen dosyanın mevcut **8 MB** sınırı korunur. Açık yüklemeler yalnızca Studio işletme resimleridir; sohbet/kişisel medya için önceki API davranışı değiştirilmedi.

Yeni zorunlu API bağımlılığı `sharp` ve kilit dosyasındaki karşılığı eklendi. Derleme / çalışma ortamında işletim sistemine uygun `sharp` ikili bağımlılıklarının kurulması gerekir. Daha önce yüklenmiş görseller geriye dönük işlenmez; yalnız yeni işletme yüklemeleri yeniden kodlanır.

## İşletme bazlı kota

`0028_business_media_quota.sql` şemasında `businesses.media_quota_bytes` varsayılanı **256 MiB**. Her işletmenin limiti bağımsızdır; kurumsal kotalar yetkili yönetim üzerinden daha sonra özelleştirilebilir. Sunucu kota hesabını veritabanındaki gerçek kodlanmış bayt boyutuna göre yapar. İşletme satırındaki `FOR UPDATE` kilidi aynı işletmenin paralel yüklemelerinde kota aşımını önler. Kota aşımı `409 media_quota_exceeded` ile döner; yükleme için saklanan dosya geri temizlenir.

- `GET /v1/business/:businessId/studio/media/usage`: kullanılan bayt, kota, görsel sayısı. İşyeri sahibi, yönetici ve personel okuyabilir.
- `POST /v1/business/:businessId/studio/media/prune`: sahibi/yönetici, 7 günden eski ve artık hiçbir yerde kullanılmayan resimleri 100 kayıtlık partilerle temizler. İşletme paneli aynı işlemleri kimlik bilgileriyle vekil üzerinden kullanır.

## Referans güvenliği ve temizleme

Silme kontrolü **taslak logo/kapak**, **yayındaki logo/kapak**, **ürün görselleri**, **avatar**, **mesaj** ve **moment** başvurularını tarar. Yayın geçmişi değil yalnız **güncel yayın** korunur. İşletme satırı kilidiyle medya ekleme, Studio kaydetme/yayınlama ve katalog görseli bağlama yarışmaları engellenir. Sadece en az yedi günlük bağlantısız dosya adaydır; taze ama henüz kaydedilmemiş yüklemelere dokunulmaz.

Depodan silinecek anahtarlar DB işlemi içinde `business_media_deletions` kuyruğuna girer. Veritabanı kaydı başarılı olup fiziksel depolama silinmesi başarısız olursa anahtar kuyrukta kalır; sonraki temizlik işlemi yeniden dener. Böylece istemciye görünür kayıt silindiği hâlde erişilmesi gereken canlı görseller asla fiziksel temizlik hedefi hâline gelmez. Kuyrukta kurumsal operatör müdahalesi gereken kalıntılar olabilir; işletme kaydı silindiğinde `business_id` boşalan kuyruk satırlarının merkezi bakımı ayrıca gerekecektir.

**Sınırlar:** İşletmeler için otomatik zamanlanmış temizlik henüz yok; sahip/yönetici ekrandaki düğmeyle tetikliyor. Görsel CDN'i, orijin erişim kısıtlaması ve farklı boyutlarda türev üretimi henüz yok. Müşteri göreceği işletme görselleri herkese açık `/media/` adresinden sunuluyor. Ek yükleme hız limiti ve kötü amaçlı dosya stres testleri üretim öncesi doğrulanmalıdır.

## Doğrulama ve kabul

`apps/api/test/business-image-processing.test.ts`: EXIF temizliği, yeniden boyutlandırma, geçersiz görsel reddi. `apps/api/test/business-media-lifecycle.test.ts`: işletme kotası, farklı işletme yalıtımı, kullanılmayan medya ve yayınlanmış görsel koruması. Önceki `studio-media.test.ts` içindeki gerçek PNG kullanımını doğruladık.

Bu ortamda bağımsız Sharp çalıştırmasıyla yeniden kodlama ve EXIF çıkarma kontrolü yapıldı. Proje kuralları ve TypeScript ayrıştırma taraması uygulandı. **Tam npm bağımlılık kurulumu, derleme, PostgreSQL ve entegrasyon testleri çalıştırılmadı; sürüm final değildir.**

Son kabulde: `npm ci`, 0028 migrasyonu, API derlemesi/typecheck, tüm Vitest testleri, PostgreSQL RLS, Docker, paralel dosya yüklemesi, canlı vitrin/görselin korunması ve gerçek mobil tarayıcı kontrolü gerekir.
