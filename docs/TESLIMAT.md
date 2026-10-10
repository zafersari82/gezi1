# Teslimat ve kendi kurye

`ordering.delivery@1.0.0`, `ordering.preparation@1.0.0` veya `ordering.kitchen@1.0.0`
ister. Hazır → yola çıktı → tamamlandı akışı yalnız eve teslim siparişindedir;
aynı uygulama kaydındaki gel-al ve masa siparişleri eski akışlarını korur.
Konum servisi yalnız mahalle ve hizmet alanını bilir. Ücret, asgari ürün tutarı ve
süre teslimat paketindedir. Teslimat ücreti asgari tutara dahil değildir.

Müşteri `POST /v1/shell/:businessId/:appInstanceId/delivery-quote` ile
`branchId`, kendi `addressId` ve isteğe bağlı `scheduledAt` gönderir. Teklif
adres ve bölge görüntüsü, ücret, asgari tutar ve teslim süresi taşır. Sepet
`fulfilment: delivery` ve `addressId` ile açılır. Sepet yanıtı adres ve telefon
saklamaz. Checkout şube saatlerini, adresi, bölgeyi, ücreti ve sepet görüntüsünü
aynı işlemde yeniden doğrular; değişim `cart_changed` ile yeniden onay ister.
`GET .../orders/:id/delivery-snapshot` yalnız sipariş sahibine değişmez teslimat
görüntüsünü verir. Adres sonradan düzenlense de eski sipariş görüntüsü değişmez.

Sahip/yönetici `PUT /v1/business/:businessId/branches/:branchId/delivery-regions/:id`
ucuna `expectedVersion`, `feeMinor`, `minimumMinor`, `deliveryMinutes`, `active`
gönderir. `id`, Konum hizmet alanının kimliğidir. Tutarlar kuruştur. İsteklerin
`idempotency-key` başlığı zorunludur; aynı anahtarla farklı içerik reddedilir.

## Kurye sağlayıcısı

Kurye, Sipariş çekirdeğinin aktörü değil ayrı `DeliveryProvider` uygulamasıdır.
Bu sürüm yalnız `own-courier` sağlayıcısını açar. Dış kurye ağı ve canlı GPS,
arka plan konum izni yoktur. Canlı teslimat, durum adımlarının soketle iletilmesidir.

Sahip/yönetici `GET/POST /v1/business/:businessId/couriers` ile VADO kullanıcı
hesabına kurye üyeliği verir veya kapatır. Yazma gövdesi `userId`,
`expectedVersion`, `active` içerir; ilk sürüm sıfırdır. Atama
`PUT /v1/business/:businessId/orders/:id/delivery-assignment` ucundadır:
`memberId`, `expectedVersion`, `expectedOrderVersion`. Aynı kurye aynı işletmede
iki aktif işi aynı anda alamaz. Yeniden atama eski kuryenin erişimini keser.

Kurye uçları `/v1/courier/:businessId` altındadır:

- `GET /jobs`: yalnız atanmış aktif işlerin kişisel veri içermeyen listesi.
- `GET /jobs/:id`: yalnız etkin atama boyunca alıcının adres/telefon bilgisi.
- `POST /jobs/:id/depart` ve `/deliver`: iş ve sipariş beklenen sürümleriyle geçiş.
- `POST /jobs/:id/payment`: iş sürümü, `expectedPaymentVersion`, `cash/card`,
  tahsilat referansı; fiziksel nakit/POS kaydıdır, online tahsilat değildir.
- `POST /socket-ticket`: kişisel oturumdan 60 saniyelik tek kullanımlık bilet.
- `GET /live-events?cursor=...`: kaçan kişisel veri içermeyen olayların tamamlanması.

Ücretli sipariş ödeme kaydı olmadan teslim edilemez. Sıfır toplamda sahte ödeme
kaydı oluşturulmaz. Teslimden sonra adres/telefon okunamaz; kaybolan başarılı
`deliver` yanıtı aynı anahtarla yalnız kişisel veri içermeyen kayıt olarak
tekrarlanabilir. İptal/ret, atama değişimi, üyelik kapatma veya işletme sahibinin
askıya alınması eski kapsamı ve olay tekrarını da kapatır. SQL/RLS, kurye için
ham sipariş, müşteri iç kimliği, telefon, olay ve tekrar kayıtlarını gizler;
dar ve sabit arama yoluna sahip sağlayıcı işlevleri güncel yetkiyi doğrular.

## İşlem kancaları ve geçiş

`OrderingLifecycle` tüketicileri `reserve`, `complete`, `cancel`, `refund`
aşamalarını aynı veritabanı işlemi içinde alır. Tüketici hatası sipariş,
atama, mali kayıt ve olayları birlikte geri alır. Kancalar sektör ve HTTP türü taşımaz.

0019 teslimat görüntüsünü ve biçime bağlı akışı, 0020 sağlayıcı üyelik/atama,
RLS, tek kullanımlık soket ve yeniden oynatma korumalarını ekler. Yayımlanmış
0001–0018 dosyaları değişmez. Üç bağlantı ve `vado_app`, `vado_platform`,
`vado_owner` rol ayrımı korunur. Yedek alın, owner bağlantısıyla geçişleri
uygulayın ve adres kataloğunu aktarın. Geri dönüş eski sürümle açılacak ayrı
veritabanına yükseltme öncesi yedekten yapılır.

Bu ara sürümde API/SQL/SDK/kabuk yetenekleri vardır; tam müşteri ve Business
bölge/kurye ekranları beşinci ara sürümde tamamlanacaktır. Ürün pilotu veya
Restoran PRO kabulü tamamlanmış sayılmaz.
