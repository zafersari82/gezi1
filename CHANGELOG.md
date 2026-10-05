# Değişiklikler

## 2.4.0 (2026-10-05)

Yönetim panelinde kişisel hesaplar, roller ve iki adımlı doğrulama; paketi yükleyen ile onaylayanın
ayrılması. Paneldeki ortak kullanıcı adı ve şifre kalktı: her yönetici kendi hesabıyla, parolası ve
telefonundaki doğrulama uygulamasının ürettiği kodla girer. Denetim kaydında, paket sürümlerinde ve
yayın geçmişinde işlemi yapan hesap adıyla görünür. Mobil uygulama, mini uygulamalar, giriş, sohbet
ve ödeme akışı değişmedi.

### Yeni

- **Panel hesapları.** Hesaplar, parolalar, ikinci adım ve oturumlar API'nin veritabanında durur
  (`admin_accounts`, `admin_sessions`, `admin_recovery_codes`). Parola scrypt ile saklanır ve
  sabit zamanda karşılaştırılır. Hesap yok, parola yanlış, hesap kapalı ya da kilitli durumlarında
  aynı hata döner. Parola ve ikinci adım denemeleri birlikte sayılır: beş hatalı denemeden sonra
  hesap 15 dakika kilitlenir. Sayaç karşılaştırmadan önce artırılır; eş zamanlı tahminler sınırı
  aşamaz.
- **İki adımlı doğrulama.** Doğrulama uygulamasıyla zamana dayalı kod (TOTP, RFC 6238; SHA-1,
  6 hane, 30 saniye) ve tek kullanımlık 10 kurtarma kodu. Bütün hesaplarda zorunludur ve ilk
  girişte kurulur; panel kurulum için QR kodu gösterir. Aynı kod ikinci kez geçmez. Kurtarma
  kodları "Hesabım" sayfasından, güncel kod girilerek yenilenir.
- **Oturumlar.** Parola doğrulanınca yalnızca ikinci adıma yarayan bir yarım oturum açılır;
  ikinci adım geçilince yeni bir belirteçle tam oturum açılır. Oturum 30 dakika kullanılmazsa ya
  da 12 saat dolunca kapanır. Oturumlar "Hesabım" sayfasında listelenir ve uzaktan kapatılır.
  Parola değişince hesabın diğer oturumları; rol değişince, hesap kapatılınca, parola ya da ikinci
  adım sıfırlanınca hesabın bütün oturumları kapanır.
- **Roller ve izinler.** Sahip (her şey), inceleyen (paket onayı ve reddi), operatör (paket
  yükleme, uygulama kayıtları, yayın, işletme onayı), destek (kullanıcı askıya alma, şikayetler),
  denetçi (yalnızca okuma). Acil kapatmayı sahip, inceleyen ve operatör yapabilir. İzin listesi ve
  rol-izin tablosu `packages/contracts` içindedir. Her yönetim ucu gerektirdiği izni bildirir;
  bildirmeyen uç kaydedilemez, API başlamaz.
- **Dört göz ilkesi.** Bir paket sürümünü yükleyen ya da incelemeye gönderen hesap o sürümü
  onaylayamaz (`package_self_review`). Kural serviste ve veritabanında (tetikleyici) uygulanır.
  Tek yöneticili kurulumda paket onaylanamaz; onay için ikinci bir hesap gerekir.
- **İlk hesap komut satırından:** `npm run admins -- create --username <ad> --name "<ad soyad>"
--role owner` (canlıda `node dist/cli/admins.js …`). Varsayılan parola yoktur: geçici parola
  rastgele üretilir, bir kez gösterilir ve ilk girişte değiştirilir. Aynı komut hesapları listeler,
  parolayı ve ikinci adımı sıfırlar. Etkin sahip hesabı yoksa API başlarken uyarır.
- **Panel:** giriş, ikinci adımın kurulumu, "Hesabım" (parola, oturumlar, kurtarma kodları) ve
  yalnızca sahibin gördüğü "Panel hesapları" (hesap açma, rol değiştirme, kapatma, parola ve ikinci
  adım sıfırlama) sayfaları. Menü ve paket sayfasındaki kararlar hesabın rolüne göre gösterilir;
  rolün göremediği bir bölümün adresi açılırsa "Bu bölüm için yetkin yok" sayfası çıkar. Kenar
  çubuğunda hesabın adı ve rolü, çıkış düğmesi vardır.
- **Kim yaptı:** denetim kaydı, paket sürümleri (yükleyen, gönderen, karar veren) ve yayın geçmişi
  işlemi yapanı adıyla döndürür. Giriş, başarısız giriş, hatalı ikinci adım kodu, ikinci adımın
  kurulumu ve sıfırlanması, parola değişikliği ve sıfırlanması, rol değişikliği, hesap açma ve
  oturum kapatma da denetim kaydına yazılır.
- **Acil kapatma ucu:** `POST /v1/admin/miniapps/:id/disable`. Kaydı yönetemeyen inceleyen de
  sorunlu bir uygulamayı kullanıcılardan hemen gizleyebilir; yeniden açmak kayıt yönetimi izni ister.
- **Örnek veri** üç yönetici açar: `sahip`, `inceleyen`, `operator` (parola `vado-gelistirme`,
  demo modunda ikinci adım kodu `000000`). Örnek paketi operatör yükler, inceleyen onaylar.

### Değişen

- **Panel girişi.** HTTP Basic girişi ve `VADO_PORTAL_USER`, `VADO_PORTAL_PASSWORD` değişkenleri
  kaldırıldı. Panel, yöneticinin oturum belirtecini `HttpOnly`, `SameSite=Strict` (canlıda
  `Secure`) bir çerezde tutar ve her çağrıda API'ye taşır; hesabın kim olduğuna ve neyi
  yapabileceğine API karar verir. Geliştirmede de panel artık şifresiz açılmaz; örnek hesaplarla
  girilir.
- **Yönetim API'si.** `/v1/admin/` uçları yönetici anahtarının yanında panel hesabının oturumunu
  (`Authorization: Bearer …`) ister; oturum yoksa `admin_session_invalid` (401), izin yoksa
  `forbidden` (403), parola değişmeden önce `admin_password_change_required` (403) döner.
  `VADO_ADMIN_API_KEY` ikinci katman olarak kalır: isteğin panel sunucusundan geldiğini kanıtlar.
- **Yanıt biçimi.** Denetim kaydındaki `actor`, yayın geçmişindeki `actor` ve paket sürümlerindeki
  `uploadedBy`, `reviewedBy` artık `{ id, name }` biçimindedir; sürümlere `submittedBy` eklendi.
  Ayrıntı: [docs/API.md](docs/API.md).
- **Şema:** `0004_admin_accounts.sql` (hesaplar, oturumlar, kurtarma kodları, son sahibin
  korunması) ve `0005_package_review_separation.sql` (`package_versions.submitted_by` ve dört göz
  tetikleyicisi). Eski şema dosyaları değişmedi.

### Düzeltilen

- Yönetim testlerinden biri denetim kaydının ilk satırına bakıyordu; aynı anda çalışan başka bir
  test dosyası kayıt düşerse aralıklı olarak başarısız oluyordu (2.4 geliştirilirken temiz kopyada
  bir kez görüldü). Test artık hedefin kendi satırını arar.

### 2.3.1'den geçiş

1. **Yedek alın.** Geri dönüş yalnızca yedekten yapılabilir (aşağıda, 6. adım).
2. **Ayarlar.** `infra/.env.production` dosyasından `VADO_PORTAL_USER` ve `VADO_PORTAL_PASSWORD`
   satırlarını silin. Bu değişkenler hâlâ tanımlıysa canlı panel nedenini söyleyerek açılmaz
   (503). Yeni zorunlu ayar yoktur; `VADO_ADMIN_API_KEY` aynen kalır.
3. **Güncelleyin.** Her zamanki komut (`docker compose … up -d --build`); `migrate` servisi
   `0004` ve `0005` dosyalarını uygular. API şema yükseltilmeden başlamaz.
4. **İlk sahibi açın.** `docker compose -f infra/docker-compose.prod.yml --env-file
infra/.env.production run --rm api node dist/cli/admins.js create --username <ad> --name "<ad
soyad>" --role owner`. Komut geçici parolayı bir kez yazar. Sahip panelde girer, ikinci adımı
   kurar, parolasını değiştirir ve diğer yöneticilerin hesaplarını "Panel hesapları" sayfasından
   açar. Paket onayı için en az iki hesap gerekir.
5. **Eski kayıtlar** olduğu gibi kalır: 2.3.1'de yapılan işlemler denetim kaydında ve paket
   sürümlerinde "Ortak panel hesabı (2.3)" adıyla görünür. 2.3.1'de incelemeye gönderilmiş ve
   karar bekleyen bir sürümün göndereni bilinmez; onaylanabilmesi için önce bir hesabın onu
   "Yeniden incelemeye gönder" düğmesiyle göndermesi, sonra başka bir hesabın onaylaması gerekir.
   Taslak kalmış sürümler her zamanki gibi gönderilir.
6. **Geri dönüş.** 2.3.1 yükseltilmiş veritabanında başlar ama incelemeye gönderme yapamaz (yeni
   tetikleyici göndereni ister). 2.3.1'e dönmek gerekirse 1. adımdaki yedeği geri yükleyin.
7. Mobil uygulama, mini uygulama paketleri ve Nginx ayarı değişmez.

## 2.3.1 (2026-10-05)

Mini uygulama yalıtımının sıkılaştırılması. Kabuk artık paketi doğrudan açmaz; VADO'nun kendi
yazdığı ince bir sarmalayıcı belgeyi açar ve paket onun içindeki korumalı çerçevede çalışır.
Böylece paketin başka bir adrese gitmesini tarayıcı motoru, istek gönderilmeden engeller. 2.3.0'da
bilinen sınır olarak yazılan iki açık (Android'de aşılabilen gezinme kilidi, web önizlemesinde
engellenemeyen gezinme) kapanır. Çalışma sırasında bulunan bir Android hatası da düzeltildi.
Veritabanı şeması değişmedi; giriş, sohbet, kişiler, Anlar ve ödeme akışı aynıdır.

### Yeni

- **Sarmalayıcı belge.** Her uygulama kaydının yayındaki sürümü için sunucu küçük bir sayfa üretir:
  içinde yalnızca paketin çerçevesi ve köprüyü aktaran kısa bir betik vardır. Sayfanın güvenlik
  politikası çerçeveye yalnızca paketin giriş belgesinin yüklenmesine izin verir; tarayıcı bu
  kısıtı paketin kendi başlattığı gezinmelere de uygular. Bağlantı, form, `location` ataması, sayfa
  yenileme etiketi, `data:`/`blob:` adresleri, `tel:` gibi şemalar ve sunucu yönlendirmesi bu
  kısıta takılır; istek gönderilmez.
- **Köprü sarmalayıcıdan geçer.** Paket kabukla doğrudan değil sarmalayıcı üzerinden konuşur.
  Sarmalayıcı yalnızca çerçevesinden gelen ilk bağlantıyı kabul eder; kabuk da yalnızca
  sarmalayıcıdan gelen iletiyi işler. Paketin köprüye sarmalayıcıyı atlayarak gönderdiği ileti
  kabul edilmez.
- **Açıldığı belgeden ayrılan mini uygulama kapatılır.** Paket başka bir adrese gitmeye çalışırsa
  ya da sayfasını yeniden yüklerse sarmalayıcı çerçeveyi kaldırır ve kabuğa bildirir (köprü
  protokolünde `left` bildirimi); kullanıcı "Mini uygulama kapatıldı" ekranını ve "Yeniden aç"
  düğmesini görür. Sayfa değişmeden yapılan gezinme (`history.pushState`, adresin `#` sonrası,
  geri tuşu) serbesttir.
- **Giriş belgesi dışındaki dosyalar belge olarak etkisizdir.** Pakette betik çalıştırabilen tek
  belge giriş belgesidir; diğer dosyalar çerçevede gösterilemez ve betik çalıştıramaz. Sayfaya
  görsel, betik ya da stil olarak yüklenmeleri etkilenmez.
- **İnceleme bulguları:** yükleme incelemesi artık WebRTC kullanımını (`RTCPeerConnection`) ve
  sayfayı yeniden yüklemeyi (`location.reload`) "incele" bulgusu olarak gösterir.
- **Yalıtım deneyi.** Paketin açıldığı belgeden çıkış yolları iki tarayıcı motorunda (Chromium 141,
  WebKit 2.52) ölçüldü; sonuçlar ve açık kalan yollar [SECURITY.md](SECURITY.md) içindedir.

### Değişen

- **Adres düzeni.** Uygulama kaydı `/apps/<kayıt>/wrapper/<özet>/` (sarmalayıcı belge) ve
  `/apps/<kayıt>/files/<özet>/<dosya>` (paketin dosyaları) adreslerinden sunulur; alt alan adı
  kipinde `https://<kayıt>.mini.ornek.com/wrapper/<özet>/` ve `…/files/<özet>/<dosya>`. 2.3.0'daki
  `/apps/<kayıt>/<özet>/<dosya>` adresi artık yoktur.
- **API:** paketle yayınlanan kayıtta `MiniApp.entryUrl` sarmalayıcı belgenin adresidir; `scope`
  sarmalayıcıyı ve paketin dosyalarını kapsar. Alan adları ve türleri değişmedi.
- **SDK:** `@vado/miniapp-sdk`, sayfa bir çerçevenin içindeyse her zaman üst penceresine bağlanır;
  WebView'in ileti nesnesini yalnızca çerçeve dışında (telefonda geliştirme adresiyle açılan
  sayfada) kullanır. Mini uygulamanın kodunda değişiklik gerekmez; **paketin 2.3.1 SDK'sıyla
  yeniden derlenip yeni bir sürüm olarak yüklenmesi gerekir** (aşağıda, geçiş).
- **Önbellek:** sarmalayıcı belge ve paketin giriş belgesi her açılışta sunucuya sorulur
  (`no-cache`); geri çekilen sürüm ve değişen güvenlik başlıkları hemen geçerli olur. Paketin diğer
  dosyaları eskisi gibi değişmez adreslerden, uzun süreli önbellekle sunulur.
- **Web önizlemesi** çerçevenin "yüklendi" olayına güvenmez: tarayıcılar bu olayı sayfa
  değişmeden yapılan geçmiş gezinmelerinde de gönderir. Geliştirme sayfasında geri tuşu ve `#`
  gezinmesi köprüyü koparmaz; sayfa yenilendiğinde köprü yeniden kurulur.
- **Kenar boşlukları:** sarmalayıcı, telefonun ekran çentiği ve ana ekran çubuğu için gereken
  boşluğu kendisi bırakır; çerçevenin içindeki sayfa bu ölçüleri (`env(safe-area-inset-*)`)
  okuyamaz.

### Düzeltilen

- **Android'de paketlenmiş mini uygulamaların köprüsü çalışmıyordu (2.3.0).** Güncel Android
  WebView, iletiyle birlikte sayfanın adresini değil iletiyi gönderen çerçevenin kaynağını
  bildirir; paket kimliksiz kaynakta çalıştığı için bu değer `null` olur ve kabuk iletiyi
  reddederdi. Hata WebView kitaplığının kaynak kodu okunurken bulundu, gerçek cihazda görülmedi.
  Yeni düzende köprüyü sarmalayıcı aktarır ve kabuk sarmalayıcının kaynağını tanır. Düzeltme de
  gerçek cihazda denenmedi.

### 2.3.0'dan geçiş

1. **Önce sunucu:** API'yi ve web önizlemesini birlikte güncelleyin. 2.3.0'ın web önizlemesi yeni
   sunucuyla mini uygulama açamaz.
2. **Telefon uygulaması:** yeni sürümü yayınlayın. 2.3.0 uygulaması Android'de paketlenmiş mini
   uygulamaların köprüsünü çalıştıramaz (yukarıdaki hata); iOS'ta çalışması beklenir ama
   denenmedi.
3. **Paketler:** mini uygulamaları 2.3.1 SDK'sıyla yeniden derleyin, yeni sürüm numarasıyla
   yükleyin, onaylayın ve yayınlayın. Eski SDK ile derlenmiş paketler web önizlemesinde ve iOS'ta
   çalışır; Android'de köprüyü kullanamaz.
4. **Geliştirme ortamı:** `npm run db:seed` örnek paketi yeni SDK ile derler ve içeriği değiştiği
   için sıradaki sürüm numarasıyla (1.0.1) yükleyip yayınlar.
5. Nginx ayarında değişiklik gerekmez; yol öneki (`/apps/`) ve alt alan adı kipi aynıdır.

### Bilinen sınırlar

Bu sürümde yapılan ölçümlerle ortaya çıkanlar; tamamı [SECURITY.md](SECURITY.md) içindedir.

- **WebRTC bağlantıları güvenlik politikasıyla sınırlanamıyor.** Kötü niyetli bir paket WebRTC ile
  bildirmediği bir sunucuya veri gönderebilir. Bu yol 2.3.0'da da açıktı; kalıcı çözüm yerel kod
  gerektirir.
- **Android'de paketin çerçevesinin gezinmesini yalnızca tarayıcı motoru engeller;** bu yol için
  kabukta ikinci, yerel bir katman yoktur. iOS'ta kilit her çerçeveyi ayrıca denetler.
- **Web önizlemesi tam Chrome'da iki yan kanal bırakır:** engellenen gezinmenin hedefine önceden
  bağlantı açılması ve `<link rel="prerender">` ipucu.
- **Gerçek telefonda denenmedi.** Ölçümler masaüstü tarayıcı motorlarında yapıldı.

## 2.3.0 (2026-10-04)

Paketli mini uygulama platformu. Mini uygulamalar artık geliştiricinin sunucusundan değil, VADO'ya
yüklenen, incelenen ve değişmez sürümler hâlinde saklanan paketlerden açılır. Canlı ortamda yalnızca
onaylı paketler çalışır. Giriş, sohbet, kişiler, Anlar ve ödeme akışı değişmedi.

### Yeni

- **Paket ve uygulama kaydı ayrıldı.** Paket, incelenen koddur ve sürümlenir. Uygulama kaydı bir
  işletmenin vitrinidir: adı, simgesi, ayarları, satıcısı ve yayınladığı paket sürümü. Aynı paketi
  çok sayıda işletme, kod yeniden incelenmeden kullanır; kullanıcı kimliği, izinler ve cihazdaki
  veri işletmeden işletmeye ayrıdır.
- **Paket biçimi:** kökünde `vado.app.json` bulunan bir zip. Bildirim dosyası kimliği, sürümü,
  istenen yetkileri, bağlanılacak adresleri ve işletmeden beklenen ayar alanlarını taşır.
- **Yükleme denetimi:** arşiv katı bir okuyucuyla açılır. Şifreli, çok parçalı, sembolik bağlantılı,
  yapısı tutarsız ya da bildirdiğinden büyük açılan arşivler; üst klasöre çıkan ve gizli dosya
  yolları; izinli olmayan dosya türleri reddedilir. Sınırlar: 5 MB arşiv (`VADO_PACKAGE_MAX_MB`),
  bunun dört katı açılmış boyut, 500 dosya. 5 MB geçicidir; kesin değer gerçek cihazlarda açılış
  süresi ölçülerek belirlenecektir.
- **Değişmez sürümler:** her sürüm SHA-256 içerik özetiyle tanınır. Dosyalar içerik adresli,
  üzerine yazılamayan ve silme işlemi olmayan bir depoda durur; her okumada özetleri doğrulanır.
  Dosya listesi, özet ve durum geçişleri veritabanında tetikleyicilerle de korunur. Değişiklik
  yalnızca yeni bir sürüm numarasıyla yüklenebilir.
- **İnceleme:** taslak → incelemede → onaylı ya da reddedildi; yükleyen vazgeçebilir, onaylı sürüm
  geri çekilebilir. Her sürüm, önceki onaylı sürüme göre dosya, yetki, adres ve ayar farkıyla ve
  otomatik bulgularla (çalışma anında engellenecek kalıplar, bildirilmemiş adresler) gösterilir.
- **Yayın:** onaylı sürümü bir uygulama kaydında işletmenin ayarlarıyla yayınlama, eski sürümdeki
  kayıtlara toplu dağıtım, son yayını o yayının ayarlarıyla geri alma, yayın geçmişi.
- **Acil kapatma:** tek bir kayıt kapatılabilir ya da onaylı bir sürüm geri çekilebilir; ikincisi o
  sürümü yayınlayan bütün kayıtları kapatır ve istenirse önceki yayınlarına döndürür. Kapanan kayıt
  listeden kalkar, açılamaz, kimlik ve ödeme alamaz, QR kodu çalışmaz, dosyaları sunulmaz.
- **İşletme ayarları:** paket, kendisini kullanan işletmelerden beklediği alanları bildirir (metin,
  sayı, evet/hayır, seçenek). Panel bu tanımdan form üretir, sunucu değerleri yayından önce
  doğrular, mini uygulama `vado.app.getContext()` ile okur.
- **Sunum ve yalıtım:** paket dosyaları `/apps/<kayıt>/<özet>/` altından, pakete özel güvenlik
  politikasıyla sunulur. Paket kimliksiz bir kaynakta çalışır (çerez ve tarayıcı deposu yok); kod
  yalnızca kendi klasöründen çalışır, ağ yalnızca bildirdiği adreslere gider; API'yi ve başka
  kayıtların dosyalarını çağıramaz. Telefondaki kabuk ayrıca her gezinmeyi denetler: paketin
  dışındaki adres açılmaz, sistem tarayıcısına da devredilmez; kilit aşılır da kapsam dışı bir sayfa
  yüklenmeye başlarsa görünüm kaldırılır. Yeni pencere, dosya erişimi ve konum kapalıdır.
- **Alt alan adı kipi:** `VADO_APPS_ORIGIN=https://{app}.mini.ornek.com` ile her uygulama kaydı
  kendi alan adından sunulur; kayıtlar birbirinden ve API'den kaynak düzeyinde de ayrılır.
- **İzinlerin yeniden istenmesi:** yeni sürüm yetkileri ya da bağlanılan adresleri değiştirirse
  kullanıcının eski izni geçersiz sayılır ve nedeni söylenerek yeniden sorulur.
- **Paketleme komutu:** `npm run miniapp:pack -- <klasör>` derleme çıktısını, sunucunun kurallarıyla
  denetleyerek, her seferinde aynı baytları veren bir zip dosyasına çevirir ve inceleyenin göreceği
  bulguları önceden gösterir.
- **Depo denetim komutu:** `npm run packages:verify` (canlıda `node dist/cli/packages.js verify`)
  veritabanındaki her sürümün dosyalarını depoda arar ve özetlerini doğrular. Yedekten dönüşten
  sonra çalıştırılır.
- **Panel:** Paketler bölümü (paket kaydı, zip ile sürüm yükleme, reddedilen paketin sorunlarının
  tek tek listelenmesi), inceleme sayfası (yetkiler, adresler, fark, bulgular, dosya içeriği,
  kararlar, toplu dağıtım, geri çekme), uygulama kaydı sayfası (yayın, ayarlar, geri alma, geçmiş,
  doğrulama, kapatma) ve genel bakışta inceleme bekleyen sürümler.
- **Örnek Randevu paketi:** örnek mini uygulama artık bir pakettir; işletmenin adını, satıcısını ve
  hizmet listesini ayarlardan alır. `npm run db:seed` paketi yükler ve iki işletmenin kaydında
  (Kadıköy Berber, Elit Güzellik Salonu) yayınlar; üçüncü bir kayıt aynı kodu geliştirme
  sunucusundan açar.
- **Belgeler:** [docs/MINI_UYGULAMA_GELISTIRME.md](docs/MINI_UYGULAMA_GELISTIRME.md) baştan yazıldı
  (paket, bildirim dosyası, ayarlar, yükleme, inceleme, yayın). Mimari, API, güvenlik, yayın ve yol
  haritası belgeleri güncellendi.

### Değişen

- **Canlı ortam kuralı:** geliştiricinin kendi sunucusundan açılan kayıtlar yalnızca geliştirme
  kipinde çalışır (`VADO_MINIAPP_DEV_MODE`). Canlı ortamda bu kip açılamaz; açıkken API başlamaz.
- **Mini uygulama kimliği (`openId`)** kullanıcı ve uygulama kaydı çiftine özgüdür. Var olan
  kayıtların kimlikleri değişmedi; aynı paketi kullanan iki kayıt aynı kullanıcıyı farklı görür.
- **API:** `MiniApp` yanıtında `allowedOrigins` yerine `scope`, ayrıca `source` ve `consentKey`
  gelir; `GET /v1/miniapps/:id` işletmenin ayarlarını da döndürür. Yönetimde mini uygulama kaydı
  gövdesi değişti (vitrin alanları; adres ve yetkiler yalnızca geliştirme kaydında), yayın, geri
  alma, ayar ve paket uç noktaları eklendi. Ayrıntı: [docs/API.md](docs/API.md).
- **Köprü:** tarayıcı önizlemesinde mini uygulama kabukla pencere iletileriyle değil, kabuğa verdiği
  bir ileti kapısı (MessagePort) üzerinden konuşur. `@vado/miniapp-sdk` kullanan mini uygulamalarda
  kod değişikliği gerekmez; telefondaki taşıma aynıdır.
- **Doğrulama hataları:** `validation_failed` yanıtındaki alan ayrıntıları Türkçe döner.
- **`npm run db:seed`** önce örnek mini uygulamayı derler.

### Düzeltilen

- **Nginx örneği** dağıtımlarla gelen Nginx sürümlerinde (1.24 ve öncesi) "unknown directive http2"
  hatasıyla açılmıyordu. Örnek, gerçek bir Nginx ile çalıştırılarak düzeltildi; panele paket
  yükleme sınırı ve isteğe bağlı alt alan adı blokları eklendi.
- **API belgesindeki komut satırı örneği** 2.2'de zorunlu olan `deviceId` alanını içermiyordu ve
  çalışmıyordu.

### 2.2'den geçiş

Adımların tamamı [docs/YAYIN.md](docs/YAYIN.md#22den-23e-geçiş) belgesindedir. Özet:

- **Yedek alın.** Şema yükseltmesi (`0003_miniapp_packages.sql`) geri alınamaz. Yükseltme komutu
  aynıdır; `migrate` yalnızca yeni şema dosyasını uygular. Yeni zorunlu ayar yoktur.
- **Adresle açılan mini uygulamalar canlı ortamda kullanıcılara kapanır.** Kayıtlar, satıcıları,
  geçmiş ödemeler ve şikayetler yerinde durur; panel hangi kayıtların kapalı olduğunu gösterir.
- **Paket aynı kayıtta yayınlanınca kayıt aynı kimlikle açılır:** kullanıcıların `openId` değeri,
  bağlı satıcılar ve basılmış QR kodları değişmez. Kullanıcıya izinler bir kez yeniden sorulur.
- **Mini uygulamanın kodunda gerekenler:** kökte `vado.app.json`, göreli adresler, tarayıcı deposu
  yerine `vado.storage`, işletmeye özel değerler için ayar alanları, bağlanılan sunucuların
  `network` listesi.
- **Mobil uygulama birlikte güncellenmelidir.** 2.2 uygulamasında 2.3 sunucusunun mini
  uygulamaları çalışmaz; kayıt, kişiler ve sohbet çalışmaya devam eder (2.2'nin tarayıcı
  önizlemesiyle denendi).
- **Yeni birim:** paket dosyaları `vado_packages` biriminde durur; yedeğinize ekleyin.
- **Nginx:** panelin sunucu bloğuna `client_max_body_size` ekleyin (örnekte 8 MB); yoksa 1 MB'tan
  büyük paketler yüklenemez.
- **Geliştirmede** `npm run db:migrate` ve `npm run db:seed` yeterlidir: örnek kayıt paketli hâle
  gelir, kullanıcılar ve sohbetler değişmez.

### Bilinen sınırlar

- Paketlerin telefondaki kabukta (Android WebView, iOS WKWebView) çalışması ve yalıtımı **gerçek
  cihazda denenmedi**; tarayıcıda uçtan uca denendi.
- Android'de gezinme kilidi kesin bir sınır değildir: WebView kitaplığı, kabuğun yanıtı çeyrek
  saniyede gelmezse gezinmeye izin verir. Kabuk kapsam dışı sayfayı fark edince görünümü kaldırır;
  kalıcı çözüm (sarmalayıcı belge) yol haritasındadır.
- Android'de kamera ve mikrofonu kabuk reddedemiyor; orada yalnızca sunucunun gönderdiği
  `Permissions-Policy` başlığı korur.
- Panelde tek hesap olduğu için paketi yükleyen kişi onu onaylayabilir.
- Tamamı ve gerekçeleri: [SECURITY.md](SECURITY.md#bilinen-sınırlar).

## 2.2.0 (2026-10-04)

Anahtar ayrımı ve anahtar değiştirme: doğrulama kodu, QR ve mini uygulama kimliği artık üç bağımsız
anahtarla korunur. Uygulamanın ekranları ve API uç noktaları değişmedi.

### Yeni

- **Bağımsız anahtar aileleri:** `VADO_OTP_KEYS`, `VADO_QR_KEYS` ve `VADO_OPENID_KEY`. Biri sızarsa
  ya da değiştirilirse diğerleri etkilenmez.
- **Anahtar değiştirme:** doğrulama kodu ve QR anahtarı sistem çalışırken değiştirilebilir. Yeni
  anahtar imzalar; eskisi belirlenen güne kadar doğrulamayı sürdürür, sonra kendiliğinden devre dışı
  kalır. Eski anahtarla okutulan QR kodları günlüğe düşer; anahtarın ne zaman kaldırılabileceği
  oradan görülür.
- **`keys` komutu** (`npm run keys`, canlıda `node dist/cli/keys.js`): anahtar üretir, eski
  sistemden geçirir, halkaya yeni anahtar ekler ve dosyadaki anahtarları denetler.
- **Belge:** [docs/ANAHTARLAR.md](docs/ANAHTARLAR.md) eski ve yeni sistemin farkını, geçişi ve
  anahtar değiştirme adımlarını anlatır.

### Değişen

- **QR kodu** imzalayan anahtarın kimliğini taşır: `vado://q/<veri>.<anahtar kimliği>.<imza>`. 2.1
  ve öncesinde üretilmiş kodlar okunmaya devam eder. Uygulama kodun içeriğini yorumlamadığı için
  mobil tarafta değişiklik yoktur.
- **Canlı ortamda başlangıç:** üç anahtar ailesi de açıkça tanımlı, en az 256 bit, rastgele
  üretilmiş ve birbirinden farklı değilse API başlamaz. `VADO_APP_SECRET` artık imzalamada
  kullanılmaz; tanımlıysa yalnızca yeni anahtarların onunla uyumu denetlenir.
- **Başlangıç günlüğü** yüklenen anahtarların kimliklerini yazar (anahtarların kendisini değil).

Değişmeyenler: mini uygulamaların gördüğü kullanıcı kimlikleri (`openId`), oturumlar (rastgele
belirteç ve veritabanındaki özeti; imza anahtarı kullanmaz), veritabanı şeması.

### 2.1'den geçiş

- **Geliştirmede** yapılacak bir şey yoktur: anahtar tanımlanmamışsa eskisi gibi geliştirme
  anahtarından türetilir; örnek veri ve kimlikler aynı kalır.
- **Canlı ortamda** `infra/.env.production` dosyasına üç yeni değişken eklenir. Bunları yeniden
  üretmeyin: `keys migrate`, eski `VADO_APP_SECRET` değerinden kimlikleri ve eski QR kodlarını
  koruyan değerleri üretir; `keys check` sonucu doğrular. Adımlar
  [docs/ANAHTARLAR.md](docs/ANAHTARLAR.md#21-ve-öncesinden-geçiş) içindedir. Geçiş yapılmadan Compose
  eksik değişkeni söyleyip durur; çalışan sürüme dokunmaz.
- Şema değişikliği yoktur; mobil uygulamanın güncellenmesi gerekmez.
- Birden çok API süreci çalışıyorsa hepsini birlikte yeniden başlatın: 2.1 süreçleri, 2.2'nin
  ürettiği QR kodlarını ve doğrulama kodu özetlerini tanımaz.

## 2.1.0 (2026-10-04)

Hesap güvenliği: cihaz tanıma ve gerektiğinde yeniden doğrulama. Kullanıcıya sürekli kod sorulmaz;
yalnızca hassas işlemlerde ve yalnızca doğrulama eskidiyse sorulur.

### Yeni

- **Cihaz tanıma:** her kurulum rastgele bir cihaz kimliği üretir; oturumlar cihaz kimliği ve IP
  adresiyle kaydedilir. Hesaba tanınmayan bir cihazdan giriş yapıldığında açık cihazlarda uyarı
  çıkar, Oturumlar ekranında cihaz "Yeni cihaz" olarak işaretlenir ve giriş denetim kaydına düşer.
- **Yeniden doğrulama:** ödeme onayı, hesap silme ve başka bir cihazın oturumunu kapatma, kimlik son
  on dakikada kanıtlanmadıysa yeniden doğrulama ister. Tanınan cihazda parmak izi, yüz ya da cihaz
  şifresi yeter; yeni cihazda ve cihaz kilidi olmayan telefonda hesabın numarasına ayrı bir onay
  kodu gider. Yeni cihazda giriş kodu bu işlemlere yetmez.
- **Uygulama kilidi** (isteğe bağlı, Gizlilik ekranından): uygulama açılırken ve yarım dakikadan uzun
  arka planda kaldıktan sonra cihazın kilidi sorulur.

### Değişen

- **Oturum süresi:** kullanılan cihazda oturum kendiliğinden uzar; `VADO_SESSION_DAYS` artık
  kullanılmayan cihazın oturumunun kaç gün sonra kapanacağını belirler.
- **Giriş isteği** (`POST /v1/auth/otp/verify`) `deviceId` alanını zorunlu tutar; yanıtta
  `deviceKey` döner. Oturum listesi `ip` ve `newDevice` alanlarını taşır.
- **SMS aracı servisi:** işlem onay kodları ayrı bir ileti metniyle gelir; gövdenin biçimi aynıdır.

### 2.0'dan geçiş

Şema değişikliği `0002_device_security.sql` dosyasındadır: canlı ortamda `migrate` servisi,
geliştirmede API kendisi uygular. 2.0 ile açılmış oturumlar çalışmaya devam eder; ilk hassas işlemde
onay kodu ister. Mobil uygulama ve API birlikte güncellenmelidir.

## 2.0.0 (2026-10-04)

1.1 paketinin üzerine ekleme yapılmadı; aynı teknolojilerle (Expo, Fastify, PostgreSQL, Next.js) ve
tek bir kod standardıyla baştan yazıldı. 1.1 hiç çalıştırılmamış bir paketti; 2.0 gerçek
PostgreSQL üzerinde testlerle ve tarayıcıda uçtan uca senaryolarla denendi.

### Yeni

- **Kişiler:** VADO kimliği, telefon numarası ya da QR ile bulma; kişi isteği gönderme, kabul etme,
  reddetme; engelleme.
- **Grup sohbeti:** grup kurma, üye ekleme ve çıkarma, ad değiştirme, ayrılma.
- **Sohbet:** okunmamış sayısı, okundu bilgisi, "yazıyor" göstergesi, fotoğraf gönderme; bağlantı
  koptuğunda mesajın çoğalmadan yeniden gönderilmesi.
- **Anlar:** kişilerin gördüğü paylaşımlar; fotoğraf, beğeni, yorum.
- **İşletme başvurusu** uygulamadan yapılır, panelden onaylanır.
- **Şikayet:** kullanıcı, mesaj, paylaşım, işletme ve mini uygulama şikayet edilebilir.
- **Hesap:** profil düzenleme, numarayla bulunmayı kapatma, hesabı ve verileri silme.
- **Yönetim paneli:** genel bakış, kullanıcılar, işletmeler, mini uygulama kaydı ve satıcı bağlama,
  şikayetler, denetim kaydı.
- **Ortak sözleşme paketi** (`@vado/contracts`): API, mobil uygulama, panel ve mini uygulama
  kitaplığı aynı şemaları, tipleri ve Türkçe hata iletilerini kullanır.
- **Testler:** sözleşmeler, API (gerçek veritabanı ve gerçek soket bağlantılarıyla), mini uygulama
  kitaplığı ve mobil uygulamanın telefondan bağımsız mantığı.
- **Kod standardı denetimi:** biçim, lint, proje kuralları, tip denetimi, testler ve derlemeler tek
  komutla (`npm run check`) ve CI'da çalışır.
- **Türkçe belgeler:** kurulum, mimari, kod standartları, API, mini uygulama geliştirme, yayın,
  mevzuat ve yol haritası.

### Değişen

- **Ana düzen** WeChat'e yakın dört sekme oldu: Sohbetler, Kişiler, Keşfet, Ben.
- **Oturum:** JWT yerine sunucuda saklanan rastgele belirteç; oturum kapatma anında etkili.
- **Veritabanı:** dört parçalı şema yerine tek temiz temel şema; örnek veri şemadan ayrıldı
  (`npm run db:seed`).
- **Mini uygulama köprüsü:** protokol sözleşme paketinde tanımlandı; istek parametreleri kabukta
  şemayla doğrulanır. `vado-sdk` paketinin yerini `@vado/miniapp-sdk` aldı.
- **Ödeme:** aynı sipariş için yinelenen istek aynı oturumu döndürür; oturumun süresi vardır.
- **Panel:** Next.js 16'ya geçti; sayfalar sunucuda çizilir, yönetici anahtarı tarayıcıya gitmez.
- **Altyapı:** Dockerfile'lar uygulamaların yanına taşındı; canlı ortamda şema değişikliği ayrı bir
  adımdır ve API bekleyen değişiklik varken başlamaz.

### Kaldırılan

- Ana sayfadaki, hepsi aynı listeye giden Yemek, Kargo ve Fatura kısayolları.
- `packages/shared` ve `packages/vado-sdk`; yerlerini `packages/contracts` ve
  `packages/miniapp-sdk` aldı.

### 1.1'den geçiş

1.1 veritabanından veri taşıyan bir betik yoktur; 2.0 boş bir veritabanıyla başlar. Ortam
değişkenleri değişti; `apps/api/.env.example` ve `infra/.env.production.example`
dosyalarına bakın.

### Bu sürümde olmayanlar

Gerçek ödeme, anlık bildirim, sesli mesaj, uygulama içi arama ve uçtan uca şifreleme yoktur.
Ayrıntılar: [docs/YOL_HARITASI.md](docs/YOL_HARITASI.md).

## 1.1.0 ve öncesi

Önceki paketin değişiklik kaydı o paketin kendi `CHANGELOG.md` dosyasındadır.
