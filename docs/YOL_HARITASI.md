# Yol haritası

Bu sürümde olmayanların ve bilinen sınırların dürüst listesi. Kodda yarım bırakılmış iş notu
(`TODO`) tutulmaz; yapılacak her şey buradadır. Sıra önerdir: üstteki bölümler bitmeden alttakilere
geçmek, kullanıcıya açılmış ama eksik bir ürün demektir.

## 1. Yayından önce bitmesi gerekenler

Bunlar olmadan uygulama gerçek kullanıcılara açılmamalıdır.

| İş                                            | Neden                                                                                                                                                                                                                                                     | Nerede                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Gerçek telefonda deneme                       | Uygulama yalnızca tarayıcı önizlemesinde denendi. Kamera, fotoğraf seçme, konum, klavye ve mini uygulama penceresi telefonda ilk kez çalışacak; düzeltme gerekebilir.                                                                                     | KURULUM.md, "Kendi telefonunuzda" |
| Mini uygulama yalıtımının telefonda sınanması | Yalıtım iki masaüstü tarayıcı motorunda (Chromium, WebKit) ölçüldü; telefondaki kabuk, köprünün taşıması ve gezinme kilidi Android WebView ve iOS WKWebView üzerinde yalnızca derlendi. Güvenlik iddiaları cihazda doğrulanmadan paket yayınlanmamalıdır. | Aşağıda, "Mini uygulamalar"       |
| İnceleme süreci                               | Paketleri kimin, hangi ölçütlerle inceleyeceği belirlenmeli. Panelde roller ve dört göz ilkesi var (2.4); inceleyen hesaplarının kime verileceği ve inceleme ölçütleri yazılı değil.                                                                      | SECURITY.md, "Bilinen sınırlar"   |
| SMS aracı servisi                             | Canlı ortamda kodlar SMS ile gitmelidir.                                                                                                                                                                                                                  | YAYIN.md, "SMS"                   |
| Hukuki metinler                               | Uygulamadaki metinler yer tutucudur.                                                                                                                                                                                                                      | TURKIYE_UYUM.md                   |
| Yaş kuralı                                    | 1 Kasım 2026'da uygulanmaya başlayan 15 yaş kuralı; uygulamada yaş doğrulama yok.                                                                                                                                                                         | TURKIYE_UYUM.md, "5651"           |
| İçerik kaldırma                               | Panelde şikayet görünür ama şikayet edilen mesaj ya da paylaşım panelden görüntülenemez ve kaldırılamaz; yalnızca hesap askıya alınabilir.                                                                                                                | Aşağıda, "Moderasyon"             |
| Mağaza incelemesi için deneme hesabı          | İnceleme ekibi SMS alamaz; sabit kodla giriş yapan bir deneme numarası gerekir.                                                                                                                                                                           | Aşağıda, "Giriş"                  |
| Görüntülü görüşme sunucusu                    | Varsayılan `meet.jit.si` yurt dışında, herkese açık bir hizmettir.                                                                                                                                                                                        | `EXPO_PUBLIC_JITSI_URL`           |
| Yedek ve izleme                               | Yedek zamanlaması, hata ve kesinti uyarıları kurulmadı.                                                                                                                                                                                                   | YAYIN.md, "Yedek"                 |

## 2. Eksik özellikler

Bir mesajlaşma uygulamasından beklenip bu sürümde olmayanlar, önerilen sırayla.

### Mesajlaşma

1. **Anlık bildirimin tamamlanması.** 2.5'te yeni mesaj ve yeni cihaz bildirimleri geldi; cihaz
   tarafı denenmedi. Eksikler: gerçek telefonda sınama (YAYIN.md, "Cihazda deneme listesi"), Expo
   teslim makbuzlarının (receipts) okunup geçersiz adreslerin onlardan da silinmesi, sohbeti sessize
   alma, okunmamış sayısının uygulama simgesinde gösterilmesi, aynı sohbetten gelen bildirimlerin
   telefonda gruplanması, 2.6'da kurulan kalıcı outbox'ın gerçek telefonda teslim/yeniden deneme sınaması.
2. **Mesaj işlemleri.** Silme, yanıtlama, iletme, sohbet içinde arama, sohbeti sessize alma ve
   sabitleme.
3. **Sesli mesaj, video ve dosya.** Medya katmanı yalnızca fotoğraf kabul eder.
4. **Uygulama içi sesli ve görüntülü arama.** Şu an sohbete bir Jitsi bağlantısı gönderilir;
   görüşme tarayıcıda açılır.
5. **Uçtan uca şifreleme.** Mesajlar aktarımda TLS ile korunur, sunucuda düz metin saklanır.
   Uçtan uca şifreleme (anahtar yönetimi, çoklu cihaz, grup anahtarları) büyük ve ayrı bir iştir;
   eklendiğinde sunucu tarafı arama ve içerik denetimi mümkün olmaz.
6. **Rehberden kişi bulma.** Uygulama telefon rehberini okumaz; kişiler numara, VADO kimliği ya da
   QR ile eklenir.

### Giriş ve hesap

- Cihaz doğrulama: Google Play Integrity ve Apple App Attest ile cihazın ve uygulamanın gerçek
  olduğunun sunucuda doğrulanması; cihaz anahtarının donanıma bağlı, parmak iziyle açılan bir
  anahtarla değiştirilmesi; root ve jailbreak denetimi.
- Şüpheli giriş tespiti: alışılmadık konum ya da IP adresinden girişte ek doğrulama; oturum
  listesinde IP yerine yaklaşık konum.
- Yeni cihaz uyarısının SMS ile de gönderilmesi (anlık bildirimle 2.5'te gönderiliyor).
- Mağaza incelemesi için deneme hesabı (yukarıda).
- Telefon numarası değiştirme.
- Hesap silmede geri alma süresi: şu an silme anında ve geri alınamaz biçimde yapılır.
- "Verilerimi indir": KVKK başvurusu için kullanıcının verilerini dışa aktarma.
- Okundu bilgisini ve "yazıyor" göstergesini kapatma.

### Ödeme

- **Lisanslı ödeme kuruluşu entegrasyonu.** `provider` kipinin içi boştur. Gereken: kuruluşta ödeme
  oturumu açan sağlayıcı (`providers/payment.ts`), kuruluşun bildirimini doğrulayan uç nokta, iade.
- **Satıcıya bildirim.** Mini uygulamanın sunucusu ödemeyi VADO'dan doğrulayamaz. Gereken: satıcı
  başına gizli anahtar ve ödeme sonucunu imzalı olarak satıcı sunucusuna ileten bildirim.
- Cüzdan, bakiye ve kullanıcılar arası para gönderme yoktur ve lisans olmadan eklenmemelidir.

### Mini uygulamalar

2.3 ile paketli, değişmez sürümler tamamlandı: yükleme, inceleme, onay, yayın, geri alma, acil
kapatma ve paket ile işletme kaydının ayrılması. 2.3.1 ile paket, VADO'nun sarmalayıcı belgesinin
içindeki çerçevede açılır; paketin başka adrese gitmesini tarayıcı motoru, istek gönderilmeden
engeller. Eksik kalanlar, önerilen sırayla:

1. **Gerçek cihazda sınama ve ölçüm.** Telefondaki kabuğun yalıtımı (yukarıda) ve paketlerin
   açılış süresi. Paket boyutu sınırı (varsayılan 5 MB) bu ölçüme göre kesinleştirilmelidir; büyük
   uygulamalar için alt paketler gerekebilir. SECURITY.md'deki deney aynı yollarla cihazda
   yinelenmelidir; özellikle Android WebView'in engellenen gezinmede bağlantı açıp açmadığı ve
   sarmalayıcının bıraktığı kenar boşlukları.
2. **WebRTC'nin kapatılması ve Android'de ikinci gezinme katmanı.** İki açık yol kaldı (bkz.
   SECURITY.md, bilinen sınırlar): tarayıcılar WebRTC bağlantılarını güvenlik politikasına
   bağlamıyor; Android'de de paketin çerçevesinin gezinmesini yalnızca tarayıcı motoru engelliyor.
   Çözüm yerel koddur: Android'de WebView'in isteklerini kabuğun adres listesinden geçiren bir
   süzgeç (`shouldInterceptRequest`) ve iki platformda, her çerçevede belge başlarken çalışan
   yerel bir betikle WebRTC'nin kaldırılması (Android'de `addDocumentStartJavaScript`, iOS'ta
   bütün çerçevelere eklenen kullanıcı betiği). Kullanılan WebView kitaplığı Android'de bunların
   ikisini de sunmuyor; ikisi de gerçek cihazda doğrulanmalıdır.
   Sayfanın içinden kapatmak denendi ve yeterli bulunmadı: paketin giriş belgesinin başına
   eklenen bir koruma betiği WebRTC'nin doğrudan kullanımını kaldırıyor ama paket, içeriğini
   kendisinin yazdığı bir alt çerçevede taze bir ortam açarak bunu aşabiliyor; gezinmeyi betikle
   ikinci kez engellemek de mümkün olmadı, çünkü tarayıcının Navigation API'si kimliksiz kaynakta
   çalışan belgede olay göndermiyor.
3. **Android'de kamera ve mikrofonun kabukta reddedilmesi.** Kullanılan WebView kitaplığı Android'de
   bu isteği reddetmeye izin vermiyor; bugün yalnızca sunucunun gönderdiği `Permissions-Policy`
   başlığı korur. Gereken: kitaplığa yama ya da izin isteğini reddeden küçük bir yerel modül.
4. **Kimlik belirteci, parametreli QR ve işletme girişi** 2.5'te geldi. Kalanlar: belirteci geri
   çağırma listesi (bugün sızan belirteç beş dakika geçerlidir); kendi kayıtlarının istatistiklerini
   (açılış, ödeme) görmesi ve satıcı bilgisini kendisinin güncellemesi; bir kayda tek işletme
   bağlanabilmesi kuralı (bugün birden çok işletmenin satıcısı bağlıysa her biri kaydı görür);
   işletme hesabının panel yerine mobil uygulamadan da girebilmesi.
5. **Paket boyutu ve QR parametreleri için gerçek kullanım ölçümü.** Beş parametre ve 64 karakter
   sınırı masa/şube için seçildi; işletmelerden gelen ihtiyaca göre gözden geçirilmeli.
6. **Mini uygulamadan bildirim.** Kullanıcının izniyle, randevu hatırlatması gibi şablonlu
   bildirimler. 2.5'teki anlık bildirim altyapısının üzerine kurulur; mini uygulamanın sunucusu
   kullanıcıyı kimlik belirteciyle tanıdığı için hedef `openId` olabilir.
7. **Geliştiricinin kendi kaydını yönetmesi.** İşletme hesabının kapsam modeli (2.5) geliştirici
   hesaplarına da genişletilebilir (aşağıda, 9).
8. **İncelemede önizleme.** İnceleyen sürümün dosyalarını, bulgularını ve farkını okur ama sürümü
   yayınlamadan çalışırken göremez. Gereken: incelemedeki sürümü yalnızca inceleyenin açabildiği
   bir deneme kaydı.
9. **Geliştirici hesapları ve imza.** Paketi kimin yüklediği panel hesabıyla belirlenir; yükleyen ile
   onaylayan 2.4'ten beri ayrıdır. Gereken: geliştiricinin yalnızca kendi paketini yükleyebildiği
   hesaplar (2.4'teki rol modeline bir kapsamla eklenir) ve paketin geliştirici anahtarıyla
   imzalanması.
10. `@vado/miniapp-sdk` paketinin ve paketleme komutunun npm'de yayınlanması; şimdilik yalnızca bu
    depodaki mini uygulamalar kullanabilir.
11. Hazır motorlar (rezervasyon, sipariş) ve kod yazmadan mini uygulama kuran bir araç: işletmelerin
    çoğu için ayrı paket yazmak yerine hazır bir paketi ayarlarla kullanmak.
12. Mini uygulamanın VADO içinden paylaşılması (sohbete kart olarak gönderme) ve "son kullanılanlar".

### Moderasyon ve yönetim

- Şikayet edilen mesajı ve paylaşımı panelde gösterme, kaldırma; kaldırma kararının denetim kaydı.
- Panel hesapları için donanım anahtarı (WebAuthn, passkey) ile giriş; TOTP'ye ek ya da onun
  yerine.
- İkinci adım sırrının (TOTP) veritabanında şifreli saklanması: bugün açık durur (bkz. SECURITY.md).
  Gereken: ayrı bir anahtar ailesi (`docs/ANAHTARLAR.md` deseninde) ve anahtar değişiminde sırların
  yeniden şifrelenmesi.
- Panel girişinde kilitlenmenin kötüye kullanımı: hesap adını bilen biri hesabı kilitli tutabilir.
  Seçenekler: IP'ye göre artan bekleme, CAPTCHA, kilitli hesabın sahibine bildirim.
- Sahibin başka hesapların açık oturumlarını görüp kapatabilmesi (bugün rol değişikliği ya da
  hesabı kapatma bütün oturumları kapatır; tek oturum kapatılamaz).
- Paket sürümünde onaylayan ile geri çeken ayrı alanlarda tutulmalı: bugün geri çekme "son karar
  veren" alanını değiştirir, onaylayan yalnızca denetim kaydında kalır.
- Panel listelerinde sayfalama: kullanıcı, işletme ve şikayet listeleri en yeni 200 kaydı gösterir.
- Saklama süresi dolan kayıtları (ödeme, şikayet, denetim kaydı, silinmiş hesapların mesajları) silen
  zamanlanmış görev.
- Trafik kayıtlarının yasal biçimde saklanması (bkz. TURKIYE_UYUM.md).

### Uygulama

- Karanlık tema. Renkler tek dosyada (`theme/tokens.ts`) durduğu için altyapı hazırdır.
- İkinci dil. Arayüz metinleri ekranların içinde Türkçe yazılıdır; çeviri için önce metinlerin bir
  sözlüğe taşınması gerekir.
- Çevrimdışı okuma: mesajlar cihazda saklanmaz, her açılışta sunucudan okunur.
- Tablet düzeni.

## 3. Bilinen teknik sınırlar

| Sınır                                                   | Etkisi                                                                                                          | Çözüm yönü                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Fotoğraflar yerel diske yazılır                         | API birden çok sunucuya dağıtılamaz                                                                             | `StorageProvider` arayüzünü uygulayan S3 sağlayıcısı                  |
| Fotoğraf adresleri oturum istemez                       | Adresi bilen herkes fotoğrafı açabilir (ad rastgeledir, tahmin edilemez)                                        | Süreli, imzalı adresler                                               |
| Fotoğraflar küçültülmez                                 | Listelerde tam boy görsel indirilir                                                                             | Yüklemede küçük sürüm üretmek                                         |
| İstek sınırı IP adresine göredir                        | Aynı IP'yi paylaşan kullanıcılar birbirini etkiler                                                              | Oturuma göre sınır                                                    |
| Web sürümünde oturum belirteci tarayıcı deposunda durur | Sayfaya sızan bir betik belirteci okuyabilir                                                                    | Web sürümünü yalnızca önizleme için kullanmak                         |
| Gerçek zamanlı olaylar yeniden gönderilmez              | Kopukluk sırasında kaçan olay, yeniden bağlanınca yapılan tazelemeyle telafi edilir                             | Yeterli; izlenmeli                                                    |
| Kullanıcı araması yalnızca tam eşleşme                  | Ada göre arama yok (bilinçli: dizin taranamaz)                                                                  | İstenirse yalnızca kişiler içinde ada göre arama                      |
| Grup en çok 100 üye                                     | —                                                                                                               | Büyük gruplar için okundu bilgisi sadeleştirilmeli                    |
| Ödemede sipariş numarası tek kullanımlık                | İptal edilen deneme için yeni numara gerekir                                                                    | Bilinçli; belgelendi                                                  |
| Yük testi yapılmadı                                     | Kaç kullanıcıyı taşıdığı bilinmiyor                                                                             | Mesaj gönderme ve sohbet listesi için yük testi                       |
| Mini uygulama kimliği anahtardan hesaplanır             | Anahtar değişirse tüm kimlikler değişir; sızıntıda otomatik geçiş yoktur                                        | Verilen kimlikleri veritabanında saklamak                             |
| Kimlik anahtarının değiştiği yalnızca geçişte yakalanır | Sonradan yanlışlıkla değişirse kimlikler sessizce değişir                                                       | Anahtarın denetim değerini veritabanında tutmak                       |
| Anahtarlar ortam değişkeninde durur                     | Sunucuya ya da `.env` dosyasına erişen anahtarları okur                                                         | Gizli değer kasası (KMS, Vault)                                       |
| Paket dosyaları yerel diske yazılır                     | API birden çok sunucuya dağıtılamaz                                                                             | `PackageStore` arayüzünü uygulayan S3 sağlayıcısı                     |
| Paket deposunda silme yoktur                            | Reddedilen ve vazgeçilen sürümlerin dosyaları da yer kaplar                                                     | Hiçbir sürümün göstermediği dosyalar için temizlik                    |
| Paket dosyaları uzun süre önbelleklenir                 | Geri çekilen sürümün betik ve görselleri cihazda ya da CDN'de kalabilir; belgeler her açılışta sunucuya sorulur | Geri çekmede önbellek temizliği; izlenmeli                            |
| Açık mini uygulama kapatmayı hemen görmez               | Kayıt kapatıldığında açık ekran, kullanıcı çıkana kadar kalır; kimlik ve ödeme alamaz                           | Kapatmada kabuğa gerçek zamanlı olay göndermek                        |
| Otomatik paket incelemesi kalıp eşleştirir              | Karartılmış kodu yakalamaz; güvence çalışma anındaki sınırlardır                                                | İncelemede önizleme; ileride davranış izleme                          |
| Paket boyutu sınırı ölçüme dayanmıyor                   | 5 MB geçici bir değerdir                                                                                        | Gerçek cihazlarda açılış süresi ölçümü                                |
| WebRTC güvenlik politikasıyla sınırlanamıyor            | Kötü niyetli paket, bildirmediği bir sunucuya veri gönderebilir; inceleme yalnızca işaretler                    | WebView'de WebRTC'yi kapatan yerel kod (yukarıda, "Mini uygulamalar") |
| Android'de çerçevenin gezinmesi tek katmanla engellenir | Sarmalayıcının çerçeve kısıtı aşılırsa kabuk bu gezinmeyi göremez                                               | Android'de yerel istek süzgeci                                        |
| Web önizlemesi tam Chrome'da iki yan kanal bırakır      | Engellenen gezinmenin hedefine önceden bağlantı açılır; `prerender` ipucu istek gönderir                        | Önizlemeyi yalnızca geliştirme ve tanıtım için kullanmak              |
| Mini uygulama sayfasını yenileyemez                     | `location.reload()` çağıran ya da çok sayfalı paketler kapatılır                                                | Bilinçli; köprüye "yeniden başlat" işlevi eklenebilir                 |
| Geliştirme kaydı sarmalanmaz                            | Geliştirme sayfası telefonda çerçevesiz, paket çerçeve içinde çalışır; davranış farkı olabilir                  | Geliştirme kaydını da sarmalayıcıyla açmak                            |

## 4. Geliştirme altyapısı

- **Tarayıcı senaryoları depoda değil.** 2.4'te panel girişi değiştiği için senaryolar ve geçiş
  denemesi yeniden yazıldı; bunlar da depoda değildir. Kayıt, mesajlaşma, Anlar, paketli mini uygulamalar, ödeme,
  panel ve Nginx arkasındaki canlı ortam düzeni geliştirme sırasında tarayıcıda (Playwright ile)
  uçtan uca çalıştırıldı; 2.2'den geçiş, yedekten dönüş ve dayanıklılık denemeleri de betiklerle
  yapıldı. Bu betikler depoya alınmadı. Depoya eklenip CI'da çalıştırılması, sonraki değişikliklerde
  aynı güvenceyi verir.
- **Mobil ekran testleri yok.** Yalnızca telefondan bağımsız mantık sınanır.
- **Docker.** İmajlar resmî taban imajla ve Compose dosyasının tamamı gerçek bir sunucuda
  denenmelidir (bkz. YAYIN.md, son bölüm).
- **Bağımlılık güncellemeleri.** Otomatik güncelleme aracı (Dependabot, Renovate) kurulmadı.
- **Hata izleme.** Uygulama ve API hataları merkezi bir yere raporlanmıyor.

## Platform sürümlerinde sıra

2.2'de anahtar ayrımı ve anahtar değiştirme, 2.3'te paketli mini uygulama platformu, 2.3.1'de
paketin sarmalayıcı belgeyle yalıtılması, 2.4'te panel hesapları, roller, iki adımlı doğrulama ve
yükleyen ile onaylayanın ayrılması, 2.5'te kimlik belirteci, parametreli QR, işletme hesabı ve
anlık bildirim tamamlandı. Her sürüm işe başlamadan önce tek sayfalık plan ve onay ister; mimari kurallar
[PLATFORM_MIMARISI.md](PLATFORM_MIMARISI.md) içindedir. Sıradakiler:

| Sürüm | Konu                                                                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.5   | Kimlik belirteci, parametreli QR, anlık bildirim, işletme girişi (tamamlandı)                                                                                                 |
| 2.6   | Platform temeli (müşteri kimliği, şube, katalog ve fiyat, olay altyapısı, işletme yalıtımı), Sipariş motoru çekirdeği, yetenek paketi altyapısı, VADO Business temeli         |
| 2.7   | Restoran: masadan QR sipariş, gel-al, ileri saate sipariş, mutfak operasyonu                                                                                                  |
| 2.8   | Restoran: eve teslim, kurye, kampanya, sadakat, değerlendirme, tekrar sipariş; pilot işletme ve "Restoran PRO"                                                                |
| 2.9   | Rezervasyon motoru; güzellik, berber ve özel ders ile doğrulama                                                                                                               |
| 3.x   | VADO Studio (kod yazmadan kurma) ve diğer sektör deneyimleri; gerçek ödeme (lisanslı kuruluş), cihaz doğrulama (Play Integrity, App Attest), WebView için yerel güvenlik kodu |

2.6 ve 2.7'deki motorlar 2.5'in parçalarına dayanır: rezervasyon ve siparişte masa/şube parametreli
QR'dan, kullanıcı kimlik belirtecinden, işletme ayarları işletme hesabından, hatırlatmalar anlık
bildirimden gelir (bkz. [MIMARI.md](MIMARI.md)).

## Önerilen sıra

1. Telefonda deneme ve çıkan sorunların düzeltilmesi
2. Sunucu kurulumu ve SMS
3. Hukuk: metinler, şirket, BTK ve yaş kuralı değerlendirmesi
4. İçerik kaldırma araçları ve mağaza için deneme hesabı
5. Anlık bildirimin gerçek telefonda sınanması
6. Mağaza başvurusu ve kapalı deneme (küçük bir kullanıcı grubuyla)
7. Mesaj işlemleri, sesli mesaj
8. Lisanslı ödeme kuruluşu entegrasyonu ve satıcı bildirimi
9. SDK'nın yayınlanması ve geliştirici hesapları
10. Uygulama içi arama, uçtan uca şifreleme

## 2.6 uygulama ilerlemesi

İlk aşamada 0008 platform veri modeli, üç veritabanı rolü, RLS/FORCE, üyelik, şube ve kabuk
müşteri bağlamı uygulanıyor. Sonraki teslimler sırayla katalog, olaylar, sepet/sipariş,
yetenek paketleri ve VADO Business'tır. Müşteri sipariş ekranı ile gerçek mutfak ve sesli
uyarı 2.7 kapsamındadır.

İkinci aşama: ortak katalog, seçenek grupları, şube fiyatı, kuruş ve KDV hesabı eklendi.
Müşteriye yeni ekran eklenmedi; kabuk için API sözleşmesi hazırlandı. Sıradaki aşama olay modeli
ve 2.5 bildirimlerinin işlemsel outbox yoluna taşınmasıdır.

## 2.6 üçüncü ara sürüm durumu

Veri/yalıtım, katalog ve kalıcı olaylar tamamlandı. Sunucuda sepet/sipariş, yetenek
manifesti ve VADO Business sonraki aşamalardır. Gerçek süreç ölümü ve yerel HTTP
dış teslimi sınandı. Expo cihaz teslimi ve işletim sisteminin arka plan birleştirmesi
gerçek telefonda henüz denenmedi; foreground kayıt sınırı yedi gün / son 2048 olaydır.

## 2.6 dördüncü ara sürüm durumu

Sunucuda sepet/sipariş, kabuk/SDK köprüsü, değişmez fiyat görüntüsü, çekirdek
durum geçişi ve SQL korumaları tamamlandı. Yeni müşteri ekranı eklenmedi.
Yetenek manifesti, `ordering.preparation` deneme paketi ve VADO Business sıradadır.

## 2.6 beşinci ara sürüm durumu

Bildirimsel manifest, bağımlılık/sürüm/ayar doğrulaması, akış derleyicisi,
Studio sözleşmesi ve hazırlık deneme paketi tamamlandı. Business blokları
veri olarak yayımlanır; VADO Business arayüzü son aşamadır. Bu paket gerçek
mutfak ürünü değildir; mutfak ekranı, ses, ortak cihaz ve müşteri sipariş
ekranı 2.7 kapsamındadır.

## 2.6 kaynak teslimi

Altı uygulama adımı tamamlandı: işletme kapsamı, katalog, kalıcı outbox ve tekrar
koruması, sepet ve sipariş, kayıtlı yetenekler, VADO Business. `ordering.preparation`
bir doğrulama paketidir. Müşteri sipariş ekranı, gerçek mutfak ve sesli operasyon
2.7 kapsamındadır. Kabul kanıtları ve Docker çalıştırma sınırı
[KABUL_2.6.md](KABUL_2.6.md) belgesinde bulunur.

## 2.7 teslim durumu

Restoranın içi: VADO'nun müşteri paketi, masa QR'ı ve çağrı/hesap, gel-al/ileri saat,
kabul/ret/ETA, tablet mutfak, ses/Wake Lock yönetimi, ortak cihaz ve dar yetki,
fiziksel tahsilat, kalıcı canlı replay uygulanmıştır. Üç ekran boyutu, zayıf ağ,
bozma ve gerçek 2.6 geçiş/geri dönüş kanıtları [KABUL_2.7.md](KABUL_2.7.md)
belgesindedir. Docker çalıştırması Claude'a, fiziksel tablet sesi/uyku ve native
telefon denemesi hedef cihaza bırakılmıştır. Eve teslim, kurye, promosyon/sadakat,
değerlendirme/tekrar sipariş ve iki haftalık pilot 2.8 kapsamındadır.
