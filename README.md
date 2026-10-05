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
- **Bağımsız anahtarlar:** doğrulama kodu, QR ve mini uygulama kimliği ayrı anahtarlarla korunur.
  Doğrulama kodu ve QR anahtarı sistem çalışırken, eski kodları geçersiz kılmadan değiştirilebilir;
  mini uygulamaların tanıdığı kullanıcı kimlikleri bundan etkilenmez.
- **Kişiler:** VADO kimliği, telefon numarası veya QR kodla bulma; istek gönderme, kabul etme,
  engelleme.
- **Sohbet:** birebir ve grup; metin ve fotoğraf; okundu bilgisi, "yazıyor" göstergesi; bağlantı
  kopsa da mesaj çoğalmadan yeniden gönderilir.
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
- **Ödeme:** mini uygulama tutarı ister, onay VADO'nun kendi ekranında verilir. Kart bilgisi VADO'ya
  ve mini uygulamaya hiç girmez. Bu sürümde yalnızca deneme ödemesi vardır (aşağıya bakın).
- **İşletme hesapları:** başvuru, panelden onay, Keşfet'te listeleme, mini uygulamaya bağlama.
- **Şikayet:** kullanıcı, mesaj, paylaşım, işletme ve mini uygulama şikayet edilebilir; şikayetler
  panele düşer.
- **Panel hesapları:** her yönetici kendi hesabıyla, parola ve iki adımlı doğrulamayla (doğrulama
  uygulaması ya da kurtarma kodu) girer. Beş rol: sahip, inceleyen, operatör, destek, denetçi.
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
- **Anlık bildirim (push), sesli mesaj, uygulama içi sesli/görüntülü arama yok.** Görüntülü görüşme
  düğmesi sohbete bir Jitsi bağlantısı gönderir.
- **Uçtan uca şifreleme yok.** Mesajlar aktarımda TLS ile korunur, sunucuda düz metin saklanır.
- **İçerik kaldırma ve yaş doğrulama yok.** Şikayet edilen mesaj ya da paylaşım panelden
  kaldırılamaz, yalnızca hesap askıya alınabilir. Kayıtta yaş doğrulanmaz.
- **Geliştirici ve işletme hesapları yok.** Panel hesapları VADO yöneticileri içindir; paketleri
  geliştiricinin kendisi yükleyemez, işletme sahibi kendi kaydını yönetemez (işletme girişi 2.5'in
  işi). Paket geliştirici anahtarıyla imzalanmaz.
- **Mini uygulamaya kimlik belirteci, parametreli QR ve bildirim yok.** Mini uygulamanın kendi
  sunucusu kullanıcıyı VADO'dan doğrulayamaz; QR kodu masa numarası gibi bir parametre taşıyamaz.
- **Mini uygulamalarda WebRTC kapatılamıyor.** Tarayıcılar WebRTC bağlantılarını güvenlik
  politikasına bağlamıyor: kötü niyetli bir paket, bildirmediği bir sunucuya veri gönderebilir.
  Yükleme incelemesi bunu yalnızca işaretler; kalıcı çözüm yerel kod gerektirir
  (bkz. [SECURITY.md](SECURITY.md), bilinen sınırlar).
- **Hukuki metinler taslaktır.** Kullanım Koşulları ve KVKK Aydınlatma Metni bir hukukçu tarafından
  yazılmalıdır (bkz. [docs/TURKIYE_UYUM.md](docs/TURKIYE_UYUM.md)).

## Neyi denedik, neyi denemedik

Denendi (bu depodaki kodla, gerçek PostgreSQL üzerinde):

- 544 otomatik test: sözleşmeler, API (gerçek veritabanı ve gerçek WebSocket bağlantılarıyla), mini
  uygulama kitaplığı ve mobil uygulamanın telefondan bağımsız mantığı. Paket testleri bozuk ve kötü
  niyetli zip arşivleri yükler, depodaki dosyaları bozar ve değişmezlik kurallarını doğrudan SQL ile
  zorlar; sarmalayıcı belgenin betiği, tarayıcıya gönderilen metniyle çalıştırılır. Koruma
  kurallarının 50'si tek tek bozuldu; testler hepsini yakaladı.
- Tarayıcıda uçtan uca sekiz senaryo, toplam 169 adım: kayıt, kişi ekleme, iki kullanıcı arasında
  anlık sohbet, grup, Anlar, QR, şikayet, oturumu uzaktan kapatma, hesap silme, yeni cihaz uyarısı
  ve yeniden doğrulama; paketli mini uygulamanın sarmalayıcı belgenin içinde açılması, izin, ödeme,
  iki işletmenin aynı paketi ayrı verilerle kullanması, paketin dışarıya ve başka kayıtlara
  ulaşamaması, başka adrese gitme girişiminin istek gönderilmeden engellenmesi, sayfa yenileyen
  mini uygulamanın kapatılması, yeni sürümde iznin yeniden sorulması, geri alma ve acil kapatma;
  panelde paket yükleme, inceleme, yayın, toplu dağıtım ve geri çekme. Senaryolar hem geliştirme
  kipinde hem canlı derlemelerle çalıştırıldı.
- **Yalıtım ölçümü:** paketin açıldığı belgeden çıkış 59 denemeyle, Chromium 141 ve WebKit 2.52
  üzerinde, telefondaki köprünün Android ve iOS davranışı ile web önizlemesi öykünülerek ölçüldü;
  hiçbirinde paketin dışına istek çıkmadı. Aynı ölçüm, sarmalayıcının kısıtı kaldırıldığında dokuz
  yoldan isteğin çıktığını gösterdi. Açık kalan yollar (WebRTC, tam Chrome'daki iki yan kanal) bu
  ölçümle bulundu ve [SECURITY.md](SECURITY.md) içinde yazılı.
- **Canlı ortam düzeni:** derlenmiş API (canlı ayarlar, her kayıt kendi alt alan adında) ve canlı
  derlenmiş panel, depodaki Nginx örneğinin arkasında, TLS ile çalıştırıldı; paket panelden
  yüklendi, onaylandı, yayınlandı, mini uygulama açılıp ödeme alındı, başka adrese gitme girişimi
  engellendi ve sürüm geri çekildi.
- **2.3.0'dan geçiş:** 2.3.0'ın derlenmiş API'siyle yayınlanan paket, aynı veritabanı ve depoyla
  2.3.1'de yeni adres düzeninde açıldı; kullanıcı kimliği ve izin özeti değişmedi, yeni kitaplıkla
  derlenen sürüm dağıtıldı, 2.3.0'a geri dönülebildi. 2.3.0'ın web sürümünün yeni sunucuyla mini
  uygulama açamadığı da görüldü. 2.2'den doğrudan 2.3.1'e geçiş yinelendi: eski mini uygulama
  kayıtları kapandı, paket yayınlanınca aynı kullanıcı kimliği, satıcı ve QR koduyla açıldı.
- **Yedekten dönüş:** veritabanı ve paket deposu yedeklendi, silindi, geri yüklendi ve denetlendi.
- Zip dosyası boş bir klasöre açılıp sıfırdan kuruldu; `npm run db:seed`, `npm run dev`,
  `npm run web` ve `npm run check` o kopyada çalıştırıldı.
- API'nin ve panelin Docker imajları canlı ortam ayarlarıyla çalıştırıldı; çalışan API'de
  veritabanı bağlantıları koparıldı ve Redis yeniden başlatıldı.
- Mobil uygulamanın Android ve iOS için JavaScript paketleri derlendi.

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
- **Parmak izi, yüz ve uygulama kilidi.** Cihazın kilidini soran bölüm yalnızca derlendi; sunucu
  tarafı ve SMS koduyla yeniden doğrulama ise uçtan uca denendi.
- **Mağaza paketi.** EAS ile APK ya da mağaza paketi üretilmedi.
- **`npm run db:up`.** Derleme ortamından Docker Hub'a erişilemediği için veritabanını Docker ile
  başlatan komut çalıştırılamadı; dosyanın yapısı doğrulandı, denemeler doğrudan kurulu PostgreSQL 16
  ile yapıldı.
- **Canlı sunucu.** Docker Compose kurulumunun tamamı ve sertifika (certbot) adımları gerçek bir
  sunucuda çalıştırılmadı.
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
