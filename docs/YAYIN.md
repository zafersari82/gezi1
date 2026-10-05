# Yayın

Bu belge VADO'yu gerçek kullanıcılara açmak için gerekenleri anlatır: sunucunun kurulması, SMS'in
bağlanması ve mobil uygulamanın mağazalara hazırlanması. Kendi bilgisayarınızda denemek için
[KURULUM.md](KURULUM.md) yeterlidir.

Yayından önce [TURKIYE_UYUM.md](TURKIYE_UYUM.md) ve [YOL_HARITASI.md](YOL_HARITASI.md) belgelerini
okuyun. Kod çalışıyor olsa da hukuki metinler, SMS sözleşmesi ve ödeme kuruluşu gibi kodla
çözülmeyen işler vardır.

## Ne nerede çalışır

| Parça               | Nerede                                        | Adres örneği                   |
| ------------------- | --------------------------------------------- | ------------------------------ |
| API                 | Sunucunuzda, Docker içinde                    | `https://api.ornek.com`        |
| Yönetim paneli      | Aynı sunucuda, Docker içinde                  | `https://panel.ornek.com`      |
| PostgreSQL ve Redis | Aynı sunucuda, Docker içinde                  | Dışarıya kapalı                |
| Mobil uygulama      | Kullanıcının telefonunda (mağazalardan)       | —                              |
| Mini uygulamalar    | Sunucunuzda; paket olarak yüklenir, API sunar | `https://api.ornek.com/apps/…` |

## 1. Sunucu

### Gerekenler

- Linux bir sunucu (başlangıç için 2 çekirdek, 4 GB bellek yeterlidir) ve üzerinde
  [Docker Engine](https://docs.docker.com/engine/install/) ile Docker Compose eklentisi.
- Sunucuyu gösteren iki alan adı (API ve panel için) ve bunlar için TLS sertifikası. Mini
  uygulamaları ayrı alt alan adlarından sunacaksanız (önerilir) ayrıca bir joker alan adı
  (`*.mini.ornek.com`) ve joker sertifika.
- Doğrulama kodlarını gönderecek bir SMS firmasıyla sözleşme (bkz. [SMS](#2-sms)).

### Kurulum

Depoyu sunucuya kopyalayın ve ayar dosyasını oluşturun:

```bash
cp infra/.env.production.example infra/.env.production
nano infra/.env.production
```

| Değişken                     | Ne yazılır                                                      |
| ---------------------------- | --------------------------------------------------------------- |
| `POSTGRES_PASSWORD`          | Veritabanı şifresi; rastgele bir değer                          |
| `VADO_PUBLIC_URL`            | API'nin dışarıdan görünen adresi: `https://api.ornek.com`       |
| `VADO_CORS_ORIGINS`          | Panelin adresi; birden çoksa virgülle ayrılır                   |
| `VADO_OTP_KEYS`              | Doğrulama kodu anahtarı; dosyadaki örnek komutla üretilir       |
| `VADO_QR_KEYS`               | QR kodu anahtarı; dosyadaki örnek komutla üretilir              |
| `VADO_OPENID_KEY`            | Mini uygulama kimliği anahtarı; üretin ve ayrıca yedekleyin     |
| `VADO_ADMIN_API_KEY`         | En az 32 karakter rastgele değer: `openssl rand -hex 32`        |
| `VADO_SMS_WEBHOOK_URL`       | SMS aracı servisinizin adresi                                   |
| `VADO_SMS_WEBHOOK_SECRET`    | Aracı servisle paylaşılan gizli değer                           |
| `VADO_PAYMENT_MODE`          | `sandbox` (deneme ödemesi) ya da `provider` (ödeme kapalı)      |
| `VADO_RATE_LIMIT_PER_MINUTE` | IP başına dakikadaki istek sınırı; kullanıcı arttıkça yükseltin |
| `VADO_PACKAGE_MAX_MB`        | Yüklenebilecek mini uygulama paketinin en büyük boyutu (1-50)   |
| `VADO_APPS_ORIGIN`           | İsteğe bağlı: `https://{app}.mini.ornek.com` (aşağıda)          |

Üç imza anahtarı birbirinden bağımsızdır. `VADO_OPENID_KEY` değiştirilmez: değişirse mini
uygulamaların gördüğü kullanıcı kimlikleri (`openId`) değişir. Doğrulama kodu ve QR anahtarları ise
sistem çalışırken, eski kodları geçersiz kılmadan değiştirilebilir. Anahtarların biçimi, denetimi
ve değiştirme adımları [ANAHTARLAR.md](ANAHTARLAR.md) belgesindedir.

Ardından her şeyi başlatın:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production up -d --build
```

İlk seferde imajların derlenmesi birkaç dakika sürer. Sırayla şunlar olur: PostgreSQL ve Redis
başlar, `migrate` servisi veritabanı şemasını kurar ve çıkar, API başlar, API sağlıklı olunca panel
başlar. Eksik bir değişken varsa Compose hangisi olduğunu söyleyip durur; API de canlı ortamda demo
modu açıkken, eksik ya da zayıf anahtarla veya SMS ayarı olmadan başlamayı reddeder.

Denetleyin:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production ps
curl http://127.0.0.1:4000/health      # {"status":"ok","version":"2.4.0"}
curl -i http://127.0.0.1:3000/healthz  # 200
```

API ve panel yalnızca sunucunun kendisinden (`127.0.0.1`) erişilebilir; dışarıya bir sonraki
adımdaki ters vekil açar.

### İlk panel hesabı

Panelde varsayılan hesap ya da parola yoktur. İlk sahip hesabını sunucuda, komut satırından açın:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production \
  run --rm api node dist/cli/admins.js create --username deniz --name "Deniz Arslan" --role owner
```

Komut geçici parolayı bir kez yazar (`Geçici parola: abcd-efgh-…`). Sahip panelde bu parolayla
girer; ilk girişte telefonundaki doğrulama uygulamasıyla (Google Authenticator, Microsoft
Authenticator ya da parola yöneticisi) iki adımlı doğrulamayı kurar, kurtarma kodlarını kaydeder ve
parolasını değiştirir. Diğer yöneticilerin hesaplarını panelde "Panel hesapları" sayfasından açar.
Paket onayı için en az iki hesap gerekir: sürümü yükleyen ya da gönderen onu onaylayamaz.

Aynı komut, panele erişimi kalmayan bir sahip için de kullanılır:

| Komut                                      | Ne yapar                                                       |
| ------------------------------------------ | -------------------------------------------------------------- |
| `admins.js list`                           | Hesapları, rollerini ve durumlarını listeler                   |
| `admins.js reset-password --username <ad>` | Geçici parola verir, kilidi açar, oturumları kapatır           |
| `admins.js reset-2fa --username <ad>`      | İkinci adımı sıfırlar; hesap bir sonraki girişte yeniden kurar |

Geliştirmede aynı komut `npm run admins -- <komut>` biçimindedir. Şema yükseltilmemişse komut
çalışmaz ve önce şemayı yükseltmenizi söyler. Etkin sahip hesabı yokken API başlarken günlüğe uyarı
yazar.

### Alan adı ve TLS

`infra/nginx/vado.conf.example` dosyası Nginx için hazır bir örnektir: API ve paneli iki alan adına
bağlar, gerçek zamanlı bağlantı için WebSocket yükseltmesini yapar ve `/v1/admin/` yolunu internete
kapatır (panel bu uç noktalara sunucunun içinden ulaşır).

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo cp infra/nginx/vado.conf.example /etc/nginx/sites-available/vado.conf
sudo nano /etc/nginx/sites-available/vado.conf   # alan adlarını değiştirin
sudo ln -s /etc/nginx/sites-available/vado.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.ornek.com -d panel.ornek.com
sudo nginx -t && sudo systemctl reload nginx
```

Sertifikalar henüz yokken Nginx örnek dosyadaki `ssl_certificate` satırları yüzünden başlamaz; önce
`certbot certonly --standalone -d api.ornek.com -d panel.ornek.com` ile sertifikaları alıp sonra
dosyayı etkinleştirebilirsiniz.

Paneli mümkünse yalnızca ofis ya da VPN adreslerine açın (örnek dosyadaki `allow` / `deny`
satırları). Panelin kendi girişi kişisel hesaplar ve iki adımlı doğrulamadır; oturum çerezi canlı
ortamda yalnızca HTTPS üzerinden gönderilir (`Secure`), bu yüzden panel TLS olmadan çalışmaz.

Örnek dosyada dikkat edilecek iki yer:

- **Yükleme sınırı.** Mini uygulama paketleri panelden yüklenir. Nginx'in varsayılan gövde sınırı
  1 MB'tır; örnek dosya panel için `client_max_body_size 8m` yazar. `VADO_PACKAGE_MAX_MB` değerini
  yükseltirseniz bu satırı da yükseltin. Sınır küçük kalırsa panel yüklemede "Yükleme panele
  ulaşmadan kesildi" iletisini gösterir.
- **Güvenlik başlıkları.** Mini uygulamaların tarayıcıdaki sınırlarını API'nin gönderdiği başlıklar
  çizer. API'nin sunucu bloğuna `add_header` ile `Content-Security-Policy` gibi başlıklar eklemeyin,
  `proxy_hide_header` ile de gizlemeyin; `/apps/` yolunun altında yönlendirme de yapmayın.

### Mini uygulamalar için alt alan adı (önerilir)

Varsayılan kurulumda mini uygulamalar API'nin adresinden, kayda özel bir yolun altından sunulur
(`https://api.ornek.com/apps/<kayıt>/…`): kabuğun açtığı sarmalayıcı belge `wrapper/<özet>/`,
paketin dosyaları `files/<özet>/` altındadır. `VADO_APPS_ORIGIN` ayarlanırsa her uygulama kaydı
kendi alt alan adını alır (`https://<kayıt>.mini.ornek.com/…`): tarayıcı, kayıtları birbirinden ve
API'den kaynak (origin) düzeyinde de ayırır; sarmalayıcı belge de API'nin kaynağından çıkar.
Gerekenler:

1. `*.mini.ornek.com` için sunucuyu gösteren joker bir DNS kaydı.
2. Joker sertifika. Let's Encrypt joker sertifikayı yalnızca DNS doğrulamasıyla verir:
   `sudo certbot certonly --manual --preferred-challenges dns -d '*.mini.ornek.com'`
   (DNS sağlayıcınızın certbot eklentisi varsa yenileme kendiliğinden yapılır).
3. `infra/.env.production` içinde `VADO_APPS_ORIGIN=https://{app}.mini.ornek.com`. `{app}` yazıldığı
   gibi kalır; API yerine kaydın kimliğini koyar. Bu alan adı API'nin alan adını içermemelidir
   (`api.mini.ornek.com` olmaz).
4. Nginx örneğinin sonundaki, yorum satırı olarak duran iki `server` bloğunu açın.

Ayarı sonradan açmak ya da kapatmak güvenlidir: adresler değişir, kabuk yeni adresi bir sonraki
açılışta alır; kullanıcı kimlikleri, izinler ve cihazdaki veriler kayda bağlı olduğu için etkilenmez.

### Güncelleme

Yeni sürümün dosyalarını sunucuya alın ve aynı komutu yeniden çalıştırın:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production up -d --build
```

`migrate` servisi yeni şema dosyalarını uygular, ardından API ve panel yeni sürümle yeniden başlar.
API kapanırken açık bağlantıları düzgünce kapatır; uygulamalar kendiliğinden yeniden bağlanır.
Güncellemeden önce yedek alın. Ayar geçersizse ya da şema uygulanamazsa API başlamaz ve sorun
giderilene kadar kapalı kalır; `.env.production` dosyasındaki değişiklikleri önce denetleyin.

**2.1 ve öncesinden yükseltirken** önce imza anahtarlarını yeni düzene geçirin:
[ANAHTARLAR.md](ANAHTARLAR.md#21-ve-öncesinden-geçiş). Geçiş yapılmadan yukarıdaki komut eksik
değişkeni söyleyip durur; çalışan sürüme dokunmaz.

### 2.3.1'den 2.4'e geçiş

2.4 ile paneldeki ortak kullanıcı adı ve şifre kalkar; her yönetici kendi hesabıyla ve iki adımlı
doğrulamayla girer. İki şema dosyası eklenir (`0004`, `0005`); mobil uygulama, mini uygulama
paketleri ve Nginx ayarı değişmez.

1. **Yedek alın** (aşağıda, "Yedek"). Geri dönüş yalnızca yedekten yapılabilir: 2.3.1 yükseltilmiş
   veritabanında başlar, ama yeni kural incelemeye göndereni istediği için 2.3.1 paket sürümünü
   incelemeye gönderemez.
2. **`infra/.env.production` dosyasından `VADO_PORTAL_USER` ve `VADO_PORTAL_PASSWORD` satırlarını
   silin.** Hâlâ tanımlıysa canlı panel nedenini söyleyerek 503 döner. Yeni zorunlu ayar yoktur.
3. **Güncelleyin:** `docker compose … up -d --build`. `migrate` servisi iki dosyayı uygular.
4. **İlk sahibi açın** ("İlk panel hesabı", yukarıda) ve diğer yöneticilerin hesaplarını panelden
   açın.
5. **Eski kayıtlar** olduğu gibi kalır; 2.3.1'de yapılan işlemler "Ortak panel hesabı (2.3)" adıyla
   görünür. 2.3.1'de incelemeye gönderilmiş, karar bekleyen sürümün göndereni bilinmez: önce bir
   hesap sürüm sayfasındaki "Yeniden incelemeye gönder" düğmesiyle gönderir, sonra başka bir hesap
   onaylar.

### 2.3.0'dan 2.3.1'e geçiş

2.3.1 ile kabuk paketi doğrudan değil, VADO'nun sarmalayıcı belgesinin içindeki çerçevede açar.
Veritabanı şeması ve ayarlar değişmedi; yükseltme komutu aynıdır. Sıra önemlidir:

1. **Önce sunucu, web önizlemesiyle birlikte.** API'yi ve (yayınlıyorsanız) web sürümünü aynı anda
   güncelleyin. Mini uygulamaların adresleri değişir (`/apps/<kayıt>/wrapper/…` ve
   `/apps/<kayıt>/files/…`); 2.3.0'ın web sürümü yeni sunucuyla mini uygulama açamaz.
2. **Telefon uygulamasını güncelleyin.** 2.3.0 uygulaması Android'de paketlenmiş mini uygulamaların
   köprüsünü çalıştıramaz (2.3.0'daki bir hata; bkz. CHANGELOG). 2.3.0 uygulamasının iOS'ta yeni
   sunucuyla çalışması beklenir ama denenmedi.
3. **Paketleri yeni kitaplıkla yeniden yükleyin.** Mini uygulamaları bu sürümdeki
   `@vado/miniapp-sdk` ile yeniden derleyin, yeni bir sürüm numarasıyla yükleyin, onaylayın ve
   yayınlayın. Eski kitaplıkla derlenmiş paketler web önizlemesinde ve iOS'ta çalışır, Android'de
   köprüyü kullanamaz. Bu sırada paketin "tek belge" kuralına uyduğunu da denetleyin: sayfayı
   yenileyen ya da başka bir HTML dosyasına geçen mini uygulama artık kapatılır
   ([MINI_UYGULAMA_GELISTIRME.md](MINI_UYGULAMA_GELISTIRME.md#paketin-içinde-neler-çalışır)).
4. Nginx ayarında değişiklik gerekmez. Paketlerin önünde bir CDN varsa `/apps/…/wrapper/…`
   yanıtlarının ve paketlerin giriş belgelerinin önbelleklenmediğini doğrulayın (API bunları
   `cache-control: no-cache` ile gönderir).

### 2.2'den 2.3'e geçiş

2.3 ile mini uygulamalar geliştiricinin sunucusundan değil, VADO'ya yüklenmiş paketlerden açılır.
Yükseltme komutu aynıdır; yeni zorunlu ayar yoktur. Bilmeniz gerekenler:

1. **Yedek alın.** Şema yükseltmesi (`0003_miniapp_packages.sql`) geri alınamaz; 2.2'ye dönmek
   için yükseltme öncesi veritabanı yedeği gerekir.
2. **Adresle açılan kayıtlar kullanıcılara kapanır.** 2.2'de kaydedilmiş mini uygulamalar silinmez
   ama canlı ortamda artık çalışmaz: Keşfet'te görünmez, açılamaz, ödeme alamaz, QR kodu
   "kullanılamıyor" der. Panelin genel bakışı kaç kaydın bu durumda olduğunu gösterir; kayıtların
   kendisi, satıcıları, geçmiş ödemeler ve şikayetler yerinde durur.
3. **Her kaydı paketine kavuşturun.** Mini uygulamanın derlenmiş hâlini paket olarak yükleyin,
   inceleyip onaylayın ve **aynı kaydın** sayfasından yayınlayın
   ([MINI_UYGULAMA_GELISTIRME.md](MINI_UYGULAMA_GELISTIRME.md)). Kayıt aynı kimlikle yeniden açılır:
   kullanıcıların o mini uygulamadaki kimliği (`openId`), bağlı satıcılar ve basılmış QR kodları
   değişmez. Kullanıcıya izinler bir kez yeniden sorulur.
4. **Kesintiyi kısaltmak için** paketleri yükseltmeden hemen sonra, kullanıcılara duyurmadan önce
   yayınlayın. Yükseltme ile yayın arasındaki sürede o mini uygulamalar kapalıdır.
5. Paketlerin dosyaları yeni bir birimde (`vado_packages`) durur; yedeğinize ekleyin (aşağıda).
6. **Mobil uygulamayı birlikte güncelleyin.** 2.2 uygulamasında 2.3 sunucusundaki mini uygulamalar
   çalışmaz (kayıt, kişiler ve sohbet çalışır). Uygulamanın yeni sürümü mağazada yayına girmeden
   sunucuyu yükseltirseniz mini uygulamalar eski uygulamada kullanılamaz.
7. Nginx kullanıyorsanız panelin sunucu bloğuna `client_max_body_size` ekleyin (bkz. "Alan adı ve
   TLS"); yoksa 1 MB'tan büyük paketler yüklenemez.

Mini uygulamanın kodunda gereken değişiklikler: kökte bir `vado.app.json` bildirim dosyası,
göreli adresler (Vite'ta `base: "./"`), tarayıcı deposu yerine `vado.storage` ve işletmeye özel
değerler için ayar alanları. Kendi sunucunuzdaki API'ye bağlanıyorsa adresini bildirim dosyasındaki
`network` listesine yazın.

### Yedek

Üç şey yedeklenir: veritabanı, yüklenen fotoğraflar ve mini uygulama paketleri. Sırayla alın:
önce veritabanı, sonra dosyalar. Paket deposuna yalnızca ekleme yapıldığı için sonradan alınan
dosya yedeği, veritabanı yedeğinin gösterdiği her dosyayı içerir.

```bash
# Veritabanı
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production \
  exec -T postgres pg_dump -U vado -Fc vado > vado-$(date +%F).dump

# Fotoğraflar (vado_media birimi)
docker run --rm -v vado_media:/data -v "$PWD":/backup alpine \
  tar czf /backup/vado-media-$(date +%F).tar.gz -C /data .

# Mini uygulama paketleri (vado_packages birimi)
docker run --rm -v vado_packages:/data -v "$PWD":/backup alpine \
  tar czf /backup/vado-packages-$(date +%F).tar.gz -C /data .
```

Geri yüklemek için:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production \
  exec -T postgres pg_restore -U vado -d vado --clean --if-exists < vado-2026-10-04.dump

docker run --rm -v vado_packages:/data -v "$PWD":/backup alpine \
  tar xzf /backup/vado-packages-2026-10-04.tar.gz -C /data
```

Geri yüklemeden ya da depoyu başka bir diske taşıdıktan sonra paket deposunu denetleyin:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production \
  exec api node dist/cli/packages.js verify
```

Komut, veritabanındaki her sürümün dosyalarını depoda arar ve özetlerini yeniden hesaplar; hiçbir
şeyi değiştirmez, API çalışırken de kullanılabilir. Sorun yoksa "Paket deposu veritabanıyla
tutarlı." yazar; eksik ya da bozulmuş dosyaları sürümü ve yoluyla listeler ve 1 koduyla çıkar. Eksik
dosyası olan bir sürüm sunulmaz; depoyu, veritabanıyla aynı ana ait bir yedekten geri yükleyin.

Yedekleri sunucunun dışında saklayın ve geri yüklemeyi en az bir kez deneyin. Kişisel veri içeren
yedekler de saklama ve silme kurallarına tabidir (bkz. TURKIYE_UYUM.md).

### Günlükler

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production logs -f api
```

API günlükleri JSON satırlarıdır. İstek gövdeleri, doğrulama kodları, oturum belirteçleri ve
adreslerin sorgu bölümü (`?q=…`) günlüğe yazılmaz; istemcinin IP adresi yazılır. Günlükleri ne kadar
süre saklayacağınızı TURKIYE_UYUM.md belgesindeki başlıklara göre belirleyin.

PostgreSQL ya da Redis yeniden başlarsa API kapanmaz: günlüğe "Boştaki veritabanı bağlantısı koptu"
ya da "Redis'e ulaşılamıyor" kaydı düşer ve bağlantı kendiliğinden yenilenir. Veritabanı kapalıyken
istekler hata döner. Redis kapalıyken mesajlar kaydedilir ama başka bir API sürecine bağlı
kullanıcılara anlık bildirim gecikir ya da hiç gitmez; mesajı sohbet yenilendiğinde görürler.

### Büyüdükçe

- **Birden çok API süreci.** `REDIS_URL` tanımlıyken gerçek zamanlı olaylar tüm süreçlere dağılır;
  örnek kurulumda Redis hazırdır. Ancak fotoğraflar ve mini uygulama paketleri yerel diske
  yazıldığı için süreçlerin aynı diskleri (birimleri) görmesi gerekir. Birden çok sunucuya çıkmadan
  önce S3 uyumlu depolama sağlayıcıları yazılmalıdır (bkz. YOL_HARITASI.md).
- **Paketlerin önüne önbellek.** Paket dosyalarının adresi içerik özetini taşır ve yanıtlar
  `immutable` olarak işaretlenir; önlerine bir CDN konabilir. Sarmalayıcı belge ve paketin giriş
  belgesi ise `no-cache` ile gönderilir: önbellek her istekte API'ye sormalı, kendi kopyasını
  sormadan sunmamalıdır. Bir sürümü geri çektiğinizde CDN'deki kopyaları da temizleyin: API
  dosyaları sunmayı keser ama önbellek kendi kopyasını tutar.
- **İstek sınırı.** Mobil operatörler çok sayıda kullanıcıyı aynı IP adresinden çıkarır. Kullanıcı
  sayısı arttıkça `VADO_RATE_LIMIT_PER_MINUTE` değerini yükseltin; yoksa gerçek kullanıcılar
  "çok fazla istek" hatası görür.
- **Veritabanı.** Yönetilen bir PostgreSQL hizmetine geçerseniz Compose dosyasından `postgres`
  servisini çıkarıp `DATABASE_URL` değerini o hizmete çevirin. `pgcrypto` gibi bir eklenti gerekmez.

## 2. SMS

VADO doğrulama kodunu doğrudan bir SMS firmasına göndermez; sizin yazacağınız küçük bir aracı
servise iletir. Böylece SMS firması değişse de VADO'nun kodu değişmez.

API her kod için `VADO_SMS_WEBHOOK_URL` adresine şu isteği gönderir:

```http
POST /vado-sms HTTP/1.1
Authorization: Bearer <VADO_SMS_WEBHOOK_SECRET>
Content-Type: application/json

{ "phone": "+905551234567", "code": "301430", "message": "VADO doğrulama kodun: 301430. Bu kodu kimseyle paylaşma." }
```

Aracı servis 10 saniye içinde 2xx durum koduyla yanıt vermelidir; vermezse kullanıcı hata görür ve
yeniden dener. Servisin yapacağı iş üç adımdır: `Authorization` başlığını doğrulamak, `message`
metnini SMS firmasının API'sine göndermek, sonucu durum koduyla bildirmek. Node.js ile örnek:

```js
import { createServer } from "node:http";

const SECRET = process.env.VADO_SMS_WEBHOOK_SECRET;

createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${SECRET}`) {
    response.writeHead(401).end();
    return;
  }
  let body = "";
  for await (const chunk of request) body += chunk;
  const { phone, message } = JSON.parse(body);

  // SMS firmanızın API'sini burada çağırın; adres ve alan adları firmaya göre değişir.
  const sent = await fetch("https://api.sms-firmaniz.example/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.SMS_API_KEY}`,
    },
    body: JSON.stringify({ to: phone, text: message, sender: "VADO" }),
  });
  response.writeHead(sent.ok ? 200 : 502).end();
}).listen(8080);
```

Türkiye'de toplu SMS için gönderici adınızın (başlık) SMS firması üzerinden kaydedilmesi gerekir;
firma bu süreçte sizden şirket belgeleri ister. Aracı servisi API ile aynı sunucuda çalıştırıp
yalnızca iç ağdan erişilebilir tutun.

## 3. Mobil uygulama

Uygulama [EAS Build](https://docs.expo.dev/build/introduction/) ile paketlenir; bilgisayarınıza
Android Studio ya da Xcode kurmanız gerekmez. Bu adımlar bu depoda yazıldı ama **denenmedi**
(paketleme bir Expo hesabı gerektirir); ilk derlemede küçük düzeltmeler gerekebilir.

### Hazırlık

1. `apps/mobile/eas.json` içindeki `EXPO_PUBLIC_API_URL` değerlerini kendi API adresinizle
   değiştirin. Canlı derlemeler yalnızca `https` adreslerine bağlanabilir.
2. `apps/mobile/app.json` içindeki `ios.bundleIdentifier` ve `android.package` değerlerini kendi
   alan adınıza göre değiştirin (`com.sirketiniz.vado`). Bu değerler mağazaya ilk yüklemeden sonra
   değiştirilemez.
3. [expo.dev](https://expo.dev) üzerinde ücretsiz bir hesap açın.

```bash
npm install -g eas-cli
cd apps/mobile
eas login
eas init            # projeyi Expo hesabınıza bağlar, app.json'a proje kimliğini yazar
```

### Deneme sürümü (Android APK)

```bash
eas build --profile preview --platform android
```

Derleme Expo'nun sunucularında yapılır ve bitince indirilebilir bir APK bağlantısı verir. APK'yı
telefona kurup gerçek sunucunuza karşı deneyin: kamera ile QR okutma, fotoğraf seçme, konum izni ve
klavye davranışı yalnızca gerçek cihazda görülebilir.

### Mağaza sürümü

```bash
eas build --profile production --platform android   # Google Play için AAB
eas build --profile production --platform ios       # App Store için (Apple Developer hesabı gerekir)
eas submit --platform android                       # isteğe bağlı: mağazaya yükler
```

Mağazaların isteyecekleri:

- **Gizlilik politikası adresi** ve veri güvenliği formu (Google Play) ile gizlilik etiketleri
  (App Store): toplanan veriler telefon numarası, ad, profil fotoğrafı, mesajlar, fotoğraflar ve
  yaklaşık konumdur (yalnızca kullanıcının izin verdiği mini uygulamalarla paylaşılır).
- **Hesap silme.** Uygulamada vardır: Ben › Gizlilik › Hesabımı sil. Google Play ayrıca web
  üzerinden hesap silme talebi için bir adres ister; bunun için bir sayfa hazırlamanız gerekir.
- **İnceleme için deneme hesabı.** İnceleme ekibi SMS alamaz. Canlı sunucuda demo modu kapalı
  olduğundan, inceleme için sabit kodla giriş yapabilen bir deneme numarası tanımlama özelliği
  eklenmelidir (bkz. YOL_HARITASI.md).
- **İçerik bildirme ve engelleme.** Kullanıcıların içerik paylaştığı uygulamalarda zorunludur;
  uygulamada vardır (şikayet et, engelle) ve şikayetler panelde görünür. Şikayetleri makul sürede
  inceleyecek bir kişi belirleyin.

Sürüm numarasını yükseltirken `package.json` dosyalarındaki ve `app.json` içindeki sürüm aynı
olmalıdır; `npm run conventions` paketler arasındaki farkı yakalar. Derleme numaralarını
(`versionCode`, `buildNumber`) EAS kendisi artırır.

### Web sürümü

`npm run build -w @vado/mobile` komutu uygulamanın tarayıcı sürümünü `apps/mobile/dist` klasörüne
üretir. Bu sürüm önizleme ve deneme içindir: kamera yoktur ve oturum belirteci tarayıcı deposunda
saklanır. Kullanıcılara açacaksanız API'nin `VADO_CORS_ORIGINS` listesine adresini ekleyin; mini
uygulama paketleri yalnızca bu listedeki adreslerin içinde (çerçevede) gösterilebilir.

`EXPO_PUBLIC_API_URL` derleme sırasında koda gömülür. Kendi bilgisayarınızda adresi değiştirip
yeniden derliyorsanız derleyicinin önbelleğini temizleyin, yoksa eski adres çıktıda kalır:

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=https://api.ornek.com npx expo export --platform web --output-dir dist --clear
```

## 4. Mini uygulamalar

Canlı ortamda yalnızca VADO'ya yüklenmiş ve onaylanmış paketler çalışır; geliştiricinin kendi
sunucusundan açılan kayıtlar yalnızca geliştirme ortamında vardır ve canlıda açılamaz
(`VADO_MINIAPP_DEV_MODE`, örnek Compose dosyasında `false` olarak sabittir).

Bir mini uygulamayı yayına almak panelde dört adımdır; ayrıntısı
[MINI_UYGULAMA_GELISTIRME.md](MINI_UYGULAMA_GELISTIRME.md) belgesindedir:

1. **Paketler › Yeni paket** ve **Sürümü yükle**: geliştiricinin `npm run miniapp:pack` ile ürettiği
   zip dosyası.
2. Sürümün sayfasında inceleme: istenen yetkiler, bağlanılacak adresler, otomatik bulgular, dosyalar
   ve önceki onaylı sürüme göre fark. Uygunsa **İncelemeye gönder** ve **Sürümü onayla**.
3. **Mini uygulamalar › Yeni kayıt**: işletmenin vitrini. Kaydın sayfasından onaylı sürümü,
   işletmenin ayarlarıyla yayınlayın ve kaydı doğrulayın.
4. Ödeme alacaksa satıcıyı bağlayın.

Örnek paketi denemek için depodan üretebilirsiniz (kendi bilgisayarınızda):

```bash
npm run build -w @vado/miniapp-appointment
npm run miniapp:pack -- miniapps/appointment/dist    # randevu-1.0.0.zip
```

İşletirken:

- **Acil kapatma.** Sorunlu bir kaydı **Kullanıma kapat** ile, sorunlu bir sürümü **Onaylı sürümü
  geri çek** ile kapatın. İkincisi o sürümü yayınlayan bütün kayıtları hemen kapatır; isterseniz
  kayıtları önceki yayınlarına döndürür.
- **Kim inceler?** Bu sürümde panelde tek hesap vardır: paketi yükleyen kişi onu onaylayabilir.
  İncelemeyi kimin yapacağını belirleyin ve panel erişimini bu kişilerle sınırlayın.
- **Paket boyutu.** Varsayılan sınır 5 MB'tır ve geçicidir: kesin değer, yavaş bağlantıda ve
  gerçek cihazlarda açılış süresi ölçülerek belirlenmelidir.
- **Depo.** Paket dosyaları `vado_packages` biriminde durur, salt okunur yazılır ve hiç silinmez;
  yer kaplamaya devam ederler. Yedeğe ekleyin.

## Yayından önce

- [ ] `infra/.env.production` dolduruldu; anahtarlar rastgele, birbirinden farklı ve yedeklendi.
      `keys check` "Anahtarlar canlı ortam için geçerli." diyor (bkz. [ANAHTARLAR.md](ANAHTARLAR.md)).
- [ ] `https://api.ornek.com/health` dışarıdan yanıt veriyor; `https://api.ornek.com/v1/admin/overview`
      dışarıdan 404 veriyor.
- [ ] Panel giriş sayfası açılıyor; giriş parola ve ikinci adım istiyor. İlk sahip hesabı komut
      satırından açıldı, en az iki hesap var, her hesap kendi ikinci adımını kurdu ve kurtarma
      kodlarını sakladı. `VADO_PORTAL_USER` ve `VADO_PORTAL_PASSWORD` tanımlı değil.
- [ ] Gerçek bir telefona doğrulama kodu SMS olarak geliyor.
- [ ] Deneme APK'sı gerçek sunucuya bağlanıp mesaj gönderebiliyor, fotoğraf yükleyebiliyor.
- [ ] Veritabanı, fotoğraf ve paket deposu yedeği zamanlandı; geri yükleme bir kez denendi ve
      `packages.js verify` "tutarlı" dedi.
- [ ] Panelden 1 MB'tan büyük bir paket yüklenebiliyor (Nginx gövde sınırı).
- [ ] Bir uygulama kaydı gerçek telefonda açıldı; izin, ödeme ve kapatma denendi. Mini uygulama
      kendi sayfasının dışına çıkamıyor (bkz. [SECURITY.md](../SECURITY.md), bilinen sınırlar).
- [ ] Genel bakışta "Mini uygulama geliştirme kipi: Kapalı" yazıyor ve adresle açılan kayıt
      kalmadı ya da kapalı kalmaları kabul edildi.
- [ ] Kullanım Koşulları ve KVKK Aydınlatma Metni hukukçu tarafından yazıldı ve uygulamaya kondu
      (`apps/mobile/src/features/legal/documents.ts`, ardından `TERMS_VERSION` artırıldı).
- [ ] TURKIYE_UYUM.md içindeki maddeler bir hukukçuyla gözden geçirildi.
- [ ] Ödeme `sandbox` kipindeyken kullanıcıya gerçek ödeme alındığı izlenimi verilmiyor; gerçek
      ödeme açılmayacaksa ödeme yetkili mini uygulamalar yayına alınmadı.

## Bu belgedeki adımların ne kadarı denendi

2.4 için yinelenenler ve yeniler:

- **`docker-compose.prod.yml` dosyasının tamamı `up` ile çalıştırıldı** (resmî `postgres:16-alpine`
  ve `redis:7-alpine` imajlarıyla): `migrate` şemayı kurup çıktı, API ve panel sağlıklı açıldı,
  sahip hesabı yokken API günlüğe uyarı yazdı. "İlk panel hesabı" bölümündeki
  `run --rm api node dist/cli/admins.js create …` komutu aynen çalıştırıldı; geçici parolayla
  panelde ilk giriş, ikinci adımın gerçek TOTP koduyla kurulumu ve parola değişikliği tarayıcıda
  yapıldı. Panel ve API burada HTTPS'siz, yalnızca `127.0.0.1` üzerinden denendi.
- İki Dockerfile ile imajlar derlendi. Taban imaj resmî `node:22-bookworm-slim`'dir; bu ortamın ağ
  vekilinden geçebilmek için üzerine yalnızca vekilin kök sertifikası eklendi. API ve panel
  imajları canlı ortam ayarlarıyla çalıştırılıp 28 denetimden geçti: ilk sahibin kabın içindeki
  komutla açılması, ikinci adımın iki kap arasında kurulması, paketin bir kaptan yüklenip öteki
  kaptan (başka bir hesapla) onaylanması ve alt alan adıyla sunulması, kaplar arası Redis, panelin
  oturumsuz isteği giriş sayfasına göndermesi, eski panel değişkenleri tanımlıyken panelin 503
  vermesi, sağlık denetimleri, düzgün kapanış.
- **Nginx örneği gerçek bir Nginx (1.24, Ubuntu 24.04) ile çalıştırıldı**; isteğe bağlı alt alan
  adı blokları açıktı, sertifika kendinden imzalıydı. Arkasında derlenmiş API (canlı ayarlar, alt
  alan adı kipi) ve canlı derlenmiş panel vardı. Gerçek bir tarayıcıyla, TLS üzerinden: panelde
  ilk giriş ve ikinci adımın kurulumu (çerez `Secure`, `HttpOnly`, `SameSite=Strict`), 3 MB'lık
  paket yükleme, yükleyenin onaylayamaması ve ikinci hesabın onayı, yayın, SMS koduyla giriş,
  WebSocket, mini uygulamanın kendi alt alan adındaki sarmalayıcı belgeyle açılması, izin, ödeme,
  yalıtım, geri çekme; `/v1/admin/` yolunun dışarıdan 404 vermesi. Sertifika adımları (certbot)
  çalıştırılmadı.
- **2.3.1'den 2.4'e geçiş gerçek süreçlerle denendi** (28 denetim): 2.3.1'in derlenmiş API'si canlı
  ayarlarla veri üretti; 2.4 şema yükseltilmeden başlamadı, `migrate` iki dosyayı uyguladı; eski
  panel girişi reddedildi; kullanıcı oturumu, mini uygulamanın adresi, izin özeti ve kullanıcı
  kimliği değişmedi; ilk hesaplar komut satırından açıldı; eski kayıtlar korundu; incelemede
  bekleyen eski sürüm yeniden gönderilip başka bir hesapça onaylandı; `verify` tutarlı dedi. Aynı
  veritabanında 2.3.1 başladı ama incelemeye gönderme yapamadı: geri dönüş yedekten yapılır.
- Çalışan iki API sürecinde veritabanı bağlantıları koparıldı, Redis kapatılıp yeniden başlatıldı:
  süreçler ayakta kaldı, bağlantılar kendiliğinden yenilendi, mesajlaşma ve paket sunumu sürdü.
- **Yedekten dönüş tatbikatı yapıldı** (12 denetim). Veritabanı ve paket deposu bu belgedeki
  komutlarla yedeklendi, depo silindi, veritabanı dolu hâlinin üzerine geri yüklendi; `verify`
  tutarlı dedi ve paket aynı içerikle sunuldu. Depo boşken `verify` eksik dosyaları listeledi, API
  o dosyaları sunmadı.
- `npm run db:up` (geliştirme veritabanı ve Redis) Docker ile çalıştırıldı.
- **Mini uygulama yalıtımı iki tarayıcı motorunda ölçüldü** (2.3.1; Chromium 141 ve WebKit 2.52;
  ayrıntısı SECURITY.md, bilinen sınırlar). 2.4 bu alana dokunmadı, ölçüm yinelenmedi. Android
  System WebView ve iOS WKWebView'de ölçülmedi.
- Önceki sürümlerde denenenler (bu sürümde yinelenmedi): 2.3.0'dan 2.3.1'e ve 2.2'den 2.3.1'e geçiş,
  2.1'den anahtar geçişi ([ANAHTARLAR.md](ANAHTARLAR.md)).
- **Gerçek telefonda hiçbir şey denenmedi.** EAS ile mobil paketleme de denenmedi; Android ve iOS
  için JavaScript paketleri derlendi. Mini uygulama paketlerinin telefondaki kabukta (Android
  WebView, iOS WKWebView) açılması yalnızca derlendi; masaüstü tarayıcı motorlarında denendi.
- **Gerçek bir sunucuda kurulum** (alan adı, certbot, güvenlik duvarı) denenmedi.
