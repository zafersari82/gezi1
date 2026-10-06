# Mini uygulama geliştirme

Mini uygulama, VADO'nun içinde açılan bir web uygulamasıdır. İstediğiniz araçla yazarsınız (React,
Vue, düz HTML), derleme çıktısını bir **paket** olarak VADO'ya yüklersiniz; VADO paketi inceler,
kendi sunucusundan sunar ve küçük bir köprü üzerinden kullanıcının adını öğrenmenize, QR okutmanıza
ve ödeme almanıza izin verir.

Depodaki örnek, `miniapps/appointment` klasöründeki randevu uygulamasıdır. Bu belgedeki her şeyin
çalışan hâli oradadır.

## Üç kavram

| Kavram             | Ne olduğu                                                                                                                                              | Kim yönetir               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| **Paket**          | İncelenen kod: derlenmiş HTML, JS, CSS ve görseller. Kökünde `vado.app.json` bildirim dosyası bulunur.                                                 | Geliştirici               |
| **Sürüm**          | Paketin yüklenmiş bir hâli (`1.4.0`). İçeriği yüklendiği anda sabitlenir ve SHA-256 özetiyle tanınır; değişiklik, yeni bir sürüm numarasıyla yüklenir. | Geliştirici, inceleyen    |
| **Uygulama kaydı** | Bir işletmenin vitrini: adı, simgesi, ayarları, satıcısı ve yayınladığı paket sürümü. Kullanıcıların Keşfet'te gördüğü ve açtığı şey budur.            | VADO yöneticisi (panelde) |

Aynı paketi çok sayıda uygulama kaydı kullanabilir. Örnekteki `randevu` paketi hem Kadıköy Berber
hem Elit Güzellik Salonu kaydında yayındadır; kod bir kez incelenir, her işletme kendi adı, satıcısı
ve hizmet listesiyle açılır.

## Örneği çalıştırın

```bash
npm run db:seed   # örnek paketi derler, yükler, onaylar ve iki işletmenin kaydında yayınlar
npm run dev       # API, panel ve örnek mini uygulamanın geliştirme sunucusu (http://localhost:5173)
npm run web       # ikinci terminalde: VADO'nun tarayıcı önizlemesi
```

VADO'da **Keşfet** sekmesinde üç kayıt görürsünüz:

- **Kadıköy Berber** ve **Elit Güzellik Salonu**: yüklenmiş paketten açılır. İkisi aynı koddur;
  hizmet listesi ve işletme adı kaydın ayarlarından gelir.
- **Randevu (geliştirme)**: aynı uygulamayı `http://localhost:5173` adresindeki geliştirme
  sunucusundan açar. Üst çubukta "Geliştirme" etiketi görünür. Koddaki değişiklik anında yansır.

Mini uygulama açılınca adınızı görmek için izin ister; saat seçip "Randevu al" dediğinizde VADO'nun
ödeme ekranı açılır.

## Geliştirme döngüsü

1. **Geliştirme kaydı açın.** Panelde **Mini uygulamalar › Yeni kayıt › Geliştirme kaydı oluştur**.
   Giriş adresi geliştirme sunucunuzdur (`http://localhost:5173`); yetkileri formda, işletme
   ayarlarını (JSON olarak) kaydın sayfasında girersiniz. Kaydı doğrulayınca VADO'da açılır.
2. **Yazın ve deneyin.** Kayıt, sayfayı doğrudan sunucunuzdan açtığı için her kaydettiğinizde
   yenilenir.
3. **Paketleyin ve paket olarak deneyin.** Derleyin, `npm run miniapp:pack` ile paketleyin, panelden
   yükleyip bir uygulama kaydında yayınlayın (aşağıda anlatılıyor).

Geliştirme kayıtları yalnızca geliştirme ortamında çalışır (`VADO_MINIAPP_DEV_MODE`, canlı ortamda
kapalıdır ve açılamaz). **Canlı ortamda yalnızca VADO'ya yüklenmiş ve onaylanmış paketler çalışır.**

Geliştirme kaydı paketten daha serbesttir: tarayıcı deposu (`localStorage`), satır içi betik ve
dışarıdan yüklenen kod orada çalışır, pakette çalışmaz. Sayfayı yenilemek de geliştirme kaydında
serbesttir; paket ise açıldığı belgeden ayrılamaz (aşağıda, "Paketin içinde neler çalışır").
İncelemeye göndermeden önce uygulamayı mutlaka paket olarak da deneyin; paketleme komutu, pakette
engellenecek şeyleri önceden söyler.

## Kitaplığı kullanın

Bu depodaki mini uygulamalar `@vado/miniapp-sdk` paketine bağlanır:

```json
{ "dependencies": { "@vado/miniapp-sdk": "*" } }
```

```ts
import { vado, VadoError } from "@vado/miniapp-sdk";

if (vado.isAvailable()) {
  const { config } = await vado.app.getContext(); // işletmenin ayarları
  const profile = await vado.identity.getProfile(); // kullanıcıya bir kez sorulur
  console.log(`${config.businessName}: merhaba ${profile.displayName}`);
}
```

Kitaplığın bağımlılığı yoktur ve derlenmiş mini uygulamaya yalnızca birkaç kilobayt ekler. Paket
henüz npm'de yayınlanmadı; depo dışında geliştirilen mini uygulamalar için yayınlanması
[yol haritasındadır](YOL_HARITASI.md). O zamana kadar dışarıdaki geliştiriciler aşağıdaki
[köprü protokolünü](#köprü-protokolü) doğrudan kullanabilir.

## Neler yapılabilir

Her işlev bir yetkiye bağlıdır. Paket yalnızca bildirim dosyasında istediği yetkileri kullanabilir;
diğerleri `capability_denied` hatası verir.

| İşlev                             | Yetki             | Kullanıcıya sorulur mu         | Sonuç                                       |
| --------------------------------- | ----------------- | ------------------------------ | ------------------------------------------- |
| `vado.isAvailable()`              | —                 | —                              | VADO içinde mi çalışıyor                    |
| `vado.container.getInfo()`        | —                 | —                              | Platform, VADO sürümü, dil, protokol sürümü |
| `vado.container.close()`          | —                 | —                              | Mini uygulamayı kapatır                     |
| `vado.app.getContext()`           | —                 | —                              | `{ appId, version, config, params }`        |
| `vado.identity.getProfile()`      | `identity.basic`  | İlk seferde                    | `{ openId, displayName, avatarUrl }`        |
| `vado.identity.getToken()`        | `identity.basic`  | İlk seferde (aynı izin)        | `{ token, expiresAt }`                      |
| `vado.scanner.scanQr()`           | `camera.qr`       | İlk seferde                    | Okunan kodun metni                          |
| `vado.location.getCurrent()`      | `location.coarse` | İlk seferde                    | Yaklaşık enlem ve boylam                    |
| `vado.payment.request(params)`    | `payment.request` | Her seferinde, ödeme ekranında | `{ paymentId, status: "paid" }`             |
| `vado.storage.get / set / remove` | `storage.local`   | Hayır                          | Cihazda saklanan metin                      |
| `vado.share.open(params)`         | `share.native`    | Hayır                          | Telefonun paylaşım menüsünü açar            |

Bilmeniz gerekenler:

- **Bağlam.** `getContext()` uygulamanın hangi kayıt olarak açıldığını (`appId`), yayındaki sürümü
  ve o işletmenin ayarlarını (`config`) verir. `params`, uygulamayı açan QR kodunun parametreleridir
  (masa numarası, şube kodu gibi): kodu VADO panelinde işletme üretir, parametreler kodun imzasının
  içindedir; kullanıcı ya da bir bağlantı onları değiştiremez. Uygulama listeden ya da parametresiz
  bir koddan açıldıysa `params` boştur; uygulamanız bu durumda da çalışmalıdır (ör. masayı
  kullanıcıya sorar).
- **Kimlik.** `openId`, kullanıcının yalnızca o uygulama kaydındaki kimliğidir: aynı kullanıcı için
  hep aynıdır; başka bir kayıtta, aynı paketi kullansa bile, farklıdır. Telefon numarası ve VADO
  kimliği verilmez.
- **Sunucunuzda kimlik.** `getProfile()` sonucunu sunucunuza gönderirseniz sunucunuz onun gerçekten
  VADO'dan geldiğini bilemez. Sunucunuz kullanıcıyı tanıyacaksa `getToken()` ile beş dakikalık imzalı
  bir belirteç alıp onu gönderin; sunucunuz aşağıdaki [Sunucunuzda doğrulama](#sunucunuzda-doğrulama)
  bölümündeki gibi denetler.
- **İzin.** Kimlik, kamera ve konum için VADO kullanıcıya bir kez sorar. Kullanıcı reddederse
  `user_denied` hatası alırsınız; izni sonradan **Ben › Mini uygulama izinleri** ekranından geri de
  alabilir. Uygulamanız izinsiz de çalışabilmelidir (örnek uygulama adı bilmeden de selam verir).
  Yeni bir sürüm paketin yetkilerini ya da bağlandığı adresleri değiştirirse izinler geçersiz olur
  ve kullanıcıya, mini uygulamanın güncellendiği söylenerek yeniden sorulur.
- **Konum** yaklaşık 100 metre duyarlılığa yuvarlanır.
- **Depolama** kullanıcının o cihazında, uygulama kaydına özel olarak durur; başka cihaza ve başka
  kayda taşınmaz, sunucunuzun yerini tutmaz. Anahtar 1-80 karakterdir (harf, rakam, `.`, `_`, `-`),
  değer en fazla 50.000 karakterlik metindir. Pakette tarayıcının kendi deposu (`localStorage`,
  çerez, IndexedDB) yoktur; kalıcı veri için bu işlevleri kullanın.
- **Zaman aşımı.** Kullanıcıya ekran açmayan çağrılar 15 saniyede, açanlar (izin, kamera, ödeme)
  5 dakikada `failed` hatasıyla sonlanır.

### Sunucunuzda doğrulama

Belirteç bir JWT'dir (`alg: EdDSA`, Ed25519). Sunucunuz şu dört şeyi denetler: imza
(`GET /v1/identity-keys` adresindeki açık anahtarlardan, başlıktaki `kid` ile seçilen), `iss` (VADO
API'sinin adresi), `aud` (sizin uygulama kaydınızın kimliği, `getContext().appId`) ve `exp`. Sonra
kullanıcıyı `sub` değeriyle tanır; bu, `getProfile()` sonucundaki `openId` ile aynıdır.

Bir JWT kitaplığı (ör. `jose`) bunu tek çağrıyla yapar. Kitaplıksız, yalnızca Node.js ile:

```js
import { createPublicKey, verify } from "node:crypto";

const VADO = "https://api.ornek.com"; // VADO API adresi
const APP_ID = "kayit-kimliginiz";

export async function verifyVadoToken(token) {
  const [header, payload, signature] = token.split(".");
  const { alg, kid } = JSON.parse(Buffer.from(header, "base64url").toString());
  // Anahtar listesini en fazla 10 dakika önbellekte tutabilirsiniz.
  const { keys } = await (await fetch(`${VADO}/v1/identity-keys`)).json();
  const jwk = keys.find((key) => key.kid === kid);
  if (alg !== "EdDSA" || !jwk) return null;
  const signed = Buffer.from(`${header}.${payload}`);
  const key = createPublicKey({ key: jwk, format: "jwk" });
  if (!verify(null, signed, key, Buffer.from(signature, "base64url"))) return null;
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (claims.iss !== VADO || claims.aud !== APP_ID) return null;
  if (claims.exp * 1000 < Date.now()) return null;
  return claims.sub; // kullanıcının sizdeki kimliği (openId)
}
```

- Belirteçte ad, telefon ya da VADO kullanıcı kimliği yoktur. Adı göstermek istiyorsanız
  `getProfile()` sonucunu kullanın; kimlik için `sub` değerine güvenin.
- Bir belirteci yalnızca bir kez kabul etmek istiyorsanız `jti` değerini beş dakika saklayıp
  yinelenenleri reddedin.
- Belirteç başka bir kayıt için verilmişse `aud` tutmaz; başka bir mini uygulamanın belirteciyle
  sizin sunucunuza giriş yapılamaz.

### Hatalar

Her işlev başarısız olduğunda `VadoError` fırlatır; `code` alanına göre davranın:

| `code`              | Anlamı                                         | Ne yapmalı                                        |
| ------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `user_denied`       | Kullanıcı izin vermedi ya da vazgeçti          | Hata göstermeyin; kullanıcı kaldığı yerden sürsün |
| `capability_denied` | Paket bu yetkiyi bildirim dosyasında istememiş | Yetkiyi ekleyip yeni sürüm yükleyin               |
| `invalid_params`    | Gönderilen bilgiler biçime uymuyor             | Parametreleri düzeltin                            |
| `unavailable`       | Sayfa VADO dışında açılmış                     | Kullanıcıya VADO'dan açmasını söyleyin            |
| `unknown_method`    | VADO sürümü bu işlevi tanımıyor                | `getInfo()` ile sürümü denetleyin                 |
| `failed`            | İşlem tamamlanamadı ya da zaman aşımına uğradı | `message` alanını gösterip yeniden denetin        |

```ts
try {
  const payment = await vado.payment.request({ … });
} catch (error) {
  if (error instanceof VadoError && error.code === "user_denied") return;
  showError(error instanceof Error ? error.message : "İşlem tamamlanamadı.");
}
```

## Bildirim dosyası: `vado.app.json`

Paketin kökünde durur. Vite kullanıyorsanız `public/` klasörüne koyun; derleme çıktısının köküne
kopyalanır. Tanımlı olmayan alanlar reddedilir: yazım hatası sessizce yok sayılmaz.

```json
{
  "manifest": 1,
  "id": "randevu",
  "version": "1.0.0",
  "name": "VADO Randevu",
  "entry": "index.html",
  "icon": "icon.png",
  "permissions": ["identity.basic", "payment.request", "storage.local", "share.native"],
  "network": [],
  "config": [{ "key": "businessName", "label": "İşletme adı", "type": "text", "required": true }]
}
```

| Alan          | Zorunlu | Açıklama                                                                                                                                                  |
| ------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest`    | Evet    | Bildirim biçiminin sürümü; şimdilik hep `1`.                                                                                                              |
| `id`          | Evet    | Paketin kimliği: küçük harf, rakam ve tire; 3-40 karakter. Paneldeki paket kimliğiyle aynı olmalıdır.                                                     |
| `version`     | Evet    | `ana.alt.yama` biçiminde (`1.4.0`). Daha önce yüklenen bütün sürümlerden büyük olmalıdır.                                                                 |
| `name`        | Evet    | Paketin adı (2-60 karakter). İnceleme ekranında görünür; kullanıcılar uygulama kaydının adını görür.                                                      |
| `entry`       | Hayır   | VADO'nun açacağı sayfa; paketteki bir `.html` dosyası. Varsayılan `index.html`.                                                                           |
| `icon`        | Hayır   | Paketteki bir görsel. Kendi simgesini belirlemeyen uygulama kayıtları bunu kullanır.                                                                      |
| `permissions` | Hayır   | Yukarıdaki tablodan yalnızca gerçekten kullandığınız yetkiler.                                                                                            |
| `network`     | Hayır   | Paketin bağlanabileceği adresler (en çok 20): yalnızca şema ve alan adı, `https://api.ornek.com` ya da `wss://canli.ornek.com`. Bunların dışı engellenir. |
| `config`      | Hayır   | Paketi kullanan her işletmenin dolduracağı ayarlar (en çok 40 alan).                                                                                      |

### İşletme ayarları

Aynı paketi kullanan işletmeleri birbirinden ayıran her şey (ad, satıcı, hizmet listesi, şube
bilgisi) bir ayar alanıdır. Panel bu tanımdan form üretir; sunucu, değerleri yayından önce bu
tanıma göre doğrular; uygulamanız değerleri `vado.app.getContext()` ile okur.

| Alanın özelliği | Açıklama                                                                               |
| --------------- | -------------------------------------------------------------------------------------- |
| `key`           | Kodda kullanacağınız ad: küçük harfle başlar, yalnızca harf ve rakam (`businessName`). |
| `label`         | Paneldeki formda görünen ad.                                                           |
| `type`          | `text`, `number`, `boolean` ya da `select`.                                            |
| `required`      | `true` ise boş bırakılamaz.                                                            |
| `default`       | Boş bırakıldığında yazılacak değer.                                                    |
| `help`          | Formda alanın altında görünen açıklama.                                                |
| `maxLength`     | Yalnızca `text`: en büyük uzunluk (verilmezse 200, en çok 2000).                       |
| `options`       | Yalnızca ve mutlaka `select`: `[{ "value": "berber", "label": "Berber" }]`.            |

Ayarlar gizli bilgi taşımaz: değerler mini uygulamaya, yani kullanıcının cihazına gönderilir. API
anahtarı gibi sırları buraya yazmayın.

Yeni bir sürüm zorunlu bir alan eklerse, o alanı doldurmamış kayıtlar yeni sürüme toplu olarak
geçirilemez; panel bunları tek tek listeler. Alan eklerken `default` vermek geçişi kolaylaştırır.

## Paketin içinde neler çalışır

Paket, VADO'nun sunucusundan, kayda özel bir adresten ve sıkı bir güvenlik politikasıyla sunulur.
VADO onu doğrudan açmaz: kendi yazdığı ince bir sarmalayıcı sayfanın içindeki korumalı çerçevede
açar. Aşağıdakiler, incelemede gözden kaçsa bile çalışma anında engellenir:

| Konu                    | Kural                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kod                     | Yalnızca paketin kendi `.js` dosyaları çalışır. Satır içi betik (`<script>…</script>`), `onclick="…"`, `eval`, `new Function`, WebAssembly ve başka sunucudan yüklenen kod yoktur.                                                  |
| Stil ve yazı tipi       | Paketin kendi dosyalarından yüklenir; satır içi stil serbesttir. Başka sunucudan stil ve yazı tipi yüklenemez, pakete ekleyin.                                                                                                      |
| Ağ                      | `fetch`, `XMLHttpRequest` ve WebSocket yalnızca paketin kendi dosyalarına ve `network` listesindeki adreslere gider. Canlı ortamda yalnızca `https` ve `wss` kabul edilir.                                                          |
| Görsel ve ortam         | Paketin dosyaları, `data:` ve `blob:` adresleri, `network` listesindeki `https` adresleri ve VADO'nun verdiği profil fotoğrafları.                                                                                                  |
| Tarayıcı deposu         | Çerez, `localStorage`, `sessionStorage`, IndexedDB ve Service Worker yoktur; `vado.storage` kullanın.                                                                                                                               |
| Gezinme                 | Uygulama tek belgedir ve açıldığı belgeden ayrılamaz. Başka adrese giden bağlantı, `location` ataması ve form gönderimi istek gönderilmeden engellenir; yeni pencere açılamaz. Dış bağlantı vermeniz gerekiyorsa `vado.share.open`. |
| Çerçeve                 | Başka bir sayfa çerçevelenemez (`iframe`, `object`, `embed`); `<base>` kullanılamaz.                                                                                                                                                |
| Kamera, mikrofon, konum | Tarayıcı API'leriyle (`getUserMedia`, `navigator.geolocation`) erişilemez; köprüdeki işlevleri kullanın.                                                                                                                            |

Uygulamanız VADO'nun API'sini doğrudan çağıramaz ve başka bir uygulama kaydının dosyalarına ya da
verisine ulaşamaz; VADO ile yalnızca köprü üzerinden konuşur.

**Açıldığı belgeden ayrılan mini uygulama kapatılır.** Başka bir adrese gitmeye çalışmak, sayfayı
yeniden yüklemek (`location.reload()`) ya da paketin başka bir HTML dosyasına geçmek mini uygulamayı
kapatır; kullanıcı "Mini uygulama kapatıldı" ekranını ve "Yeniden aç" düğmesini görür. Bu yüzden:

- **Tek sayfalı uygulama yazın.** Ekranlar arasında sayfa değiştirmeden geçin: `history.pushState`,
  adresin `#` sonrası ve geri tuşu serbesttir. Pakette yalnızca giriş belgesi (`entry`) betik
  çalıştırabilir; diğer HTML dosyaları belge olarak açılamaz.
- **"Yeniden dene" düğmelerinde sayfayı yenilemeyin;** isteği yeniden gönderin. Kalıcı durumu
  bellekte ya da `vado.storage` ile tutun.
- **Kitaplığı pakete bir kez koyun.** Sayfa köprüye tek bir bağlantı kurar; aynı sayfadan gelen
  ikinci bağlantı isteği de "belgeden ayrılma" sayılır ve mini uygulamayı kapatır.
- **WebRTC kullanmayın.** `RTCPeerConnection` kullanan sürüm inceleme ekranında işaretlenir ve
  gerekçesi açık değilse onaylanmaz.

Ayrıca:

- **Adresler göreli olmalıdır.** Paket, `…/files/<özet>/` gibi bir klasörün altından sunulur;
  `/assets/app.js` gibi kökten başlayan adresler bulunamaz. Vite'ta `base: "./"` ayarını kullanın.
- Üst çubuğu (ad, şikayet et, yenile, kapat) VADO çizer; sayfanıza ikinci bir kapatma düğmesi
  koymanız gerekmez. İşlem bittiğinde `vado.container.close()` ile kullanıcıyı geri gönderebilirsiniz.
- Sayfa telefon genişliğinde tasarlanmalıdır:
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
  Paket bir çerçevenin içinde açıldığı için bu etiket yalnızca geliştirme kaydında etkilidir;
  pakette genişliği sarmalayıcı sayfa ayarlar (`width=device-width, initial-scale=1`). Ekran
  çentiği ve ana ekran çubuğu için gereken boşluğu da sarmalayıcı bırakır; çerçevenin içinde
  `env(safe-area-inset-*)` değerlerine güvenmeyin. (Bu davranış gerçek telefonda henüz denenmedi.)

### Dosya kuralları

- Arşiv en çok **5 MB**, açılmış dosyaların toplamı bunun dört katı, dosya sayısı en çok 500'dür.
  5 MB sınırı sunucu ayarıdır (`VADO_PACKAGE_MAX_MB`) ve kesin değeri gerçek cihazlarda açılış
  süresi ölçüldükten sonra belirlenecektir; paketinizi küçük tutun. Açıldığında 2 MB'ı aşan
  paketler inceleme ekranında açılış süresi uyarısıyla görünür.
- Pakete girebilen dosya türleri: `html`, `js`, `mjs`, `css`, `json`, `map`, `txt`, `svg`, `png`,
  `jpg`, `jpeg`, `webp`, `avif`, `gif`, `ico`, `woff2`, `woff`, `ttf`, `otf`.
- Dosya yollarında yalnızca harf, rakam, nokta, tire ve alt çizgi bulunur; boşluk, Türkçe karakter,
  gizli dosya (`.env`) ve üst klasöre çıkan yol olamaz. Yol en çok 180 karakterdir ve dosya adıyla
  birlikte en çok 8 bölümden oluşur.
- Kaynak haritaları (`.map`) pakete girebilir ama kaynak kodunuzu herkese açar; inceleme ekranı
  bunu bildirir.

## Paketleyin

```bash
npm run build -w @vado/miniapp-appointment           # kendi derleme komutunuz
npm run miniapp:pack -- miniapps/appointment/dist    # randevu-1.0.0.zip dosyasını proje köküne yazar
```

```text
Paket:    randevu 1.0.0 (VADO Randevu)
Dosyalar: 5 dosya, 203,7 KB (arşiv 67,0 KB)
Özet:     eee7dcbfb91712068bef474ab5eecc9a4bc90328162bf5931b99d7ac5f9113be
Yetkiler: identity.basic, payment.request, storage.local, share.native
Adresler: yok
Ayarlar:  businessName, merchantId, services
BİLGİ: assets/index-tcaLEFbr.js: Kodda geçen https://react.dev adresi bildirim dosyasında yok; bu adrese bağlantı kurulamaz.
Yazıldı:  /home/ayse/vado/randevu-1.0.0.zip
```

Komut, paketi sunucunun yüklemede uygulayacağı kurallarla denetler ve inceleyenin göreceği bulguları
önceden gösterir:

- **ENGELLENİR**: çalışma anında engellenecek bir şey bulundu (`eval`, `localStorage`, satır içi
  betik gibi); uygulamanız pakette beklediğiniz gibi çalışmayabilir.
- **İNCELENİR**: inceleyenin bakacağı bir davranış (sayfanın başka adrese götürülmesi ya da
  yeniden yüklenmesi, WebRTC kullanımı gibi).
- **BİLGİ**: bilgi; örneğin kodda geçen ama `network` listesinde olmayan bir adres.

Kurallara uymayan klasör paketlenmez; nedenleri dosya dosya yazılır. Seçenekler: `--out <dosya.zip>`
çıktının yeri, `--dev` yalnızca geliştirme ortamında kabul edilen şifresiz (`http`, `ws`) adreslere
izin verir.

Aynı dosyalar her zaman aynı özeti verir: özet, arşivin nasıl sıkıştırıldığına değil, dosyaların
içeriğine bağlıdır. Yüklediğiniz sürümün özetini paneldeki özetle karşılaştırarak yayındaki kodun
sizin derlediğiniz kod olduğunu doğrulayabilirsiniz.

Paketi kendi aracınızla da sıkıştırabilirsiniz; klasörün kendisini değil **içindekileri**
sıkıştırın, `vado.app.json` arşivin kökünde olmalıdır.

## Yükleyin ve incelemeye gönderin

Paneldeki **Paketler** bölümünden:

1. **Yeni paket**: kimlik (bildirim dosyasındaki `id` ile aynı), ad ve geliştirici.
2. **Sürümü yükle**: zip dosyasını seçin. Sürüm **Taslak** olarak kaydedilir; sayfasında
   dosyalarını, yetkilerini, bağlanacağı adresleri, otomatik bulguları ve önceki onaylı sürüme göre
   neyin değiştiğini görürsünüz.
3. **İncelemeye gönder**: sürüm **İncelemede** olur.

| Durum        | Anlamı                                                                             |
| ------------ | ---------------------------------------------------------------------------------- |
| Taslak       | Yüklendi, henüz incelemeye gönderilmedi. **Bu sürümden vazgeç** ile bırakılabilir. |
| İncelemede   | İnceleyen karar verene kadar bekler. Yine vazgeçilebilir.                          |
| Onaylı       | Uygulama kayıtlarında yayınlanabilir.                                              |
| Reddedildi   | Gerekçesi sürümün sayfasında yazar. Düzeltme, yeni bir sürüm numarasıyla yüklenir. |
| Vazgeçildi   | Yükleyen sürümden vazgeçti.                                                        |
| Geri çekildi | Onaylıyken geri çekildi; yayınlayan kayıtlar kapandı. Bir daha yayınlanamaz.       |

Yüklenen sürümün içeriği **hiçbir durumda değiştirilemez**, sürüm numarası da yeniden kullanılamaz.
Bir harf bile değişecekse yeni bir sürüm numarasıyla yeniden yüklersiniz. Böylece incelenen kod ile
kullanıcının çalıştırdığı kod her zaman aynıdır.

## Yayınlayın

Onaylı sürüm, bir uygulama kaydında yayınlanınca kullanıcılara açılır. Paneldeki
**Mini uygulamalar** bölümünden:

1. **Yeni kayıt**: kimlik, ad, açıklama, kategori ve isteğe bağlı simge. Kayıt, işletmenin
   vitrinidir.
2. Kaydın sayfasında **Bu sürümü yayınla**: işletmenin ayarlarını doldurun ve yayınlayın.
3. **Kaydı doğrula**: vitrini ve satıcıyı inceleyen yönetici kaydı doğrular; kayıt kullanıcılara
   açılır.
4. Ödeme alacaksanız aynı sayfadan satıcıyı bağlayın: satıcı kimliği, ödeme ekranında görünecek ad
   ve isteğe bağlı olarak işletme. İşletmeye bağlanan kayıt, işletmenin Keşfet'teki sayfasında da
   listelenir.

Sonrasında:

- **Yeni sürüm.** Onaylanan yeni sürümü kayıtlara tek tek yayınlayabilir ya da sürümün sayfasından
  **Eski sürümdeki kayıtlara dağıt** diyerek toplu geçirebilirsiniz. Ayarları yeni sürümün beklediği
  alanlara uymayan kayıtlar atlanır ve listelenir.
- **Ayar değişikliği.** İşletmenin ayarları kod incelemesi gerektirmez; kaydın sayfasından
  değiştirilir ve mini uygulamanın bir sonraki açılışında geçerli olur.
- **Geri alma.** **Son yayını geri al**, kaydı bir önceki yayınına, o yayında kullanılan ayarlarla
  döndürür.
- **Acil durum.** **Kullanıma kapat** tek bir kaydı, **Onaylı sürümü geri çek** o sürümü yayınlayan
  bütün kayıtları hemen kapatır: listeden kalkar, açılamaz, ödeme alamaz, dosyaları sunulmaz. Geri
  çekerken kayıtları önceki yayınlarına döndürmeyi de seçebilirsiniz.
- Bir kayıt ilk yayınından sonra başka bir pakete geçirilemez; başka paket için yeni kayıt açılır.
- Açık duran bir mini uygulama yeni yayını, kullanıcı VADO'ya geri döndüğünde ya da mini uygulamayı
  yeniden açtığında alır. Kapatılan bir kayıtta ise kimlik ve ödeme istekleri, mini uygulama açık
  olsa bile, hemen reddedilir.

## Ödeme almak

```ts
const { config } = await vado.app.getContext();
const payment = await vado.payment.request({
  merchantId: String(config.merchantId), // panelde bu kayda bağlanmış satıcı
  orderId: "rnd-2026-10-04-1430-k3x9", // sizin sipariş numaranız
  description: "Saç kesimi, 4 Eki Paz 14:30", // ödeme ekranında görünür (en çok 140 karakter)
  amountMinor: 65_000, // kuruş cinsinden: 650,00 TL
});
// payment.status === "paid"
```

- Tutarı ve açıklamayı siz bildirirsiniz; onay ekranını VADO çizer. Kullanıcı tutarı, satıcının
  adını ve açıklamayı VADO'nun kendi ekranında görüp onaylar.
- Satıcı her işletmede farklıdır; satıcı kimliğini koda yazmayın, bir ayar alanı yapın (örnekteki
  `merchantId` gibi). Satıcı, panelde o uygulama kaydına bağlanmamışsa ya da kapatılmışsa ödeme
  açılmaz.
- `orderId` her ödeme denemesi için benzersiz olmalıdır. Aynı numarayla ikinci istek yeni ödeme
  açmaz: ödeme hâlâ bekliyorsa aynı onay ekranı yeniden açılır, ödenmişse doğrudan sonuç döner. Bu
  sayede bağlantı koptuğunda aynı isteği güvenle yineleyebilirsiniz; kullanıcıdan iki kez para
  alınmaz.
- Kullanıcı vazgeçerse `user_denied` hatası gelir ve o ödeme iptal edilir. İptal edilmiş ya da
  15 dakikalık süresi dolmuş bir numara yeniden kullanılamaz (`failed`); kullanıcı yeniden
  denediğinde yeni bir `orderId` üretin. Örnek uygulama bunun için numaranın sonuna deneme anını
  ekler.

**Bu sürümün sınırı:** yalnızca deneme (sandbox) ödemesi vardır ve mini uygulamanın kendi sunucusu
ödemeyi VADO'dan doğrulayamaz; sonuç yalnızca köprüden gelir. Gerçek para alınmadan önce lisanslı
ödeme kuruluşunun bağlanması ve satıcı sunucusuna imzalı ödeme bildirimi gönderilmesi gerekir
(bkz. [YOL_HARITASI.md](YOL_HARITASI.md)). O zamana kadar köprüden gelen "ödendi" sonucuna dayanarak
mal ya da hizmet teslim etmeyin.

## Köprü protokolü

Kitaplık kullanmadan da konuşabilirsiniz. Kesin tanımı `packages/contracts/src/bridge.ts`
dosyasındadır.

**1. İstek gönderin.** Her isteğin kendi `id` değeri olur; ileti metin (JSON) olarak gönderilir:

```js
const request = { vado: 1, id: "istek-1", method: "identity.getProfile", params: undefined };
const message = JSON.stringify(request);

if (window.parent !== window) {
  // Çerçeve içinde (yayındaki paket her zaman böyledir; web önizlemesinde geliştirme sayfası da):
  // üst pencereye bir ileti kapısı verilir; istekler ve yanıtlar o kapıdan geçer.
  const channel = new MessageChannel();
  channel.port1.onmessage = onMessage;
  window.parent.postMessage({ vado: 1, type: "connect" }, "*", [channel.port2]);
  channel.port1.postMessage(message);
} else if (window.ReactNativeWebView) {
  // Telefonda geliştirme adresiyle açılan sayfa: istek WebView'in ileti kanalından gider,
  // yanıt pencereye "message" olayı olarak gelir.
  window.addEventListener("message", onMessage);
  window.ReactNativeWebView.postMessage(message);
}
```

Sıra önemlidir: çerçeve içindeyken `window.ReactNativeWebView` tanımlı olsa bile kullanmayın;
VADO yalnızca sarmalayıcı sayfadan gelen iletileri kabul eder. Kapı sayfa başına bir kez kurulur:
sonraki istekleri aynı kapıdan gönderin. Aynı sayfadan gelen ikinci bağlantı isteği mini uygulamayı
kapatır.

**2. Yanıtı dinleyin.** Yanıt iki ortamda da metin biçimindedir:

```js
function onMessage(event) {
  if (typeof event.data !== "string") return;
  const response = JSON.parse(event.data);
  if (response.vado !== 1 || response.id !== "istek-1") return;
  if (response.ok) console.log(response.result);
  else console.error(response.error.code, response.error.message);
}
```

**3. Metotlar ve parametreleri:**

| `method`              | `params`                                            | `result`                                            |
| --------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `container.getInfo`   | —                                                   | `{ platform, appVersion, locale, protocolVersion }` |
| `container.close`     | —                                                   | `null`                                              |
| `app.getContext`      | —                                                   | `{ appId, version, config, params }`                |
| `identity.getProfile` | —                                                   | `{ openId, displayName, avatarUrl }`                |
| `identity.getToken`   | —                                                   | `{ token, expiresAt }`                              |
| `scanner.scanQr`      | —                                                   | `{ value }`                                         |
| `location.getCurrent` | —                                                   | `{ latitude, longitude, accuracyMeters }`           |
| `payment.request`     | `{ merchantId, orderId, description, amountMinor }` | `{ paymentId, status: "paid" }`                     |
| `storage.get`         | `{ key }`                                           | `{ value }` (`null` olabilir)                       |
| `storage.set`         | `{ key, value }`                                    | `null`                                              |
| `storage.remove`      | `{ key }`                                           | `null`                                              |
| `share.open`          | `{ title, text?, url? }`                            | `null`                                              |

İstekte "ben şu mini uygulamayım" diye bir alan yoktur ve olmayacaktır: VADO, isteğin hangi
pencereden geldiğini kendisi bilir. Protokol sürümü değişirse `vado` alanındaki sayı artar.

## İncelemeye göndermeden önce

- [ ] `npm run miniapp:pack` çıktısında **ENGELLENİR** satırı yok.
- [ ] Uygulamayı geliştirme sunucusundan değil, yüklediğiniz paketten açıp denediniz.
- [ ] Uygulama tek belgede çalışıyor: sayfa yenilemiyor, başka bir HTML dosyasına ya da adrese
      gitmiyor.
- [ ] Paket, VADO'nun bu sürümündeki `@vado/miniapp-sdk` ile derlendi (2.3.1 ve sonrası).
- [ ] `permissions` listesinde yalnızca kullandığınız yetkiler, `network` listesinde yalnızca
      gerçekten bağlandığınız adresler var.
- [ ] İşletmeden işletmeye değişen her şey (ad, satıcı, liste) bir ayar alanı; koda gömülü değil.
- [ ] Sayfa telefon genişliğinde düzgün görünüyor.
- [ ] Kullanıcı izin vermediğinde ve ödemeden vazgeçtiğinde uygulama çalışmaya devam ediyor.
- [ ] VADO dışında açıldığında (`isAvailable() === false`) kullanıcıya ne yapacağını söylüyor.
- [ ] Her sipariş için benzersiz `orderId` üretiyorsunuz.
- [ ] Kullanıcıdan VADO'nun sormadığı kişisel bilgileri (telefon, adres) istiyorsanız kendi
      aydınlatma metninizi gösteriyorsunuz; bu verilerin sorumlusu sizsiniz
      (bkz. [TURKIYE_UYUM.md](TURKIYE_UYUM.md)).

## Restoran sipariş köprüsü (2.7)

SDK'da `ordering.getRestaurant`, `getSlots`, `joinTable`, `getTable`, `getBill`,
`requestService`, `getEvents`, `listOrders` mevcut katalog/sepet/sipariş yöntemlerine
eklenir; `onChange` ve `onConnection` canlı bildirim sağlar. Paket doğrudan API
çağırmaz. Ham imzalı QR kabukta tutulur; `joinTable` onu kullanır, paket parametresi
kullanmaz. Sipariş ve ödeme sürümleri bağımsız birleştirilir. Checkout anahtarı ve
gövdesi kesin sonuç gelene kadar saklanır; `cart_changed` yeni fiyatın açık onayını
ister. Gerçek örnek `miniapps/restaurant` klasöründedir.

2.7 restoran paketinde `vado.ordering.resetCart({id, expectedVersion})` açık
sepeti sunucuda bırakır (`cart` veya `cart_conflict`). Checkout anahtarı/gövdesi
beklerken önce aynı checkout sonucu sorgulanmalıdır. `app.getContext().params.orderId`
bildirim hedefidir; UUID doğrulaması ve kapsamlı `getOrder` ile açılmalıdır.
