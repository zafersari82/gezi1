# VADO

> **S2 geliştirme adayı:** Claude A1 ve S1 Business Channels üzerine VADO Business Chat eklendi. Müşteri işletmeye mesaj gönderir; işletme sahibi/yönetici telefon uyumlu gelen kutusundan yanıtlar. Son kabul için tam npm/PostgreSQL testleri gereklidir. [S2 kapsamı ve testler](docs/BUSINESS_CHAT_S2.md).

Türkiye için mesajlaşma, mini uygulama ve ödeme platformu. Telefon numarasıyla giriş, kişiler,
birebir ve grup sohbetleri, Anlar, QR ile ekleme, uygulama içinde açılan mini uygulamalar, ödeme
onayı ve işletme hesapları tek bir uygulamada toplanır.

Kod 2.0'da tek bir standartla baştan yazıldı; sonraki sürümler (bu kaynak 2.8.0-alpha.7) yama olarak değil, o
temelin üzerine aynı standartla eklenir. Standart yalnızca belgede durmaz; biçim, lint, proje
kuralları, tip denetimi ve testler `npm run check` komutuyla makine tarafından denetlenir.

2.3'ün getirdiği: mini uygulamalar artık geliştiricinin sunucusundan değil, VADO'ya yüklenen,
incelenen ve değişmez sürümler hâlinde saklanan **paketlerden** açılır. 2.3.1 ile paket, VADO'nun
kendi sarmalayıcı sayfasının içindeki korumalı çerçevede çalışır: başka bir adrese gitmesini
tarayıcı motoru, istek gönderilmeden engeller. 2.4 ile yönetim panelinde ortak şifre kalktı: her
yönetici kendi hesabıyla ve iki adımlı doğrulamayla girer, rolüne göre yetkilidir; paketi yükleyen
onu onaylayamaz (bkz. [Değişiklikler](CHANGELOG.md)).

| ![Karşılama](docs/gorseller/karsilama.png) | ![Sohbetler](docs/gorseller/sohbetler.png) | ![Sohbet](docs/gorseller/sohbet.png) | ![Mini uygulama](docs/gorseller/mini-uygulama.png) |
| :----------------------------------------: | :----------------------------------------: | :----------------------------------: | :------------------------------------------------: |
|                 Karşılama                  |                 Sohbetler                  |            Birebir sohbet            |               Mini uygulama ve ödeme               |

| ![Paket incelemesi](docs/gorseller/paket-inceleme.png) | ![Uygulama kaydı](docs/gorseller/uygulama-kaydi.png) |
| :----------------------------------------------------: | :--------------------------------------------------: |
|       Panel: paket sürümünün incelemesi ve farkı       |      Panel: işletmenin kaydı, yayın ve ayarları      |

## İçindekiler

| Klasör                 | Ne olduğu                                                                       |
| ---------------------- | ------------------------------------------------------------------------------- |
| `apps/mobile`          | Android ve iOS uygulaması (Expo, React Native). Tarayıcıda da önizlenebilir.    |
| `apps/api`             | Sunucu: REST uç noktaları ve gerçek zamanlı bildirimler (Fastify, Socket.IO)    |
| `apps/business`        | VADO Business: VADO hesabıyla canlı sipariş, ürün, şube ve yetenek ayarları     |
| `apps/portal`          | VADO Control: paket incelemesi, uygulama kayıtları, işletme, şikayet, kullanıcı |
| `packages/contracts`   | API, mobil uygulama ve panelin paylaştığı tipler, şemalar ve hata iletileri     |
| `packages/miniapp-sdk` | Mini uygulamaların VADO ile konuşmasını sağlayan küçük kitaplık                 |
| `miniapps/appointment` | Örnek mini uygulama: randevu ve ödeme; paket olarak yüklenir                    |
| `infra`                | Docker Compose dosyaları ve Nginx örneği                                        |
| `docs`                 | Kurulum, mimari, kod standartları, yayın ve mevzuat notları                     |

## Hızlı başlangıç

Gerekenler: [Node.js 22](https://nodejs.org) (22.13 veya üstü) ve PostgreSQL 16. PostgreSQL'i en
kolay [Docker Desktop](https://www.docker.com/products/docker-desktop/) ile çalıştırırsınız.
Windows için adım adım anlatım: [docs/KURULUM.md](docs/KURULUM.md).

```bash
npm ci             # kilit dosyasındaki bağımlılıkları kurar
npm run db:up      # PostgreSQL'i Docker ile başlatır
DATABASE_BOOTSTRAP_URL=postgres://postgres:vado@localhost:5432/vado npm run db:roles
npm run db:seed    # tabloları oluşturur, örnek veriyi ve örnek mini uygulama paketini yükler
npm run dev        # API (4000), Control (3000), Business (3001), örnek mini uygulama (5173)
```

İkinci bir terminalde uygulamayı açın:

```bash
npm run web        # tarayıcıda önizleme: http://localhost:8081
npm run mobile     # telefonda Expo Go ile (önce: npm run lan)
```

Örnek hesaplarla giriş yapın. Demo modunda SMS gönderilmez, doğrulama kodu her zaman `000000` olur.

| Kişi         | Telefon        | Not                                        |
| ------------ | -------------- | ------------------------------------------ |
| Ayşe Yılmaz  | 0555 000 00 01 | Sohbetleri ve bekleyen bir kişi isteği var |
| Mehmet Demir | 0555 000 00 02 | Kadıköy Berber'in sahibi                   |
| Zeynep Kaya  | 0555 000 00 03 |                                            |
| Can Öztürk   | 0555 000 00 04 | Ayşe'ye kişi isteği göndermiş              |

İki kişiyi iki ayrı tarayıcı penceresinde (biri gizli pencere) açarsanız mesajların, okundu
bilgisinin ve "yazıyor" göstergesinin anında karşıya geçtiğini görürsünüz.

Yönetim paneli `http://localhost:3000` adresindedir. Örnek veri üç yönetici ve bir işletme
hesabı açar; parola
`vado-gelistirme`, demo modunda ikinci adım kodu `000000`:

| Kullanıcı adı | Kişi         | Rol       | Not                                         |
| ------------- | ------------ | --------- | ------------------------------------------- |
| `sahip`       | Deniz Arslan | Sahip     | Her şey; panel hesaplarını yönetir          |
| `operator`    | Okan Şahin   | Operatör  | Paket yükler, kayıtları yönetir ve yayınlar |
| `inceleyen`   | İpek Aydın   | İnceleyen | Paket sürümlerini onaylar ve reddeder       |
| `isletme`     | Mehmet Demir | İşletme   | Yalnızca Kadıköy Berber'in kaydını görür    |

## Komutlar

| Komut                     | Ne yapar                                                                        |
| ------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`             | API, Control, Business ve örnek mini uygulamayı birlikte başlatır               |
| `npm run web`             | Mobil uygulamayı tarayıcıda açar                                                |
| `npm run mobile`          | Expo geliştirme sunucusunu başlatır (telefon veya emülatör)                     |
| `npm run lan`             | Telefonla denemek için adresleri bilgisayarın ağ adresine çevirir               |
| `npm run db:up`           | Geliştirme veritabanını (ve Redis'i) Docker ile başlatır                        |
| `npm run db:roles`        | İlk kurulumda üç veritabanı rolünü oluşturur, eski şemanın sahipliğini taşır    |
| `npm run db:migrate`      | Bekleyen şema değişikliklerini uygular                                          |
| `npm run db:seed`         | Örnek veriyi yükler; yeniden çalıştırılabilir                                   |
| `npm run keys`            | Canlı ortamın imza anahtarlarını üretir, değiştirir ve denetler                 |
| `npm run admins`          | Panel hesaplarını açar, listeler; parolayı ve ikinci adımı sıfırlar             |
| `npm run miniapp:pack`    | Derlenmiş bir mini uygulamayı denetler ve yüklenmeye hazır pakete çevirir       |
| `npm run packages:verify` | Paket deposunun veritabanıyla tutarlı olduğunu denetler                         |
| `npm run check`           | Biçim, lint, proje kuralları, tip denetimi, testler ve derlemeler: hepsi birden |
| `npm run format`          | Tüm dosyaları Prettier ile biçimlendirir                                        |

## Neler var

- **Giriş:** telefon numarası ve SMS koduyla. Kod istekleri telefon ve IP başına sınırlıdır;
  oturumlar cihaz cihaz listelenir ve uzaktan kapatılabilir.
- **Hesap güvenliği:** cihaz tanınır; kullanılan cihazda oturum kendiliğinden uzar ve yeniden kod
  sorulmaz. Tanınmayan bir cihazdan girişte açık cihazlar uyarılır. Ödeme onayı, hesap silme ve
  başka cihazın oturumunu kapatma, kimlik yakın zamanda kanıtlanmadıysa yeniden doğrulama ister:
  tanınan cihazda parmak izi, yüz ya da cihaz şifresi, yeni cihazda SMS ile gelen ayrı bir kod.
  İsteğe bağlı uygulama kilidi vardır.
- **Bağımsız anahtarlar:** doğrulama kodu, QR, mini uygulama kimliği ve mini uygulama kimlik
  belirteci ayrı anahtarlarla korunur.
  Doğrulama kodu ve QR anahtarı sistem çalışırken, eski kodları geçersiz kılmadan değiştirilebilir;
  mini uygulamaların tanıdığı kullanıcı kimlikleri bundan etkilenmez.
- **Kişiler:** VADO kimliği, telefon numarası veya QR kodla bulma; istek gönderme, kabul etme,
  engelleme.
- **Sohbet:** birebir ve grup; metin ve fotoğraf; okundu bilgisi, "yazıyor" göstergesi; bağlantı
  kopsa da mesaj çoğalmadan yeniden gönderilir.
- **Anlık bildirim:** yeni mesaj ve yeni cihazdan giriş bildirimi (Expo Push Service). Mesajın
  içeriği varsayılan olarak bildirimde görünmez; kullanıcı açabilir ya da mesaj bildirimini
  kapatabilir. Cihaz tarafı denenmedi (aşağıda).
- **Anlar:** yalnızca kişilerin gördüğü paylaşımlar; fotoğraf, beğeni, yorum.
- **Mini uygulamalar:** uygulama içinde, yalıtılmış çalışan web uygulamaları. Kod, paket olarak
  VADO'ya yüklenir; panelde incelenir (yetkiler, bağlanacağı adresler, önceki sürüme göre fark),
  onaylanır ve VADO'nun sunucusundan sunulur. Onaylanan sürüm değiştirilemez: içeriği SHA-256
  özetiyle tanınır. Canlı ortamda yalnızca onaylı paketler çalışır.
- **Paket ve işletme ayrımı:** aynı paketi çok sayıda işletme kullanabilir. Her işletmenin kendi
  uygulama kaydı vardır: adı, simgesi, ayarları, satıcısı ve yayınladığı sürüm. Kod bir kez
  incelenir; kullanıcı kimliği, izinler ve veriler işletmeden işletmeye ayrıdır.
- **Yayın denetimi:** sürüm yayınlama, toplu dağıtım, geri alma, tek kaydı ya da bir sürümü
  kullanan bütün kayıtları acil kapatma. Yeni sürüm yetkileri ya da bağlandığı adresleri
  değiştirirse kullanıcıya izin yeniden sorulur.
- **Mini uygulama kimlik belirteci:** mini uygulamanın sunucusu kullanıcıyı VADO'nun imzaladığı
  beş dakikalık bir belirteçle (JWT, Ed25519) doğrular; belirteçte ad ve telefon yoktur.
- **Parametreli QR:** panelden masa ya da şube gibi parametreler taşıyan, imzalı QR kodu; mini
  uygulama parametreleri değiştirilmemiş olarak okur.
- **Ödeme:** mini uygulama tutarı ister, onay VADO'nun kendi ekranında verilir. Kart bilgisi VADO'ya
  ve mini uygulamaya hiç girmez. Bu sürümde yalnızca deneme ödemesi vardır (aşağıya bakın).
- **İşletme hesapları:** başvuru, panelden onay, Keşfet'te listeleme, mini uygulamaya bağlama.
- **Şikayet:** kullanıcı, mesaj, paylaşım, işletme ve mini uygulama şikayet edilebilir; şikayetler
  panele düşer.
- **Panel hesapları:** her yönetici kendi hesabıyla, parola ve iki adımlı doğrulamayla (doğrulama
  uygulaması ya da kurtarma kodu) girer. Beş ekip rolü (sahip, inceleyen, operatör, destek,
  denetçi) ve işletme rolü: işletme hesabı yalnızca kendi mini uygulamalarını görür, ayarlarını
  değiştirir ve QR kodu üretir.
  Yetki her uçta sunucuda denetlenir; paketi yükleyen ya da incelemeye gönderen onu onaylayamaz.
  Oturumlar listelenir ve uzaktan kapatılır; denetim kaydında işlemi yapan adıyla görünür.
- **Yönetim paneli:** bekleyen işler, kullanıcı askıya alma, işletme onayı, paket yükleme ve
  inceleme, uygulama kayıtları ve yayınları, şikayetler, denetim kaydı.
- **KVKK:** açık onay, aydınlatma metni, numarayla bulunmayı kapatma, hesabı ve verileri silme.

## Bu sürümde olmayanlar

Dürüst bir liste; ayrıntısı ve önerilen sıra [docs/YOL_HARITASI.md](docs/YOL_HARITASI.md) içinde.

- **Gerçek ödeme yok.** Ödeme almak lisans gerektirir; VADO'nun lisanslı bir ödeme kuruluşuyla
  sözleşme yapıp onun ödeme sayfasını bağlaması gerekir. O zamana kadar `sandbox` kipi çalışır.
- **SMS gönderimi hazır değil.** Kodlar, sizin SMS firmanıza bağlayacağınız küçük bir aracı servise
  iletilir (bkz. [docs/YAYIN.md](docs/YAYIN.md)). Demo modunda SMS gerekmez.
- **Sesli mesaj, uygulama içi sesli/görüntülü arama yok.** Görüntülü görüşme düğmesi sohbete bir
  Jitsi bağlantısı gönderir. Anlık bildirim var ama gerçek telefonda denenmedi; açmak için sizin
  Expo, Firebase ve Apple hesaplarınız gerekir (bkz. [docs/YAYIN.md](docs/YAYIN.md#anlık-bildirim)).
- **Uçtan uca şifreleme yok.** Mesajlar aktarımda TLS ile korunur, sunucuda düz metin saklanır.
- **İçerik kaldırma ve yaş doğrulama yok.** Şikayet edilen mesaj ya da paylaşım panelden
  kaldırılamaz, yalnızca hesap askıya alınabilir. Kayıtta yaş doğrulanmaz.
- **Geliştirici hesapları yok.** Paketleri geliştiricinin kendisi yükleyemez; paket geliştirici
  anahtarıyla imzalanmaz. İşletme hesabı vitrini, satıcıyı ve yayını değiştiremez; onlar VADO
  ekibindedir.
- **Mini uygulamadan bildirim yok.** Mini uygulama kullanıcıya hatırlatma gönderemez.
- **Mini uygulamalarda WebRTC kapatılamıyor.** Tarayıcılar WebRTC bağlantılarını güvenlik
  politikasına bağlamıyor: kötü niyetli bir paket, bildirmediği bir sunucuya veri gönderebilir.
  Yükleme incelemesi bunu yalnızca işaretler; kalıcı çözüm yerel kod gerektirir
  (bkz. [SECURITY.md](SECURITY.md), bilinen sınırlar).
- **Hukuki metinler taslaktır.** Kullanım Koşulları ve KVKK Aydınlatma Metni bir hukukçu tarafından
  yazılmalıdır (bkz. [docs/TURKIYE_UYUM.md](docs/TURKIYE_UYUM.md)).

## Neyi denedik, neyi denemedik

Denendi (bu depodaki kodla, gerçek PostgreSQL üzerinde; 2.5 için yinelenenler ve yenileri):

- 651 otomatik test: sözleşmeler (132), mini uygulama kitaplığı (11), API (441; gerçek veritabanı
  ve gerçek WebSocket bağlantılarıyla), mobil uygulamanın telefondan bağımsız mantığı (67). 2.5'in
  testleri kimlik belirtecini Node.js'in kendi `crypto` modülüyle, mini uygulama sunucusunun
  yapacağı gibi doğrular; işletme hesabının kapsamını, rol tablosu bilerek genişletilmişken de
  sınar; bildirimleri sahte sağlayıcıyla, Expo sağlayıcısını taklit edilmiş yanıtlarla sınar. Yeni
  veritabanı kuralları (işletme kapsamı, bildirim adresinin sahibi, oturum kapanınca adresin
  silinmesi) doğrudan SQL ile de zorlanır. İzin testi kayıtlı her yönetim ucunu (35) her rolle (6)
  çağırır.
- **Bozma denemesi:** koruma kurallarının 110'u (2.4'e kadar 78, 2.5'te eklenen 32: belirtecin
  kimlik yetkisi, kaydı, takma kimliği ve süresi; süresi dolan açık anahtar; QR parametrelerinin
  imzası ve kapsamı; mobilde açılış parametreleri; işletme kapsamı, ikinci katman, rol değişmezliği
  ve veritabanı kuralları; bildirim alıcıları, önizleme, adresin sahibi, oturum kapanınca silinme,
  geçersiz adres, yeni cihaz bildirimi, Expo yanıtı, bildirim verisi) tek tek bozuldu; testler
  hepsini yakaladı.
- **Tarayıcıda uçtan uca senaryolar.** 2.4'ün yedi senaryosu (151 adım) hem geliştirme kipinde hem
  canlı derlemelerle hatasız geçti. 2.5 için yeni senaryolar: mobil web önizlemesinde işletmenin
  ürettiği parametreli kodun okutulması ve parametrelerin mini uygulamanın bağlamına gelmesi
  (adreste görünmeden; uydurma açılış anahtarı ve değiştirilmiş kod reddedildi), mini uygulamanın
  aldığı kimlik belirtecinin yayımlanan açık anahtarla doğrulanması, Bildirimler ekranı (8 adım);
  panelde QR kodu üretimi ve hatalı parametreler (17 adım); işletme hesabıyla giriş, yalnızca kendi
  kaydını görme, ayar değiştirme, yetkisiz bölümler, işletme hesabı açma ve rollere göre daralan
  kayıt sayfası (29 adım). Üçü de iki kipte hatasız; tarayıcı konsolu temiz. Geliştirme kipinde 37
  ekran tarandı, sorun yok.
- **Canlı ortam denemesi (54/54):** 2.4'teki 50 denetim ve yenileri: kimlik anahtarı eksikken ya da
  başka aileyle ortakken başlamama, bir süreçte imzalanan kimlik belirtecinin öteki sürecin
  yayımladığı anahtarla doğrulanması, parametreli kodun süreçler arası çözülmesi.
- **2.4'ten geçiş (26/26):** 2.4'ün derlenmiş API'si canlı ayarlarla hesaplar, kullanıcı, işletme,
  yayınlanmış paket ve QR kodu üretti. 2.5 kimlik anahtarı olmadan başlamadı ve
  `keys add identity` dedi; komutun yazdırdığı satırla `keys check` geçti; şema yükseltilmeden
  başlamadı, `migrate` yalnızca `0006` ve `0007`'yi uyguladı. Kullanıcı ve panel oturumları, mini
  uygulamanın adresi, izin özeti, kullanıcı kimliği ve 2.4'te üretilen QR kodu korundu; kimlik
  belirteci, parametreli kod, işletme hesabı (komut satırından) ve bildirim ayarları aynı veride
  çalıştı. Aynı veritabanında 2.4 yeniden başladı; kapatılmamış işletme hesabının 2.4'te sunucu
  hatası aldığı görüldü (belgede "önce kapatın" yazar).
- **Nginx ve TLS (senaryo 8, 20/20):** derlenmiş API ve canlı panel depodaki Nginx örneğinin
  arkasında, gerçek tarayıcıyla; 2.4'teki adımlar 2.5 kodu ve dört anahtar ailesiyle yinelendi.
- **Docker:** API ve panel imajları 2.5 ile derlenip canlı ayarlarla 28 denetimden geçti
  (`keys generate` dört aile üretiyor). **`docker-compose.prod.yml` dosyasının tamamı** `up` ile
  çalıştırıldı: `migrate` 0001-0007'yi uyguladı, API ve panel sağlıklı açıldı, açık anahtarlar
  önbellek başlığıyla yayımlandı, belgedeki `keys check` ve `admins.js create` komutları çalıştı;
  `VADO_IDENTITY_KEYS` boşken Compose nedenini söyleyip başlamadı. **Yedekten dönüş** tatbikatı
  12/12.
- Dayanıklılık denemesi (veritabanı bağlantısının ve Redis'in kopması) 2.4'te yapıldı (19/19); 2.5
  bu katmana dokunmadığı için yinelenmedi.
- Zip dosyası boş bir klasöre açılıp sıfırdan kuruldu; `npm ci` ve `npm run check` o kopyada
  hatasız geçti.
- Mobil uygulamanın Android ve iOS için JavaScript paketleri `expo-notifications` ile derlendi.
- **Yalıtım ölçümü** (2.3.1): paketin açıldığı belgeden çıkış 59 denemeyle, Chromium 141 ve WebKit
  2.52 üzerinde ölçüldü; 2.4 ve 2.5 bu alana dokunmadığı için ölçüm yinelenmedi; senaryo 6 ve 8'deki
  yalıtım adımları geçti.

Her birinin ayrıntısı ve sınırı [docs/YAYIN.md](docs/YAYIN.md) belgesinin son bölümündedir.

Denenmedi:

- **Gerçek telefon.** Uygulama bir telefonda ya da emülatörde çalıştırılmadı; kamera ile QR okutma,
  fotoğraf seçme, konum ve klavye davranışı yalnızca gerçek cihazda görülebilir. İlk iş olarak Expo
  Go ile kendi telefonunuzda deneyin.
- **Mini uygulama paketleri telefonda.** Paketin açılması, köprü, izin, ödeme ve yalıtım masaüstü
  tarayıcı motorlarında (Chromium, WebKit) uçtan uca denendi ve ölçüldü. Android System WebView ve
  iOS WKWebView'in kendisinde, telefondaki kabuğun kilidi ve köprünün taşımasıyla birlikte
  yalnızca derlendi; 2.3.0'daki Android köprü hatasının düzeltmesi de cihazda görülmedi. Yayından
  önce gerçek cihazda sınanmalıdır (bkz. [SECURITY.md](SECURITY.md), bilinen sınırlar).
- **Anlık bildirimin cihaz tarafı.** Gerçek bir telefona bildirim gönderilmedi; izin, adres alma,
  bildirime dokununca sohbetin açılması ve Expo'nun gerçek yanıtları denenmedi. Bunun için sizin
  Expo, Firebase ve Apple hesaplarınız gerekir; adımlar ve deneme listesi
  [docs/YAYIN.md](docs/YAYIN.md#anlık-bildirim) içindedir.
- **Gerçek bir doğrulama uygulaması.** İkinci adımın kodları RFC sınama vektörleriyle ve aynı
  hesabı yapan bir betikle üretildi; panelin gösterdiği QR kodu bir telefondaki Google
  Authenticator ya da benzeriyle okutulmadı.
- **Parmak izi, yüz ve uygulama kilidi.** Cihazın kilidini soran bölüm yalnızca derlendi; sunucu
  tarafı ve SMS koduyla yeniden doğrulama ise uçtan uca denendi.
- **Mağaza paketi.** EAS ile APK ya da mağaza paketi üretilmedi.
- **Canlı sunucu.** Compose dosyasının tamamı bu ortamda çalıştı ama gerçek bir sunucuda, gerçek
  alan adı ve sertifikayla (certbot) kurulmadı.
- **Windows.** Komutlar Windows'ta çalışacak biçimde yazıldı ama Windows'ta çalıştırılmadı.
- **Yük.** Çok kullanıcılı yük testi yapılmadı; paket boyutu sınırı da gerçek cihazda açılış süresi
  ölçülerek belirlenmedi.

## Belgeler

- [Kurulum](docs/KURULUM.md): Windows, macOS ve Linux için adım adım
- [Mimari](docs/MIMARI.md): parçalar nasıl birleşiyor, kararlar ve gerekçeleri
- [Uygulama platformu mimarisi](docs/PLATFORM_MIMARISI.md): motorlar, yetenek paketleri, sektör
  ürünleri ve PRO kalite şartı
- [Kod standartları](docs/KOD_STANDARTLARI.md): "tek elden çıkmış" kod için kurallar
- [API](docs/API.md): uç noktalar, hata biçimi, gerçek zamanlı olaylar
- [Mini uygulama geliştirme](docs/MINI_UYGULAMA_GELISTIRME.md): paket, bildirim dosyası, işletme
  ayarları, yükleme, inceleme ve yayın
- [Yayın](docs/YAYIN.md): sunucuya kurulum, ilk panel hesabı, 2.3.1'den geçiş, yedek, mobil
  uygulamayı mağazaya hazırlama
- [Anahtarlar](docs/ANAHTARLAR.md): imza anahtarlarını üretme, 2.1'den geçiş, anahtar değiştirme
- [Türkiye'de mevzuat](docs/TURKIYE_UYUM.md): KVKK, BTK, 5651, ödeme hizmetleri
- [İşletme içi yetki](docs/YETKI.md) · [Business Studio](docs/STUDIO.md) ·
  [Keşif ve arama](docs/KESIF.md)
- [Yol haritası](docs/YOL_HARITASI.md) · [2.6 planı ve devir notu](docs/PLAN_2.6.md) ·
  [2.8 planı](docs/PLAN_2.8.md)
- [Değişiklikler](CHANGELOG.md) · [Güvenlik](SECURITY.md) · [Lisans](LICENSE.md) ·
  [Üçüncü taraf bildirimleri](THIRD_PARTY_NOTICES.md)

## 2.6 ilk ara sürüm

`2.6.0-alpha.1`: platform veri modeli, işletme üyelikleri, şubeler, çalışma saatleri ve kabuk
müşteri bağlamı. API'nin işletme verisi gerçek PostgreSQL'de `vado_app` rolüyle yalıtılır.
Kurulum ve yükseltmede önce `npm run db:roles`, sonra `npm run db:migrate` kullanın; ayrıntılar
[Kurulum](docs/KURULUM.md) ve [Yayın](docs/YAYIN.md) belgelerindedir.

Başlangıçta 2.5.0 için 651 test ve tam `npm run check` çalıştırıldı. Yeni yalıtım testleri
uygulama rolünü, kapsamsız erişimi, yabancı işletmede okuma/güncelleme/silmeyi, çapraz yabancı
anahtarları, kapsam sızmasını, üyelik yetkilerini ve hesap silmede müşteri bağının kopmasını
sınar. Bu ortamda Docker/Compose ve gerçek telefon denenmedi. Altı aşamalı 2.6'nın diğer
parçaları henüz bu ara sürümde değildir.

## 2.6 ikinci ara sürüm

`2.6.0-alpha.2` ortak katalog, ürün seçenekleri, şubeye özel fiyat ve kuruş bazlı KDV hesabını
ekler. Katalog için kapsamsız/yabancı okuma, güncelleme, silme ve çapraz bağlantılar doğrudan
SQL ile sınanır. Fiyat görüntüsü sırasında SQL'den yeni şube fiyatı eklenmesi önce açık bulundu,
veritabanı kilidi eklendikten sonra aynı deneme engellendi. Docker/Compose ve gerçek telefon
bu ortamda denenmedi. Olaylar, sepet/sipariş, paketler ve Business sonraki aşamalardır.

İkinci ara sürümde hesap silme yarışı ayrıca sınandı: geç kalan doğrudan SQL bağı, geç kalan
kabuk isteği ve silmeyle eş zamanlı yirmi kabuk isteği. Silinen hesabın işletme müşteri bağı
yeniden kurulamaz. Bu düzeltme 0009'a eklendi; ilk teslimdeki 0008 dosyası değişmedi.

## 2.6 üçüncü ara sürüm

`2.6.0-alpha.3`: iş kaydıyla aynı işlemde olay, kısa kira, sıralı teslim, iç etkilerin
tekrar koruması ve 24 saatlik müşteri anahtarı. 2.5 bildirimleri artık SQL kuyruğundan
gider; panelde ölü teslim ve denetimli tekrar deneme, mobilde kalıcı olay denetimi,
dış alıcı için HMAC webhook bulunur. Elli eş zamanlı tekrar isteği, iki dağıtıcı,
kapsamsız/yabancı SQL erişimi ve gerçek alt süreç ölümü sınandı. Dış gönderim
tekrar edebilir; gerçek cihaz, Docker/Compose ve gerçek dış sağlayıcı denenmedi.
Sepet/sipariş, paketler ve Business bu ara sürümün ardından gelir.

Üçüncü ara sürümün tam `npm run check` kontrolü: 132 sözleşme + 11 SDK + 491 API + 69 mobil,
toplam **703 test**; biçim, lint, proje kuralları, tip denetimi ve tüm derlemeler geçti.
Yeni panel rotası için eski derleme önbelleği korunarak temiz derleme doğrulandı.

## 2.6 dördüncü ara sürüm

`2.6.0-alpha.4`: sunucuda sürümlü sepet, fiyat değişiminde güncel sepetle 409,
değişmez sipariş görüntüsü ve sürümlü durum geçişi. Elli eş zamanlı aynı anahtarlı
HTTP isteği tek sipariş ve tek olay oluşturdu. İki cihazın sepet düzenlemesi ve
eş zamanlı durum değiştirme denendi: biri kazandı, öteki 409 aldı. Altı yeni
tablonun RLS/FORCE politikası, yabancı bağlantı ve doğrudan SQL değişmezliği sınandı.
SQL olay yazımı reddedilince bütün checkout geri alındı. Kabuk işletme/uygulama/
oturum alanlarını paket parametresinden kabul etmez; SDK yalnızca köprüye ulaşır.
Müşteri ekranı, Docker/Compose ve gerçek telefon bu aşamada denenmedi. Yetenek
paketleri ve VADO Business sonraki iki aşamadır.

Tam kontrol: 134 sözleşme + 12 SDK + 504 API + 74 mobil = **724 test**.

## 2.6 beşinci ara sürüm

`2.6.0-alpha.5`: veri manifesti, Zod'dan JSON Schema, sürüm/bağımlılık/ayar
doğrulaması ve hazırlık deneme paketi. Bilinmeyen kod ve işlev ayarı, döngü,
erişilemeyen durum, çekirdek bitişine ekleme ve kayıtsız kural reddedilir.
Paket kapatıldıktan sonra başlamış sipariş hazırlık görüntüsüyle tamamlandı.
SQL ile manifest aynı grafiği üretti; paket ayarında RLS/FORCE sınandı.
Rolü değişen, üyeliği kaldırılan veya hesabı silinen kullanıcının önceki
kapsamı reddedildi. Motorun ayrıcalıklı yolları içe aktarması olumsuz lint
denemesiyle doğrulandı. Müşteri ekranı eklenmedi; gerçek mutfak ve ses 2.7'dedir.

Tam kontrol: 136 sözleşme + 12 SDK + 517 API + 74 mobil = **739 test**.
VADO Business ve son kabul denemeleri sıradadır; Docker/Compose ve gerçek
telefon bu ortamda denenmedi.

## 2.6 işletme platformu

VADO Business `http://localhost:3001` adresindedir; VADO kullanıcı hesabı ve işletme
üyeliğiyle giriş yapılır. Canlı siparişler, ürünler, şubeler ve manifestten üretilen
paket ayarları için [Business](docs/BUSINESS.md) belgesini okuyun. Sunucuda işletme
yalıtımı, üç veritabanı rolü, kalıcı olay kuyruğu ve sürüm kontrollü sepet/sipariş
çekirdeği bulunur. Geçiş ve geri dönüş adımları [Yayın](docs/YAYIN.md), gerçek deneme
sonuçları [2.6 kabul kaydı](docs/KABUL_2.6.md) belgesindedir.

## Restoran 2.7

VADO müşteri paketi, imzalı masa QR'ı, gel-al/ileri saat, canlı sipariş, mutfak,
ortak tablet ve fiziksel tahsilat: [Restoran kurulumu](docs/RESTORAN_2.7.md),
[kabul kanıtları](docs/KABUL_2.7.md),
[geçiş ve geri dönüş](docs/YAYIN.md#26dan-27ye-geçiş-ve-geri-dönüş).

## 2.8 (geliştiriliyor)

Restoran 2. parça ve süper uygulama temeli. Durum, bulgular ve ara sürümler:
[2.8 planı](docs/PLAN_2.8.md). Bu ara sürümde yazılanlar:
[işletme içi yetki](docs/YETKI.md), [Business Studio](docs/STUDIO.md),
[keşif ve arama](docs/KESIF.md), [konum](docs/KONUM.md), [eve teslim](docs/TESLIMAT.md),
[teşvik](docs/TESVIK.md). Yukarıdaki "Neyi denedik" bölümü 2.8.0 ile yenilenecektir; ara
sürümün gerçek deneme sonuçları [CHANGELOG](CHANGELOG.md) içindedir.
