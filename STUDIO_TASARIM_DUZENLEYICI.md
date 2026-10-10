> Bu belge önceki Studio düzenleyici aşamasını anlatır. Güncel yayın ve müşteri görünümü durumu için `STUDIO_KATALOG_VE_YAYIN.md` dosyasına bakın.

# VADO Business Studio — mobil görünüm taslağı (geliştirme aşaması)

## Bu aşamada kaynak kodda bulunan özellikler

- `VADO Business /studio`: telefon ekranına uyumlu şablon, mağaza adı, kısa tanıtım ve renk paleti editörü.
- Üç yemek/restoran ve üç berber/güzellik şablonundan sektöre uygun olanlar seçilir. Henüz ayrı altı mini uygulama oluşturulmaz; tek işletme motoru korunur.
- Gerçek zamanlı **tarayıcı içi önizleme** taslak girişlerini kullanır; müşterilere açık bir mağaza değildir. Örnek fiyat veya hayalî menü ürünü gösterilmez.
- `PUT /v1/business/:businessId/studio`: kaydetme işlemi. Oturum doğrulaması, işletme üyeliği, rol kontrolü (sahip/yönetici), sektör-şablon uyumu ve yazım sınırları uygulanır.
- Taslak eski işletmeler için `expectedVersion: 0` ile açılır; mevcut taslaklar beklenen sürümle güncellenir. İki cihazdan eşzamanlı düzenleme aynı satırı sessizce ezemez (409).
- `GET /v1/business/:businessId/studio`: yalnız kendi işletmesinin taslağı, işletme adı ve sektörü.
- RLS'li `business_studio` tablosuna `0025_studio_design.sql` migration'ıyla görünüm sütunları ve sürüm numarası eklenir.
- Güncellemeler denetim kaydına işlenir. Şablon/sipariş/katalog kayıtları birbirinden ayrıdır.
- Eski Business Ayarlar ekranındaki mağaza taslağı bağlantısı artık düzenleyiciye yönlendirir.

## Henüz bulunmayanlar

- Gerçek müşteri mini uygulamasına **yayınlanmış** görünüm aktarımı, yayına alma ve geri dönüş (release/rollback).
- Ürün ve hizmetlerin müşteri görünümüne gerçek önizleme eşlemesi.
- Kapak/logo için medya yükleme akışı ve görsel doğrulama.
- Telefonun yerel VADO uygulamasından Studio'ya gömülü/yerel erişim. Mevcut Studio telefon tarayıcısından responsive Business panelinde çalışacak şekilde kodlandı.
- 30 restoran şablonu ve genel kodsuz sayfa blok editörü.
- Enterprise toplu şablon yönetimi ve ayrı sektörlerin sipariş/rezervasyon kabiliyetleri.

## Son kabul / çalışma sırası

1. `npm ci` bağımlılıklarını kur; `npm run db:up`, `npm run db:migrate`, `npm run db:roles` uygula.
2. Bir restoran sahibiyle giriş yap; `/studio` ekranını 375px genişlikte aç, canlı önizlemede şablon ve renk değişimini kontrol et.
3. Kaydet; sayfayı yenile, taslağın korunmasını doğrula; Business Ayarlar'dan Studio'ya git.
4. Aynı mağazayı iki telefon/sekmede aç; ilk kayıt sonrasında diğer sekmede 409 sürüm uyarısını doğrula.
5. Personelin GET yapabildiğini ancak PUT yapamadığını; yabancı işletmenin GET/PUT yapamadığını; beauty şablonunun restoran için reddedildiğini doğrula.
6. Veritabanında işletmelerin birbirlerinin taslaklarını göremediğini RLS ile sınayarak `npm run check` ve üretim derlemelerini çalıştır.

Bu ZIP `2.8.0-alpha.3` geliştirme adayıdır. Npm bağımlılıkları ve PostgreSQL'e erişilemediği için yeni API testleri, tip denetimi ve uçtan uca testler çalıştırılamamıştır. Bu belge çalışan bir müşteri mağazasının yayımlandığını veya üretim onayı verildiğini iddia etmez.
