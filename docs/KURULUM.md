# Kurulum

Bu belge VADO'yu kendi bilgisayarınızda çalıştırmayı anlatır. Sırayla ilerleyin; her adımın sonunda
ne görmeniz gerektiği yazıyor. Komutlar Windows, macOS ve Linux'ta aynıdır.

## 1. Gerekenler

| Araç                                                                  | Neden gerekli                          | Kontrol         |
| --------------------------------------------------------------------- | -------------------------------------- | --------------- |
| [Node.js 22](https://nodejs.org) (22.13 veya üstü; "LTS" yazan sürüm) | Tüm parçalar Node.js ile çalışır       | `node -v`       |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/)     | Veritabanını tek komutla çalıştırmak   | `docker -v`     |
| Telefonda [Expo Go](https://expo.dev/go) (isteğe bağlı)               | Uygulamayı kendi telefonunuzda denemek | Mağazadan kurun |

Docker kurmak istemiyorsanız PostgreSQL 16'yı doğrudan da kurabilirsiniz; [aşağıda](#docker-olmadan-postgresql)
anlatılıyor.

**Windows'ta terminal:** Başlat menüsünden "Komut İstemi"ni (cmd) veya PowerShell'i açın. PowerShell
`npm` komutunda "bu sistemde betik çalıştırma devre dışı" hatası verirse ya Komut İstemi'ni kullanın
ya da PowerShell'de bir kez şunu çalıştırın:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 2. Projeyi açın ve bağımlılıkları kurun

Zip dosyasını, yolunda Türkçe karakter ve boşluk bulunmayan bir klasöre çıkarın (örneğin
`C:\projeler\vado`). Terminalde o klasöre geçin ve:

```bash
npm install
```

Birkaç dakika sürer. Sonunda `added … packages` yazısını görmelisiniz. Uyarılar (`npm warn`) sorun
değildir.

Ardından çıkan "30 vulnerabilities" satırı mobil derleme araçlarından gelir; API ve panelde bilinen
açık yoktur. `npm audit fix --force` çalıştırmayın: Expo'yu eski bir sürüme düşürür ve uygulamayı
bozar. Ayrıntısı [SECURITY.md](../SECURITY.md#bağımlılık-uyarıları) içindedir.

## 3. Veritabanını başlatın

Docker Desktop açıkken:

```bash
npm run db:up
```

PostgreSQL 5432, Redis 6379 portunda çalışmaya başlar; komut, ikisi de bağlantı kabul edene kadar
bekler. İlk çalıştırmada imajlar indirildiği için birkaç dakika sürebilir. Durdurmak için
`npm run db:down`; veriler silinmez.

## 4. Tabloları ve örnek veriyi yükleyin

```bash
npm run db:seed
```

Komut önce örnek mini uygulamayı derler, sonra veritabanını doldurur. Sonunda şunu görmelisiniz:

```
Örnek kullanıcılar ve içerik yüklendi.
Örnek paket randevu 1.0.0 yayında: Kadıköy Berber, Elit Güzellik Salonu.
Geliştirme kaydının adresi: http://localhost:5173
Giriş için: 0555 000 00 01 (Ayşe) … 0555 000 00 04 (Can), kod 000000
```

Örnek mini uygulama burada bir **paket** olarak yüklenir, onaylanır ve iki işletmenin kaydında
yayınlanır; üçüncü kayıt aynı uygulamayı geliştirme sunucusundan açar. Ayrımı
[MINI_UYGULAMA_GELISTIRME.md](MINI_UYGULAMA_GELISTIRME.md) anlatır.

Bu komut yeniden çalıştırılabilir; var olan veriyi bozmaz. Örnek mini uygulamanın kodunu
değiştirdiyseniz yeniden çalıştırdığınızda yeni hâli bir sonraki sürüm numarasıyla yayınlanır.

## 5. Sunucuları başlatın

```bash
npm run dev
```

Üç parça birlikte başlar ve terminal açık kaldığı sürece çalışır:

| Parça               | Adres                 |
| ------------------- | --------------------- |
| API                 | http://localhost:4000 |
| Yönetim paneli      | http://localhost:3000 |
| Örnek mini uygulama | http://localhost:5173 |

Tarayıcıda http://localhost:4000/health adresini açın; `{"status":"ok","version":"2.3.0"}` yazısını
görüyorsanız API çalışıyor demektir.

## 6. Uygulamayı açın

### Tarayıcıda (en hızlısı)

İkinci bir terminal açın, aynı klasörde:

```bash
npm run web
```

http://localhost:8081 açılır. Tarayıcı penceresini daraltın ya da geliştirici araçlarından telefon
görünümünü seçin. Telefon numarası olarak `0555 000 00 01`, kod olarak `000000` yazın.

İki kullanıcıyı aynı anda denemek için ikinci kişiyi (`0555 000 00 02`) gizli pencerede açın.

Tarayıcı önizlemesinde kamera yoktur; QR kod okutmak yerine kodun metni yapıştırılır. Bunun dışında
tüm akışlar çalışır.

### Kendi telefonunuzda

Telefon, bilgisayardaki sunuculara `localhost` adresiyle ulaşamaz. Önce adresleri bilgisayarın ağ
adresine çevirin:

```bash
npm run lan
```

Sonra 5. adımdaki `npm run dev` terminalini kapatıp yeniden başlatın ve ikinci terminalde:

```bash
npm run mobile
```

Terminalde bir QR kod çıkar. Telefon ve bilgisayar **aynı Wi-Fi ağındayken** kodu okutun: Android'de
Expo Go uygulamasının içinden, iPhone'da Kamera uygulamasıyla.

- Bağlanamıyorsa Windows Güvenlik Duvarı Node.js'i engelliyor olabilir; çıkan izin penceresinde
  "Özel ağlar"a izin verin.
- Expo Go "desteklenmeyen SDK sürümü" derse Expo Go'yu mağazadan güncelleyin.
- iPhone'da Expo Go, Face ID kullanamaz; yeniden doğrulama ve uygulama kilidi orada cihaz şifresini
  sorar. Face ID, uygulamanın kendi derlemesinde (bkz. [YAYIN.md](YAYIN.md)) çalışır.
- Bilgisayarda birden çok ağ bağdaştırıcısı varsa (VPN, sanal makine) `npm run lan` yanlış adresi
  seçebilir. Doğru adresi elle verin: `npm run lan -- 192.168.1.20`
- Eski hâline dönmek için: `npm run lan -- --off`

Android emülatörü veya iOS simülatörü kuruluysa `npm run mobile` çalışırken terminalde `a` veya `i`
tuşuna basmanız yeterlidir.

## 7. Yönetim panelini açın

http://localhost:3000 adresine gidin. Geliştirme ortamında şifre sormaz. Buradan:

- Uygulamadan yapılan işletme başvurularını onaylayabilir,
- Mini uygulama paketlerini yükleyip inceleyebilir, işletmeler için uygulama kaydı açıp onaylı bir
  sürümü yayınlayabilir,
- Şikayetleri görebilir, kullanıcıları askıya alabilirsiniz.

## Her şeyin sağlam olduğunu denetleyin

```bash
npm run check
```

Biçim, lint, proje kuralları, tip denetimi, testler ve derlemeler sırayla çalışır; iki üç dakika
sürer. Testler için veritabanının (3. adım) çalışıyor olması gerekir.

## Docker olmadan PostgreSQL

[PostgreSQL 16](https://www.postgresql.org/download/) kurulum programını çalıştırın. Kurulumdan sonra
"SQL Shell (psql)" uygulamasını açıp şu iki satırı çalıştırın:

```sql
CREATE ROLE vado LOGIN PASSWORD 'vado' CREATEDB;
CREATE DATABASE vado OWNER vado;
```

Bu durumda 3. adımı (`npm run db:up`) atlayın. Redis gerekmez; yalnızca birden çok API süreci
çalıştırırken kullanılır.

Farklı bir kullanıcı adı, şifre veya port kullanıyorsanız `apps/api/.env.example` dosyasını
`apps/api/.env` adıyla kopyalayıp `DATABASE_URL` satırını düzenleyin.

## Sık karşılaşılan sorunlar

| Belirti                                            | Çözüm                                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run db:seed` "ECONNREFUSED" veriyor           | Veritabanı çalışmıyor. Docker Desktop'ın açık olduğunu kontrol edip `npm run db:up` çalıştırın.                                                                                |
| `npm run dev` "address already in use" veriyor     | 4000, 3000 veya 5173 portunu başka bir program kullanıyor. O programı kapatın.                                                                                                 |
| Uygulama "Sunucuya ulaşılamıyor" diyor             | `npm run dev` terminali kapalı ya da (telefonda) `npm run lan` çalıştırılmamış.                                                                                                |
| Telefonda fotoğraflar veya mini uygulama açılmıyor | `npm run lan` çalıştırıp `npm run dev` terminalini yeniden başlatın.                                                                                                           |
| "Çok fazla kod istendi" uyarısı                    | Aynı numaraya on dakikada beş koddan fazlası gönderilmez. Başka bir örnek numarayla deneyin.                                                                                   |
| Her şeyi sıfırlamak istiyorum                      | `npm run db:down`, ardından Docker Desktop'ta `vado-dev_postgres-data` birimini ve `apps/api` altındaki `storage` ile `package-store` klasörlerini silin; 3. adımdan başlayın. |

## Ayarlar

Geliştirmede hiçbir ayar zorunlu değildir. Değiştirilebilen her şey, açıklamalarıyla birlikte şu
dosyalardadır:

- `apps/api/.env.example`: sunucu, veritabanı, SMS, ödeme, mini uygulama paketleri
- `apps/portal/.env.example`: panel girişi ve API adresi
- `apps/mobile/.env.example`: uygulamanın bağlanacağı API adresi

Canlı ortama kurulum için [YAYIN.md](YAYIN.md) belgesine bakın.
