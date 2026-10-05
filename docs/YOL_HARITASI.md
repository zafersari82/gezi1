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
| İnceleme süreci                               | Paketleri kimin, hangi ölçütlerle inceleyeceği belirlenmeli. Panelde tek hesap olduğu için yükleyen kişi onaylayabilir.                                                                                                                                   | SECURITY.md, "Bilinen sınırlar"   |
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

1. **Anlık bildirim (push).** Uygulama kapalıyken yeni mesaj haber verilmez. Gereken: cihaz
   belirteçlerini saklayan tablo, `expo-notifications`, mesaj geldiğinde çevrimdışı üyelere bildirim
   gönderen bir sağlayıcı (`providers/push.ts`), bildirim ayarları ekranı.
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
- Yeni cihaz uyarısının anlık bildirimle (push) ve SMS ile de gönderilmesi.
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
4. **Kimlik belirteci.** Mini uygulamanın kendi sunucusu kullanıcıyı VADO'dan doğrulayamaz; `openId`
   yalnızca köprüden gelir. Gereken: VADO'nun imzaladığı, kısa ömürlü ve uygulama kaydına bağlı bir
   belirteç ile mini uygulama sunucusunun onu doğrulayacağı açık anahtar.
5. **Parametreli QR.** QR kodu yalnızca bir uygulama kaydını gösterir; masa ya da şube numarası
   taşıyamaz. `app.getContext()` yanıtındaki `params` alanı bunun için ayrıldı ve şimdilik boştur.
6. **Mini uygulamadan bildirim.** Kullanıcının izniyle, randevu hatırlatması gibi şablonlu
   bildirimler. Anlık bildirim (push) altyapısına bağlıdır.
7. **İşletme girişi.** İşletme sahibinin kendi kaydının ayarlarını ve satıcısını panelden kendisinin
   yönetmesi; şimdilik her şeyi VADO yöneticisi girer.
8. **İncelemede önizleme.** İnceleyen sürümün dosyalarını, bulgularını ve farkını okur ama sürümü
   yayınlamadan çalışırken göremez. Gereken: incelemedeki sürümü yalnızca inceleyenin açabildiği
   bir deneme kaydı.
9. **Geliştirici hesapları ve imza.** Paketi kimin yüklediği panele erişimle belirlenir. Gereken:
   geliştiricinin kendi paketini yükleyebildiği hesaplar, yükleyen ile onaylayanın ayrılması ve
   paketin geliştirici anahtarıyla imzalanması.
10. `@vado/miniapp-sdk` paketinin ve paketleme komutunun npm'de yayınlanması; şimdilik yalnızca bu
    depodaki mini uygulamalar kullanabilir.
11. Hazır motorlar (rezervasyon, sipariş) ve kod yazmadan mini uygulama kuran bir araç: işletmelerin
    çoğu için ayrı paket yazmak yerine hazır bir paketi ayarlarla kullanmak.
12. Mini uygulamanın VADO içinden paylaşılması (sohbete kart olarak gönderme) ve "son kullanılanlar".

### Moderasyon ve yönetim

- Şikayet edilen mesajı ve paylaşımı panelde gösterme, kaldırma; kaldırma kararının denetim kaydı.
- Panelde yönetici hesapları, roller ve iki adımlı doğrulama. Şu an tek kullanıcı adı ve şifre
  vardır; denetim kaydında, paket yüklemelerinde ve inceleme kararlarında işlemi yapan kişi ayırt
  edilemez (`admin` yazar). Bu alanlar hesaplar geldiğinde doldurulacak biçimde hazırdır.
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

- **Tarayıcı senaryoları depoda değil.** Kayıt, mesajlaşma, Anlar, paketli mini uygulamalar, ödeme,
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
paketin sarmalayıcı belgeyle yalıtılması tamamlandı. Sıradakiler:

| Sürüm | Konu                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.4   | Panelde yönetici hesapları, roller ve iki adımlı doğrulama; yükleyen ile onaylayanın ayrılması                                                                           |
| 2.5   | Kimlik belirteci, parametreli QR, anlık bildirim, işletme girişi                                                                                                         |
| 2.6   | Rezervasyon motoru                                                                                                                                                       |
| 2.7   | Sipariş motoru                                                                                                                                                           |
| 2.8   | Kod yazmadan mini uygulama kurma aracı                                                                                                                                   |
| 3.0   | Gerçek ödeme (lisanslı kuruluş), gerçek cihazda cihaz doğrulama (Play Integrity, App Attest) ve WebView için yerel güvenlik kodu (istek süzgeci, WebRTC'nin kapatılması) |

2.3'ün mimarisi 2.4 ve 2.5'i kırmadan alacak biçimde kuruldu: kararları ve yüklemeleri yapanın
kimliği için sütunlar, bağlantı parametreleri için köprüde alan ve depo için değiştirilebilir bir
arayüz hazırdır (bkz. [MIMARI.md](MIMARI.md), "Sonraki sürümlere açık yerler").

## Önerilen sıra

1. Telefonda deneme ve çıkan sorunların düzeltilmesi
2. Sunucu kurulumu ve SMS
3. Hukuk: metinler, şirket, BTK ve yaş kuralı değerlendirmesi
4. İçerik kaldırma araçları ve mağaza için deneme hesabı
5. Anlık bildirim
6. Mağaza başvurusu ve kapalı deneme (küçük bir kullanıcı grubuyla)
7. Mesaj işlemleri, sesli mesaj
8. Lisanslı ödeme kuruluşu entegrasyonu ve satıcı bildirimi
9. Mini uygulamalar için kimlik belirteci ve parametreli QR; SDK'nın yayınlanması ve geliştirici
   hesapları
10. Uygulama içi arama, uçtan uca şifreleme
