# VADO

Türkiye için mesajlaşma, mini uygulama ve ödeme platformu. Telefon numarasıyla giriş, kişiler,
birebir ve grup sohbetleri, Anlar, QR ile ekleme, uygulama içinde açılan mini uygulamalar, ödeme
onayı ve işletme hesapları tek bir uygulamada toplanır.

Kod 2.0'da tek bir standartla baştan yazıldı; sonraki sürümler (bu depo 2.4.0) yama olarak değil, o
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
npm install        # bağımlılıkları kurar
npm run db:up      # PostgreSQL'i Docker ile başlatır
npm run db:seed    # tabloları oluşturur, örnek veriyi ve örnek mini uygulama paketini yükler
npm run dev        # API (4000), panel (3000) ve örnek mini uygulama (5173)
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

Yönetim paneli `http://localhost:3000` adresindedir. Örnek veri üç yönetici açar; parola
`vado-gelistirme`, demo modunda ikinci adım kodu `000000`:

| Kullanıcı adı | Kişi         | Rol       | Not                                         |
| ------------- | ------------ | --------- | ------------------------------------------- |
| `sahip`       | Deniz Arslan | Sahip     | Her şey; panel hesaplarını yönetir          |
| `operator`    | Okan Şahin   | Operatör  | Paket yükler, kayıtları yönetir ve yayınlar |
| `inceleyen`   | İpek Aydın   | İnceleyen | Paket sürümlerini onaylar ve reddeder       |

## Komutlar

| Komut                     | Ne yapar                                                                        |
| ------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`             | API, panel ve örnek mini uygulamayı birlikte başlatır                           |
| `npm run web`             | Mobil uygulamayı tarayıcıda açar                                                |
| `npm run mobile`          | Expo geliştirme sunucusunu başlatır (telefon veya emülatör)                     |
| `npm run lan`             | Telefonla denemek için adresleri bilgisayarın ağ adresine çevirir               |
| `npm run db:up`           | Geliştirme veritabanını (ve Redis'i) Docker ile başlatır                        |
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

Denendi (bu depodaki kodla, gerçek PostgreSQL üzerinde; 2.4 için yinelenenler ve yenileri):

- 606 otomatik test: sözleşmeler (132), mini uygulama kitaplığı (10), API (403; gerçek veritabanı
  ve gerçek WebSocket bağlantılarıyla), mobil uygulamanın telefondan bağımsız mantığı (61). Panel
  hesaplarının testleri TOTP'yi RFC 4226 ve RFC 6238'in sınama vektörleriyle, girişi gerçek
  kodlarla sınar; izin testi kayıtlı her yönetim ucunu (34) her rolle (5) çağırır ve izni olmayan
  her rolün reddedildiğini doğrular; dört göz kuralı ve son sahibin korunması doğrudan SQL ile de
  zorlanır. Paket testleri bozuk ve kötü niyetli zip arşivleri yükler, depodaki dosyaları bozar ve
  değişmezlik kurallarını doğrudan SQL ile zorlar.
- **Bozma denemesi:** koruma kurallarının 78'i (2.3.1'den 50, 2.4'te eklenen 28: izin denetimi,
  yönetici anahtarı, yarım oturum, oturumun süresi ve iptali, kapalı hesap, kodun yeniden
  kullanımı, kurtarma kodu, kilitlenme, parola, son sahip, yükleyen/onaylayan kuralı) tek tek
  bozuldu; testler hepsini yakaladı. İlk turda dört bozma kaçtı; eksik testler yazıldı.
- **Tarayıcıda uçtan uca sekiz senaryo, toplam 171 adım:** kayıt, kişi ekleme, iki kullanıcı
  arasında anlık sohbet, grup, Anlar, QR, şikayet, oturumu uzaktan kapatma, hesap silme, yeni cihaz
  uyarısı ve yeniden doğrulama; paketli mini uygulama, izin, ödeme, yalıtım, gezinme, yeniden izin,
  geri alma ve acil kapatma; panelde hesapla giriş (yanlış parola, yanlış kod), paket yükleme
  (operatör), onay (inceleyen; operatör onay düğmesini görmez), yayın, toplu dağıtım, geri çekme ve
  denetim kaydında kişi adları. Senaryo 1-7 hem geliştirme kipinde hem canlı derlemelerle
  çalıştırıldı (151 adım, ikisinde de hatasız); geliştirme kipinde 36 ekran tarandı, tarayıcı
  konsolu temiz. Ayrıca panelin yeni sayfaları (giriş, ikinci adımın kurulumu, kurtarma kodları,
  hesabım, panel hesapları, role göre menü, yetki sayfası, çıkış) tarayıcıda 17 adımla denendi.
- **Canlı ortam düzeni (senaryo 8, 20 adım):** derlenmiş API (canlı ayarlar, alt alan adı kipi) ve
  canlı derlenmiş panel, depodaki Nginx örneğinin (1.24) arkasında, TLS ile çalıştırıldı. İlk sahip
  komut satırından açıldı; panelde ilk giriş, ikinci adımın gerçek TOTP koduyla kurulumu (demo kodu
  reddedildi), kurtarma kodları ve parola değişikliği tarayıcıda yapıldı; oturum çerezinin
  `HttpOnly`, `Secure` ve `SameSite=Strict` olduğu görüldü. Paketi yükleyen sahip onay düğmesini
  görmedi, ikinci hesap onayladı; mini uygulama açılıp ödeme alındı ve sürüm geri çekildi.
- **Canlı ortam denemesi:** derlenmiş API canlı ayarlarla 50 denetimden geçti (eksik ya da zayıf
  anahtarla başlamama; yönetici anahtarının tek başına yetmemesi; demo kodunun canlıda
  geçmemesi; kendi sürümünü onaylayamama dahil). Dayanıklılık: iki API sürecinde veritabanı
  bağlantıları koparıldı, Redis yeniden başlatıldı (19/19).
- **2.3.1'den geçiş (28/28):** 2.3.1'in derlenmiş API'si canlı ayarlarla kullanıcı, yayınlanmış
  paket, incelemede bekleyen ve taslak sürüm, askıya alma ve denetim kaydı üretti. 2.4 şema
  yükseltilmeden başlamadı; `migrate` yalnızca `0004` ve `0005`'i uyguladı; sahip yokken API
  uyardı; eski panel girişi (yalnızca anahtar) reddedildi. Kullanıcı oturumu, mini uygulamanın
  adresi, izin özeti ve kullanıcı kimliği değişmedi. Hesaplar komut satırından açıldı, ilk girişte
  ikinci adım kuruldu. Eski kayıtlar "Ortak panel hesabı (2.3)" adıyla göründü; incelemede bekleyen
  eski sürüm doğrudan onaylanamadı, bir hesap yeniden gönderince başka bir hesap onayladı. Aynı
  veritabanında 2.3.1'in başladığı ama incelemeye gönderme yapamadığı görüldü: geri dönüş yedekten
  yapılır.
- **Docker:** API ve panel imajları resmî `node:22-bookworm-slim` imajından derlendi (bu ortamın
  ağ vekili için taban imaja yalnızca bir kök sertifika eklendi) ve canlı ayarlarla 28 denetimden
  geçti (ilk sahip kabın içindeki komutla, eski panel değişkenleriyle panelin açılmaması dahil).
  **`docker-compose.prod.yml` dosyasının tamamı** resmî PostgreSQL ve Redis imajlarıyla `up` ile
  çalıştırıldı: şema kuruldu, API ve panel sağlıklı açıldı, belgedeki `run --rm api … admins.js
create` komutu ilk sahibi açtı, panelde ilk giriş ve ikinci adım kurulumu yapıldı.
  `npm run db:up` de çalıştırıldı. **Yedekten dönüş** tatbikatı 12/12.
- Zip dosyası boş bir klasöre açılıp sıfırdan kuruldu; `npm ci` ve `npm run check` o kopyada
  hatasız geçti.
- Mobil uygulamanın Android ve iOS için JavaScript paketleri derlendi.
- **Yalıtım ölçümü** (2.3.1): paketin açıldığı belgeden çıkış 59 denemeyle, Chromium 141 ve WebKit
  2.52 üzerinde ölçüldü; hiçbirinde paketin dışına istek çıkmadı, koruma kaldırıldığında dokuz
  yoldan istek çıktı. 2.4 bu alana dokunmadığı için ölçüm yinelenmedi; senaryo 6 ve 8'deki yalıtım
  adımları geçti.

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
- [Kod standartları](docs/KOD_STANDARTLARI.md): "tek elden çıkmış" kod için kurallar
- [API](docs/API.md): uç noktalar, hata biçimi, gerçek zamanlı olaylar
- [Mini uygulama geliştirme](docs/MINI_UYGULAMA_GELISTIRME.md): paket, bildirim dosyası, işletme
  ayarları, yükleme, inceleme ve yayın
- [Yayın](docs/YAYIN.md): sunucuya kurulum, ilk panel hesabı, 2.3.1'den geçiş, yedek, mobil
  uygulamayı mağazaya hazırlama
- [Anahtarlar](docs/ANAHTARLAR.md): imza anahtarlarını üretme, 2.1'den geçiş, anahtar değiştirme
- [Türkiye'de mevzuat](docs/TURKIYE_UYUM.md): KVKK, BTK, 5651, ödeme hizmetleri
- [Yol haritası](docs/YOL_HARITASI.md)
- [Değişiklikler](CHANGELOG.md) · [Güvenlik](SECURITY.md) · [Lisans](LICENSE.md) ·
  [Üçüncü taraf bildirimleri](THIRD_PARTY_NOTICES.md)
