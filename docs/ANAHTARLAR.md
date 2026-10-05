# Anahtarlar

VADO dört şeyi gizli anahtarla imzalar: doğrulama kodlarının veritabanındaki özetini, QR kodlarını,
mini uygulamalara verilen kullanıcı kimliklerini (`openId`) ve 2.5'ten itibaren mini uygulamaların
sunucularına verilen kimlik belirteçlerini. Bu işlerin anahtarları birbirinden bağımsızdır. Bu belge eski sistemle farkı, anahtarların nasıl üretildiğini, 2.1'den
nasıl geçildiğini ve bir anahtarın nasıl değiştirildiğini anlatır.

Geliştirmede hiçbir şey yapmanız gerekmez: anahtar tanımlanmamışsa API sabit bir geliştirme
anahtarıyla çalışır ve önceki sürümle üretilmiş kimlikler değişmez. Aşağıdakiler canlı ortam içindir.

## Eski ve yeni sistem

|                            | 2.1 ve öncesi                                                                                        | 2.2                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Anahtar                    | Tek ana anahtar: `VADO_APP_SECRET`. Üç iş de ondan türetilen anahtarlarla yapılır.                   | Üç bağımsız aile: `VADO_OTP_KEYS`, `VADO_QR_KEYS`, `VADO_OPENID_KEY`.                                                      |
| Biri sızarsa               | Üçü de sızmış olur.                                                                                  | Yalnızca o aile etkilenir.                                                                                                 |
| Anahtar değiştirmek        | Üçü birlikte değişir: yoldaki kodlar ve basılmış QR kodları geçersiz olur, tüm `openId`'ler değişir. | Doğrulama kodu ve QR anahtarı ayrı ayrı değişir; eski anahtar belirlediğiniz güne kadar doğrular. `openId`'ler etkilenmez. |
| QR kodu                    | `vado://q/<veri>.<imza>`                                                                             | `vado://q/<veri>.<anahtar kimliği>.<imza>`. Eski biçim de okunur.                                                          |
| Canlıda başlangıç denetimi | `VADO_APP_SECRET` en az 32 karakter olmalı.                                                          | Üç aile de tanımlı, en az 256 bit, rastgele ve birbirinden farklı olmalı; değilse API başlamaz.                            |
| Oturumlar                  | Rastgele belirteç; veritabanında yalnızca özeti durur.                                               | Aynı. Oturumlar imza anahtarı kullanmaz; değiştirilecek bir oturum anahtarı yoktur.                                        |

## Dört aile

| Değişken             | Neyi korur                                         | Değiştirilir mi                                       |
| -------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| `VADO_OTP_KEYS`      | Doğrulama kodlarının veritabanındaki özeti         | Evet, istendiğinde. Kullanıcı fark etmez.             |
| `VADO_QR_KEYS`       | QR kodlarının imzası                               | Evet. Eski kodlar belirlediğiniz süre boyunca okunur. |
| `VADO_OPENID_KEY`    | Mini uygulamaların gördüğü kullanıcı kimliği       | Hayır. Değişirse bütün kimlikler değişir.             |
| `VADO_IDENTITY_KEYS` | Mini uygulama kimlik belirtecinin imzası (Ed25519) | Evet, istendiğinde. Mini uygulamalar fark etmez.      |

`VADO_OPENID_KEY` tek anahtardır; diğerleri **halkadır**: virgülle ayrılmış anahtarlar.

```bash
VADO_OTP_KEYS=k1:9f2c…
VADO_QR_KEYS=k2:51ab…,k1:c07e…:2027-01-31,legacy:3b00…
VADO_OPENID_KEY=784b…
VADO_IDENTITY_KEYS=k1:a41d…
```

- Her anahtar `kimlik:anahtar` biçimindedir. Anahtar 64 hex karakterdir (`openssl rand -hex 32`).
  Kimlik kısa bir addır (`k1`, `k2`…), gizli değildir ve imzanın içinde taşınır.
- **İlk anahtar imzalar.** Diğerleri yalnızca daha önce atılmış imzaları doğrular.
- Üçüncü alan, anahtarın doğrulamayı sürdüreceği son gündür. `k1:…:2027-01-31`, 31 Ocak 2027 gününün
  sonuna kadar (UTC; Türkiye saatiyle ertesi gün 03.00) doğrular, sonra kendiliğinden devre dışı
  kalır. Tarih yoksa anahtar halkadan silinene kadar doğrular.
- `legacy` ayrılmış bir kimliktir: 2.1 ve öncesinde üretilmiş, anahtar kimliği taşımayan imzaları
  doğrular.

## `keys` komutu

Anahtar üretir, eski sistemden geçirir, değiştirir ve denetler. Hiçbir dosyayı değiştirmez ve
veritabanına bağlanmaz; yazdırdığı satırları `.env` dosyasına siz yazarsınız.

| Nerede                        | Nasıl çalıştırılır                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Node.js kurulu bilgisayarda   | `npm run keys -- <komut> --from infra/.env.production`                                       |
| Yalnızca Docker olan sunucuda | `docker run --rm -i vado-api node dist/cli/keys.js <komut> --from - < infra/.env.production` |

`--from`, değişkenlerin okunacağı dosyadır. `vado-api` imajını `docker compose … up --build`
oluşturur; ondan önce gerekiyorsa `docker build -f apps/api/Dockerfile -t vado-api .` ile derleyin.
Aşağıdaki adımlarda kısa olsun diye yalnızca komutun adı yazıldı.

**Dosyayı değiştirdikten sonra, API'yi yeniden başlatmadan önce `check` çalıştırın.** Geçersiz
anahtarla API başlamaz ve dosya düzeltilene kadar kapalı kalır. Sunucuda `check` komutunu Compose
ile çalıştırmak en sağlamıdır: API'nin başlarken göreceği değerlerin aynısını denetler ve çalışan
kapsayıcılara dokunmaz.

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production \
  run --rm --no-deps api node dist/cli/keys.js check
```

| Komut           | Ne yapar                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `generate`      | Yeni kurulum için dört ailenin anahtarlarını üretir.                                                                                      |
| `migrate`       | `VADO_APP_SECRET` kullanan kurulumu yeni anahtarlara geçirir.                                                                             |
| `add identity`  | 2.4 ve öncesinden yükseltmede eksik olan kimlik belirteci halkasını üretir.                                                               |
| `rotate <aile>` | `otp`, `qr` ya da `identity` halkasına yeni bir imza anahtarı ekler; eskisi doğrulamayı sürdürür.                                         |
| `check`         | Anahtarları canlı ortamın kurallarıyla denetler; kimin imzaladığını, kimin ne zamana kadar doğruladığını gösterir. Anahtarları yazdırmaz. |

## Yeni kurulum

`generate` çıktısındaki dört satırı `infra/.env.production` dosyasına yazın. Komut olmadan da
üretilebilir; satırlar o dosyanın örneğinde yazılıdır. `VADO_OPENID_KEY` değerini ayrıca güvenli bir
yerde yedekleyin: kaybolursa mini uygulamalar kullanıcılarını tanıyamaz.

## 2.1 ve öncesinden geçiş

Anahtarları **yeniden üretmeyin**; eski ana anahtardan geçirin. Böylece mini uygulama kimlikleri
değişmez, daha önce üretilmiş QR kodları okunmaya devam eder ve o sırada kod bekleyen kullanıcının
kodu geçer.

1. Yeni sürümün dosyalarını alın. Sunucuda imajı derleyin (`docker build …`, yukarıda); çalışan API
   bundan etkilenmez.
2. `migrate` komutunu çalıştırın ve yazdırdığı dört satırı `infra/.env.production` dosyasına ekleyin.
   `VADO_APP_SECRET` satırı şimdilik kalsın.
3. `check` komutunu çalıştırın. Şu iki satırı görmelisiniz:

   ```text
   Yeni anahtarlar eski sistemle uyumlu: mini uygulama kimlikleri ve daha önce üretilmiş
   QR kodları korunuyor. Bu değişken artık gerekmiyor; kaldırabilirsiniz.
   Anahtarlar canlı ortam için geçerli.
   ```

4. Güncelleyin: `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production up -d --build`.
   API günlüğünde "İmza anahtarları yüklendi" ve "VADO_APP_SECRET hâlâ tanımlı…" kayıtlarını
   görürsünüz.
5. Her şey yolundaysa `VADO_APP_SECRET` satırını dosyadan silin ve aynı komutla yeniden başlatın.
   Eski değeri, 2.1'e geri dönme ihtimali kalmayana kadar sunucunun dışında saklayın.

| Ne                        | Geçişten sonra                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Mini uygulama kimlikleri  | Aynı kalır: `VADO_OPENID_KEY`, eski sistemin kullandığı anahtarın kendisidir.                      |
| Eski QR kodları           | Okunur: halkadaki `legacy` anahtarı doğrular. Yeni kodları `k1` imzalar.                           |
| Yoldaki doğrulama kodları | Geçer: `legacy` anahtarı ertesi günün sonuna kadar doğrular, sonra kendiliğinden devre dışı kalır. |
| Oturumlar                 | Etkilenmez.                                                                                        |

**Güvenlik ağı.** `VADO_APP_SECRET` tanımlıyken API, yeni anahtarların onunla uyumlu olduğunu
başlangıçta denetler. Anahtarlar yanlışlıkla sıfırdan üretilmişse başlamaz ve nedenini söyler;
kimlikler ve QR kodları sessizce bozulmaz. `check` aynı denetimi önceden yapar. Kimlikleri bilerek
değiştirecekseniz önce `VADO_APP_SECRET` satırını silin.

`check` geçtiği halde API "VADO_OPENID_KEY, VADO_APP_SECRET ile kullanılan anahtar değil" diyerek
başlamazsa, eski değer dosyada Compose'un farklı okuduğu bir biçimde (`$`, `#` ya da tırnakla)
yazılmıştır. Compose'un okuduğu değeri `docker compose … config` çıktısında görürsünüz; geçişi o
değerle yineleyin: `docker run --rm -e VADO_APP_SECRET='…' vado-api node dist/cli/keys.js migrate`.
`check` komutunu Compose ile çalıştırdıysanız bu durum güncellemeden önce ortaya çıkar.

**Eski ana anahtarın izi.** `VADO_OPENID_KEY` ve QR halkasındaki `legacy` anahtarı eski ana
anahtardan türetilmiştir; eski değeri bilen biri ikisini de hesaplayabilir. Bu yüzden eski değeri
sunucudan kaldırın. `legacy` QR anahtarını, eski kodlar dolaşımdan kalkınca halkadan silebilirsiniz.
`VADO_OPENID_KEY` ise kimlikler değişmesin diye olduğu gibi kalır.

**2.1'e geri dönmek gerekirse** eski sürümün dosyalarına ve `VADO_APP_SECRET` değerine dönün.
Kimlikler aynıdır; 2.2 çalışırken üretilmiş QR kodlarını ve yoldaki doğrulama kodlarını 2.1 tanımaz.

## Anahtar değiştirme

Üç adım her zaman aynıdır: komutun yazdırdığı satırı dosyadaki satırın yerine yazın, `check` ile
denetleyin, API'yi yeniden başlatın (`docker compose … up -d`). Günlükteki "İmza anahtarları
yüklendi" kaydı, sürecin yeni halkayı aldığını gösterir.

### QR anahtarı

```bash
keys rotate qr --until 2027-06-30
```

```bash
# "k2": imzalar
# "k1": 2027-06-30 gününün sonuna kadar (UTC) doğrular
# "legacy": halkadan çıkarılana kadar doğrular
VADO_QR_KEYS=k2:…,k1:…:2027-06-30,legacy:…
```

- Kişisel kodlar on dakikada bir yenilendiği için etkilenmez. İşletme ve mini uygulama kodları
  süresizdir ve basılmış olabilir; bunlar eski anahtarla imzalıdır. Kod yeniden istendiğinde
  (`POST /v1/qr`) güncel anahtarla imzalanır. `--until` gününü, basılmış kodların yenilenmesine
  yetecek kadar ileri seçin.
- `--until` verilmezse eski anahtar, siz halkadan silene kadar doğrular.
- Eski kodların hâlâ okutulup okutulmadığını API günlüğünden görürsünüz: her okutmada
  `Eski anahtarla imzalı QR kod doğrulandı` kaydı düşer ve anahtarın kimliğini (`keyId`) taşır. Bu
  kayıt kesildiyse o anahtarı halkadan silebilirsiniz.

### Doğrulama kodu anahtarı

```bash
keys rotate otp
```

Kodlar beş dakika yaşar; eski anahtar ertesi günün sonuna kadar halkada kalır ve kendiliğinden
devre dışı kalır. Kullanıcılar bir şey fark etmez; QR kodları ve mini uygulama kimlikleri
etkilenmez.

### Kimlik belirteci anahtarı

```bash
keys rotate identity
```

Mini uygulamaların sunucuları belirteci `GET /v1/identity-keys` adresinde yayımlanan açık
anahtarlarla doğrular. Eski anahtar ertesi günün sonuna kadar yayımlanmaya devam eder; belirteçler
beş dakika yaşadığı ve açık anahtar listesi en fazla on dakika önbellekte tutulduğu için doğrulayan
taraf kesinti görmez. Gizli anahtar yalnızca API'dedir; açık anahtarlar gizli değildir.

### 2.4 ve öncesinden 2.5'e

2.5 dördüncü aileyi getirir; o tanımlı değilse canlıda API başlamaz ve şunu söyler:
"VADO_IDENTITY_KEYS tanımlı değil. 2.4 ve öncesinden yükseltmede `keys add identity` çıktısını
ekleyin". `keys add identity` komutunun yazdırdığı satırı `infra/.env.production` dosyasına ekleyin,
`check` ile denetleyin, sonra güncelleyin. Diğer aileler değişmez. 2.4'e geri dönerseniz satır
yok sayılır.

### Anahtar sızdıysa

```bash
keys rotate qr --drop-old
keys rotate otp --drop-old
keys rotate identity --drop-old
```

Kimlik belirteci anahtarı sızdıysa eskisi hemen yayımdan kalkar; o ana kadar verilmiş belirteçler
(en fazla beş dakikalık) doğrulanmaz, mini uygulama yenisini ister.

Eski anahtarların hepsi halkadan çıkar. QR'da o ana kadar üretilmiş bütün kodlar geçersiz olur ve
basılmış kodların yeniden alınması gerekir; doğrulama kodunda yoldaki kodlar geçersiz olur ve
kullanıcı yeni kod ister. Sızan `.env` dosyasının kendisiyse içindeki diğer değerleri de (yönetici
anahtarı, veritabanı şifresi, SMS gizli değeri) değiştirin. Panel hesaplarının parolaları
`.env` dosyasında durmaz; veritabanı da sızdıysa onları ve ikinci adımlarını sıfırlayın
(`admins.js reset-password`, `reset-2fa`).

### Mini uygulama kimliği anahtarı

Değiştirilmez. Değişirse her kullanıcının her mini uygulamadaki `openId` değeri değişir ve mini
uygulamalar kullanıcılarının randevularını, siparişlerini eşleştiremez. Bu anahtar sızarsa,
kullanıcının VADO kimliğini bilen biri o kullanıcının `openId` değerini hesaplayabilir. O durumda
anahtarı değiştirmek ve mini uygulama geliştiricilerine kimliklerin değiştiğini bildirmek gerekir;
bunun otomatik bir geçişi yoktur.

### Birden çok API süreci

Süreçler sırayla yeniden başlatılırken yeni anahtarla imzalanan bir kod, henüz eski halkayla
çalışan sürece düşerse reddedilir. Kesintisiz geçiş iki adımdır: yeni anahtarı önce halkanın
**ikinci** sırasına yazıp bütün süreçleri yeniden başlatın (hepsi yeni anahtarı tanır, eskisi
imzalamayı sürdürür), sonra ilk sıraya alıp yeniden başlatın.

## API ne zaman başlamaz

- Dört değişkenden biri tanımlı değil ya da boş.
- Bir anahtar hex değil, 64 karakterden kısa ya da rastgele üretilmemiş (yinelenen bir desen).
- Geliştirme anahtarı kullanılmış.
- Aynı anahtar iki ailede ya da bir halkada iki kez geçiyor.
- Halkanın ilk anahtarı `legacy` ya da tarihli.
- `VADO_APP_SECRET` tanımlı ama yeni anahtarlar onunla uyumlu değil.

Hata iletisi sorunun hangi değişkende ve hangi anahtarda olduğunu söyler; anahtarın kendisini
yazmaz. Süresi dolmuş bir doğrulama anahtarı başlangıcı engellemez: günlüğe bir uyarı düşer, anahtar
halkadan silinebilir.
