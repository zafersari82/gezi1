# Restoran 2.7 — kurulum ve işletme

VADO'nun `miniapps/restaurant` paketi, mevcut Sipariş motoru ve kabuk köprüsüyle
çalışır. Masa, gel-al, ileri saat, mutfak ve fiziksel tahsilat bu sürümdedir. Şubeyi
ve çalışanları VADO Business yönetir. Online ödeme, kurye ve eve teslim 2.7 kapsamında
değildir.

## Kurulum

1. [YAYIN.md](YAYIN.md#26dan-27ye-geçiş-ve-geri-dönüş) adımlarına göre yedek alın,
   `vado_owner` ile 0014–0017 geçişlerini uygulayın. API `vado_app`, platform işleri
   `vado_platform` bağlantısıyla çalışır. API, Business ve müşteri kabuğunu birlikte
   2.7.0'a yükseltin; eski mini uygulamaların mevcut akışları korunur.
2. `npm run build -w @vado/miniapp-restaurant` çalıştırın. Ardından
   `npm run miniapp:pack -- miniapps/restaurant/dist --out restoran-1.0.0.zip` ile
   müşteri paketini üretin. Ürün sürümü 2.7.0, ilk müşteri paket sürümü 1.0.0'dır.
3. Control → Paketler'de `restoran` paketini yükleyip incelemeye gönderin. Ayrı bir
   inceleyen hesabı onaylasın; yükleyen kendi paketini onaylayamaz. İşletmenin mini
   uygulama kaydında bu onaylı sürümü seçin, geliştiriciyi VADO ve kategori/yayın
   bilgilerini doğrulayın. İşletme–satıcı bağını kurup Sipariş motorlu uygulama
   örneğini etkinleştirin. Paket arşivi ile mini uygulama kaydı ayrı kayıtlardır.
4. Business → Ayarlar'da ihtiyaç duyulan `ordering.table_service`, `ordering.kitchen`,
   `ordering.pickup` ve `ordering.scheduling` paketlerini açın. İleri saat paketi
   gel-al paketine bağlıdır. Eski `ordering.preparation` ile mutfak aynı örnekte
   birlikte açılamaz. Paket değişimi başlamış siparişin akış görüntüsünü değiştirmez.
5. Şubenin saat dilimini, haftalık saatlerini, hazırlık süresini, slot aralığını ve
   ileri sipariş gün sınırını ayarlayın. Tarihli istisnada boş saat listesi şubeyi
   o gün kapatır. Ürün/seçenek fiyatlarını, zorunlu/en çok seçimleri, şube tükenme
   durumlarını ve kategori/ürün menü saatlerini düzenleyin.
6. Business → Masalar'da şube ve uygulama örneğine bağlı masalar oluşturun. QR'ı
   yazdırın. VADO'da okutulan imzalı ham QR, kabuk tarafından sunucuya doğrulatılır;
   mini uygulamanın kendi yazdığı masa parametresi yetki vermez. Eski 2.5 `masa/sube`
   QR'ları aynı şubede tek etkin uygulama örneği bulunduğunda kullanılabilir; birden
   çok örnekte belirsiz bağ reddedilir. Yeni QR işletme ve örneği de içerir.

## Müşteri ve servis

Menü kategori, arama, saat ve tükenme durumuna göre sunulur. Zorunlu/en çok seçim
ve satır notu sunucuda yeniden doğrulanır; sipariş satırı seçenek, fiyat/KDV ve notu
değişmez görüntü olarak taşır. Sepet sunucudadır. Fiyat veya bulunurluk değişirse
`cart_changed` yeni sepeti gösterir; müşteri yeni tutarı açıkça onaylar. Checkout
anahtarı ve gönderilen gövde yanıt alınana kadar saklanır. Sunucu siparişi oluşturup
yanıt kaybolsa bile yeniden sorgulama ve sayfa yenileme aynı siparişi geri getirir.
İlk bağlantı hatasında **Yeniden dene** veya yeniden bağlantı aynı başlangıç
akışını tamamlar. Menü, bulunurluk, şube açıklığı ve seçili saatin menüsü açık
oturumda yenilenir; sepetin yeni fiyatı yine açık onay gerektirir. Bildirimde
belirtilen sipariş, işletme/müşteri kapsamı doğrulanarak doğrudan açılır.

**Sepeti bırak ve yeni zaman seç** açık sepeti sunucuda sonlandırır; boş veya
hazırlık süresi artık uygun olmayan sepette de şube/zaman seçimini açar. Bekleyen
checkout sonucu önce aynı anahtarla çözülür; bu sırada sepet bırakılamaz.

Gel-al saatleri şubenin yerel saat diliminde, hazırlık süresi, slot aralığı, geceye
taşan çalışma ve tarihli istisnalara göre üretilir. Hazırlık ve teslim aralığı açık
olmalıdır. Şube şu anda kapalıyken ileri saat seçilmiş olsa da checkout reddedilir.
Seçilen zamandaki menü ve fiyatlar checkout sırasında tekrar denetlenir.

Kabul 1–240 dakika tahmini hazırlık süresi, ret en az üç karakter gerekçe ister.
Müşteri canlı ekranında sonucu görür; aynı işlemsel outbox müşteri bildirimini de
teslim eder. Bildirim önizlemesi kapalı kullanıcıya ayrıntı gönderilmez. Aynı
masadaki müşteriler birbirlerinin sipariş ayrıntısını veya hesabını göremez.
İşletme masanın birleşik hesabını görebilir.

Garson çağrısı ve hesap isteğinde her müşteri/tür için tek bekleyen kayıt vardır.
Çalışan isteği karşılandı olarak işaretler. Tahsilat masada veya kasada, nakit ya da
fiziksel POS ile kaydedilir. Sipariş ve ödeme sürümleri ayrıdır; eski bir yanıt yeni
ödeme/durum bilgisini geriye alamaz. Ödenmiş sipariş iptal/reddedilemez. Masa ancak
bütün siparişler bitiş durumuna gelip ödendiğinde kapanır. Sıfır tutarlı sipariş
ödeme gerektirmez; `paid` ve ödeme sürümü `0` taşır, sahte tahsilat kaydı oluşturulmaz. Kapalı oturumun müşterisi
sonraki masa oturumuna otomatik bağlanmaz; yeniden QR okutmalıdır.

## Ortak mutfak tableti

Tablet Business'ın `/kitchen-pair` sayfasında beş dakika geçerli kod üretir. Sahip
veya yönetici kendi hesabıyla Cihazlar'dan kodu, şubeyi, uygulama örneğini ve cihaz
adını onaylar. Kod sınırlı denemeyle tek kullanımlıktır. Tablet kişisel hesaba
girmez; yalnız atandığı mutfağa erişir. Kimlik 30 gün geçerli, HttpOnly/Secure/Strict
çerezdedir. Ürün, tahsilat veya işletme ayarına yetki vermez. Uzaktan kapatma açık
soketi de keser; cihazın her işlemi güncel yetkisiyle denetlenir.

İlk dokunuşta **Sesi ve ekranı aç** düğmesine basın. Tarayıcının ses ve Wake Lock
durumu ekranda görünür. Görünür ekran kilidi tekrar alır; izin reddi veya destek
yokluğu açıkça bildirilir. Hedef fiziksel tablette ekranın uyumaması ayrıca
doğrulanmalıdır; başsız tarayıcıda gerçek Wake Lock isteğinin reddi görüldü.

Mutfak en eski aktif işi önce gösterir; seçenek/not, masa/gel-al ve ileri saat
bilgisi karttadır. Kuyruk sayfalıdır. Kopma uyarısı görünür; bağlantı dönünce kalıcı
imleçle kaçan olaylar tamamlanır. Bilet 60 saniye geçerli ve tek kullanımlıdır;
soket en çok beş dakika yaşar ve yeni biletle açılır. Olaylar 30 gün saklanır,
500'lük parçalarla okunur; eski imleç tam eşitleme gerektirir. Sürüm birleştirme
ters sıralı yanıtları, sınırlı olay kimliği belleği çift uyarıları önler.

Doğrulama kanıtları ve hedef cihazda kalan denemeler [KABUL_2.7.md](KABUL_2.7.md)
belgesindedir.
