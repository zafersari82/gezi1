# API

Bu belge API'nin haritasıdır: hangi uç nokta ne alır, ne döndürür. İstek ve yanıt biçimlerinin kesin
tanımı kodda, `packages/contracts/src` içindeki şemalardadır; aşağıdaki tablolarda her biçimin
yanında o şemanın ya da tipin adı yazar. Mobil uygulama ve panel aynı tanımları kullandığı için
belge ile kod arasında fark görürseniz doğru olan koddur.

## Genel kurallar

- **Adres:** geliştirmede `http://localhost:4000`. Tüm uç noktalar `/v1` ile başlar.
- **Biçim:** istek ve yanıt gövdeleri JSON'dur (`content-type: application/json`). JSON gövdesi en
  fazla 100 KB olabilir.
- **Oturum:** girişten sonra dönen belirteç her istekte `Authorization: Bearer <belirteç>` başlığıyla
  gönderilir. Belirteç istemeyen uç noktalar yalnızca kod isteme, kod doğrulama, `/health`,
  yüklenmiş dosyaların adresleri (`/media/…`) ve yayındaki mini uygulamaların sarmalayıcı belgesi
  ile paket dosyalarıdır (`/apps/…`). Yönetim uç noktaları belirteç yerine yönetici anahtarı ister.
- **Kimlikler** UUID'dir (mini uygulama, paket ve satıcı kimlikleri hariç; onlar `randevu` gibi
  kısa adlardır). **Zamanlar** ISO 8601 biçiminde ve UTC'dir. **Tutarlar** kuruş cinsinden tam sayıdır
  (`65000` = 650,00 TL); tek para birimi `TRY`'dir.
- **Başarılı yanıt** 200 ile veriyi ya da gövdesiz 204 döndürür.
- **Listeler** `{ "items": [...] }` biçimindedir. Sayfalı listeler ayrıca `nextCursor` döndürür;
  sonraki sayfa `?cursor=<nextCursor>` ile istenir. `nextCursor` `null` ise liste bitmiştir.
  Sayfa boyutu `?limit=` ile verilir (varsayılan 30, en çok 100). Sayfalı listeler yeniden eskiye
  doğru sıralıdır.
- **İstek sınırı:** bir IP adresi dakikada 600 istek gönderebilir (`VADO_RATE_LIMIT_PER_MINUTE`);
  kod isteme ve doğrulama uç noktalarında sınır dakikada 30'dur. Aşılırsa 429 `rate_limited` döner.

### Hata biçimi

Her hata aynı biçimde döner:

```json
{ "error": { "code": "otp_invalid", "message": "Kod hatalı veya süresi dolmuş." } }
```

`code` programın bakacağı alandır; `message` kullanıcıya gösterilebilecek Türkçe iletidir. Tüm
kodlar ve iletiler `packages/contracts/src/errors.ts` dosyasındadır. Bazı hatalar `details` alanı
taşır:

| Kod                      | `details`                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `validation_failed`      | `[{ "path": "title", "message": "…" }]`: geçersiz alanlar ve nedenleri             |
| `otp_cooldown`           | `{ "retryInSeconds": 42 }`: yeni kod istenebilmesine kalan süre                    |
| `package_invalid`        | `[{ "file": "vado.app.json", "message": "…" }]`: paketin reddedilme nedenleri      |
| `miniapp_config_invalid` | `[{ "key": "businessName", "message": "…" }]`: paketin beklediğine uymayan ayarlar |

Durum kodları: 400 geçersiz istek, 401 oturum yok ya da geçersiz, 403 yetki yok, 404 kayıt yok,
409 mevcut durumla çakışma, 413 dosya çok büyük, 429 sınır aşıldı, 500 beklenmeyen hata,
501 yapılandırılmamış özellik (ödeme sağlayıcısı).

### Sağlık denetimi

`GET /health` veritabanına ulaşabiliyorsa `{ "status": "ok", "version": "2.3.0" }` döndürür.

## Giriş ve oturumlar

| Uç nokta                                 | Gövde                           | Yanıt                | Not                                          |
| ---------------------------------------- | ------------------------------- | -------------------- | -------------------------------------------- |
| `POST /v1/auth/otp`                      | `requestOtpBodySchema`          | `RequestOtpResponse` | Numaraya doğrulama kodu gönderir             |
| `POST /v1/auth/otp/verify`               | `verifyOtpBodySchema`           | `AuthResult`         | Kodu doğrular, gerekiyorsa hesabı açar       |
| `POST /v1/auth/logout`                   | —                               | 204                  | Bu oturumu kapatır                           |
| `GET /v1/auth/sessions`                  | —                               | `List<Session>`      | Açık oturumlar; `current` bu cihazı gösterir |
| `DELETE /v1/auth/sessions/:id`           | —                               | 204                  | Başka bir cihazdaki oturumu kapatır          |
| `GET /v1/auth/verification`              | —                               | `VerificationStatus` | Kimlik yakın zamanda kanıtlandı mı?          |
| `POST /v1/auth/verification/otp`         | —                               | `RequestOtpResponse` | Hesabın numarasına işlem onay kodu gönderir  |
| `POST /v1/auth/verification/otp/confirm` | `confirmVerificationBodySchema` | 204                  | Onay kodunu doğrular                         |
| `POST /v1/auth/verification/device`      | `verifyDeviceBodySchema`        | 204                  | Cihaz anahtarıyla doğrular                   |

- Numara `0555 123 45 67`, `555 123 45 67`, `+90 555 123 45 67` biçimlerinde gönderilebilir; sunucu
  E.164 biçimine çevirir. Türkiye numaraları cep telefonu olmalıdır.
- Kod 6 hanelidir, 5 dakika geçerlidir ve en fazla 5 kez denenebilir (`otp_locked`).
- Numaraya gönderilmiş ve kullanılmamış bir kod varken 60 saniye yeni kod gönderilmez
  (`otp_cooldown`). On dakikada bir numaraya en fazla 5, bir IP adresinden en fazla 20 kod istenir
  (`otp_rate_limited`).
- İlk girişte `acceptedTermsVersion` zorunludur ve sözleşmedeki `TERMS_VERSION` değerine eşit
  olmalıdır (`terms_not_accepted`).
- Demo modunda kod her zaman `000000`'dır ve `devCode` alanında da döner; SMS gönderilmez.
- Oturum kullanıldıkça kendiliğinden uzar; 30 gün (`VADO_SESSION_DAYS`) hiç kullanılmayan cihazın
  oturumu sona erer. Hesap askıya alınırsa istekler `account_suspended` ile reddedilir.

### Cihaz tanıma ve yeniden doğrulama

- Girişte `deviceId` zorunludur: uygulamanın o kuruluma özel ürettiği rastgele kimlik. Hesabın başka
  oturumları varken bu kimlik ilk kez görülüyorsa giriş "yeni cihaz" sayılır; açık cihazlara
  `session:new-device` olayı gider, oturum listesinde `newDevice` bir gün boyunca `true` döner ve
  giriş denetim kaydına yazılır (`auth.new_device`). Hesabın ilk girişi yeni cihaz sayılmaz.
- Oturum, açıldığı ve son görüldüğü IP adresini tutar; `Session.ip` son görülen adrestir.
- Şu üç işlem, kimlik son 10 dakikada kanıtlanmadıysa `verification_required` (403) döner: ödeme
  onayı (`POST /v1/payments/:id/confirm`), hesap silme (`DELETE /v1/me`) ve başka bir cihazın
  oturumunu kapatma. Giriş kodu tanınan cihazda kimliği kanıtlamış sayılır; yeni cihazda sayılmaz.
- Kimlik iki yolla yeniden kanıtlanır. İşlem onay kodu her zaman geçer: hesabın numarasına ayrı bir
  kod gider; giriş kodu onay kodunun, onay kodu giriş kodunun yerine kullanılamaz. Cihaz anahtarı
  (`AuthResult.deviceKey`; girişte bir kez döner, sunucuda yalnızca özeti durur) yeni cihazda ilk
  24 saat kabul edilmez (`device_key_rejected`).

## Hesap ve kullanıcılar

| Uç nokta                  | Gövde                | Yanıt               | Not                                            |
| ------------------------- | -------------------- | ------------------- | ---------------------------------------------- |
| `GET /v1/me`              | —                    | `Me`                | Oturum sahibinin hesabı                        |
| `PATCH /v1/me`            | `updateMeBodySchema` | `Me`                | Ad, VADO kimliği, hakkında, fotoğraf, gizlilik |
| `DELETE /v1/me`           | —                    | 204                 | Hesabı ve kişisel verileri siler               |
| `GET /v1/users/search?q=` | —                    | `List<UserProfile>` | Telefon numarası ya da VADO kimliğiyle arama   |
| `GET /v1/users/:id`       | —                    | `UserProfile`       | `relation` alanı aradaki ilişkiyi gösterir     |

- Arama yalnızca tam eşleşme bulur ve en fazla bir sonuç döndürür; kısmi arama bilinçli olarak
  yoktur. "Numaramla bulunabileyim" ayarını kapatan kullanıcı numarayla bulunamaz.
- Telefon numarası yalnızca `Me` içinde yer alır; başka hiçbir yanıtta dönmez.
- Bir kullanıcı sizi engellediyse profili `user_not_found` döndürür.
- Hesap silindiğinde ad, numara, VADO kimliği, fotoğraflar, paylaşımlar, kişiler ve grup üyelikleri
  kaldırılır; gönderilmiş mesajlar karşı tarafta "Silinmiş Hesap" adıyla kalır.

## Kişiler

| Uç nokta                               | Gövde                            | Yanıt                          | Not                                      |
| -------------------------------------- | -------------------------------- | ------------------------------ | ---------------------------------------- |
| `GET /v1/contacts`                     | —                                | `List<Contact>`                |                                          |
| `DELETE /v1/contacts/:id`              | —                                | 204                            | `:id` kişinin kullanıcı kimliğidir       |
| `GET /v1/contact-requests`             | —                                | `ContactRequests`              | Gelen ve giden istekler                  |
| `POST /v1/contact-requests`            | `createContactRequestBodySchema` | `CreateContactRequestResponse` | Kişi isteği gönderir                     |
| `POST /v1/contact-requests/:id/accept` | —                                | `UserRef`                      | Gelen isteği kabul eder                  |
| `DELETE /v1/contact-requests/:id`      | —                                | 204                            | Gelen isteği reddeder, gideni geri çeker |
| `GET /v1/blocks`                       | —                                | `List<UserRef>`                | Engellenenler                            |
| `PUT /v1/blocks/:id`                   | —                                | 204                            | Engeller; kişilik ve istekler de kalkar  |
| `DELETE /v1/blocks/:id`                | —                                | 204                            | Engeli kaldırır                          |

Karşı taraf size daha önce istek göndermişse yeni istek açılmaz; iki taraf doğrudan kişi olur ve
yanıtta `status: "accepted"` döner.

## Sohbet

| Uç nokta                                       | Gövde                                | Yanıt                | Not                                         |
| ---------------------------------------------- | ------------------------------------ | -------------------- | ------------------------------------------- |
| `GET /v1/conversations`                        | —                                    | `List<Conversation>` | Son mesaja göre sıralı                      |
| `POST /v1/conversations/direct`                | `createDirectConversationBodySchema` | `ConversationDetail` | Birebir sohbeti açar ya da olanı döndürür   |
| `POST /v1/conversations/group`                 | `createGroupConversationBodySchema`  | `ConversationDetail` | Grup kurar; kuran kişi sahibi olur          |
| `GET /v1/conversations/:id`                    | —                                    | `ConversationDetail` | Üyeler ve okundu bilgileriyle               |
| `PATCH /v1/conversations/:id`                  | `updateConversationBodySchema`       | `ConversationDetail` | Grup adını değiştirir (yalnızca sahibi)     |
| `POST /v1/conversations/:id/members`           | `addMembersBodySchema`               | `ConversationDetail` | Gruba kendi kişilerini ekler                |
| `DELETE /v1/conversations/:id/members/:userId` | —                                    | 204                  | Üyeyi çıkarır; kendini çıkarmak ayrılmaktır |
| `GET /v1/conversations/:id/messages`           | —                                    | `Page<Message>`      | Sayfalı, yeniden eskiye                     |
| `POST /v1/conversations/:id/messages`          | `sendMessageBodySchema`              | `Message`            | Metin ya da fotoğraf gönderir               |
| `POST /v1/conversations/:id/read`              | `markReadBodySchema`                 | 204                  | Verilen `seq` değerine kadar okundu sayar   |

- Birebir sohbet yalnızca kişiler arasında açılır ve yalnızca kişilik sürdükçe mesaj gönderilebilir
  (`not_contacts`). Gruba herkes yalnızca kendi kişilerini ekleyebilir; grup en çok 100 üyelidir.
- Mesaj gönderirken istemci her mesaj için bir `clientId` üretir. Aynı `clientId` ile yinelenen
  istek yeni mesaj oluşturmaz, ilk kaydedilen mesajı döndürür; bağlantı koptuğunda güvenle yeniden
  denenebilir.
- Fotoğraf göndermek için önce `POST /v1/media` ile dosya yüklenir, sonra dönen `id` değeri
  `mediaId` olarak gönderilir.
- `seq` sunucunun verdiği artan sıra numarasıdır. Okunmamış sayısı ve "okundu" işareti buna dayanır:
  bir mesajın `seq` değeri karşı üyenin `lastReadSeq` değerinden küçük ya da ona eşitse okunmuştur.
- Sahibi ayrılan grupta sahiplik en eski üyeye geçer; son üye de ayrılırsa grup silinir.

## Anlar

| Uç nokta                                     | Gövde                           | Yanıt          | Not                                              |
| -------------------------------------------- | ------------------------------- | -------------- | ------------------------------------------------ |
| `GET /v1/moments`                            | —                               | `Page<Moment>` | Kendi ve kişilerin paylaşımları                  |
| `POST /v1/moments`                           | `createMomentBodySchema`        | `Moment`       | Metin, en çok 9 fotoğraf ya da ikisi             |
| `DELETE /v1/moments/:id`                     | —                               | 204            | Yalnızca kendi paylaşımı                         |
| `PUT /v1/moments/:id/like`                   | —                               | `Moment`       | Beğenir                                          |
| `DELETE /v1/moments/:id/like`                | —                               | `Moment`       | Beğeniyi geri alır                               |
| `POST /v1/moments/:id/comments`              | `createMomentCommentBodySchema` | `Moment`       | Yorum ekler                                      |
| `DELETE /v1/moments/:id/comments/:commentId` | —                               | `Moment`       | Kendi yorumunu ya da paylaşımındaki yorumu siler |

Bir paylaşımı yalnızca sahibi ve sahibinin kişileri görür. Beğeni ve yorumlarda yalnızca
görüntüleyenin kendi kişilerinden (ve paylaşım sahibinden) gelenler listelenir.

## Medya

| Uç nokta         | Gövde                                  | Yanıt   |
| ---------------- | -------------------------------------- | ------- |
| `POST /v1/media` | `multipart/form-data`, alan adı `file` | `Media` |

Yalnızca JPEG, PNG ve WebP kabul edilir; tür dosyanın içeriğinden belirlenir. Boyut sınırı 8 MB'tır
(`media_too_large`). Yanıttaki `url`, dosyanın `GET /media/<ad>` adresidir. Bu adres oturum
gerektirmez; dosya adı tahmin edilemeyecek rastgele bir değerdir.

## QR kodlar

| Uç nokta              | Gövde                 | Yanıt      | Not                                        |
| --------------------- | --------------------- | ---------- | ------------------------------------------ |
| `POST /v1/qr`         | `issueQrBodySchema`   | `IssuedQr` | Kişi, işletme ya da mini uygulama için kod |
| `POST /v1/qr/resolve` | `resolveQrBodySchema` | `QrTarget` | Okutulan kodu çözer                        |

Kod `vado://q/<veri>.<anahtar kimliği>.<imza>` biçimindedir; istemci içeriğini yorumlamaz, olduğu
gibi `resolve` uç noktasına gönderir. 2.1 ve öncesinde üretilmiş, anahtar kimliği taşımayan kodlar
da çözülür. Kişisel kod varsayılan olarak 10 dakika geçerlidir
(`qr_expired`); işletme kodunu yalnızca işletmenin sahibi üretebilir. Hedef artık yayında değilse
`qr_target_unavailable` döner.

## İşletmeler ve mini uygulamalar

| Uç nokta                        | Gövde                      | Yanıt             | Not                                          |
| ------------------------------- | -------------------------- | ----------------- | -------------------------------------------- |
| `GET /v1/businesses?category=`  | —                          | `List<Business>`  | Yalnızca onaylanmış işletmeler               |
| `GET /v1/businesses/mine`       | —                          | `List<Business>`  | Kendi başvuruları, onay bekleyenler dahil    |
| `POST /v1/businesses`           | `createBusinessBodySchema` | `Business`        | Başvuru; panelden onaylanana kadar `pending` |
| `GET /v1/businesses/:id`        | —                          | `BusinessDetail`  | Bağlı mini uygulamalarla birlikte            |
| `GET /v1/miniapps?category=`    | —                          | `List<MiniApp>`   | Yalnızca kullanıcılara açık kayıtlar         |
| `GET /v1/miniapps/:id`          | —                          | `MiniAppDetail`   | Kabuğun açarken okuduğu kayıt; ayarlarıyla   |
| `GET /v1/miniapps/:id/identity` | —                          | `MiniAppIdentity` | Kullanıcının o uygulama kaydına özel kimliği |

- Buradaki "mini uygulama" bir **uygulama kaydıdır**: işletmenin vitrini ve yayınladığı paket
  sürümü. Bir kayıt, doğrulanmış ve açıksa ve onaylı bir paket sürümü yayınlıyorsa kullanıcılara
  açıktır. Geliştiricinin sunucusundan açılan kayıtlar (`source: "url"`) yalnızca geliştirme kipinde
  (`VADO_MINIAPP_DEV_MODE`) açıktır. Açık olmayan kayıt `miniapp_not_found` döner.
- `MiniApp.entryUrl` kabuğun açacağı sayfadır; `scope` mini uygulamanın penceresinde yüklenebilecek
  adres önekleridir. Paketle yayınlanan kayıtta `entryUrl` VADO'nun sarmalayıcı belgesidir (paket
  onun içindeki çerçevede çalışır), `scope` sarmalayıcıyı ve paketin dosyalarını kapsar; hepsi
  sürümün içerik özetini taşır. Geliştirme adresiyle açılan kayıtta `entryUrl` sayfanın kendisidir.
- `consentKey`, kaydın yetkilerinin ve verinin gidebileceği adreslerin özetidir. Kabuk kullanıcının
  izinlerini bu değerle birlikte saklar; değer değişmişse izni yeniden sorar.
- `identity` uç noktasını mini uygulama değil, VADO kabuğu çağırır; kullanıcı izin verdikten sonra
  sonucu köprü üzerinden mini uygulamaya iletir. Kaydın `identity.basic` yetkisi yoksa `forbidden`
  döner. `openId` kullanıcı ve uygulama kaydı çiftine özgüdür: aynı paketi kullanan iki kayıtta
  farklıdır.

### Sarmalayıcı belge ve paket dosyaları

| Uç nokta                                 | Yanıt                                   |
| ---------------------------------------- | --------------------------------------- |
| `GET /apps/<kayıt>/wrapper/<özet>/`      | Kabuğun açtığı sarmalayıcı belge (HTML) |
| `GET /apps/<kayıt>/files/<özet>/<dosya>` | Yayındaki paketin bir dosyası           |

İkisi de oturum gerektirmez. Adresleri istemci kurmaz: sarmalayıcının adresi `MiniApp.entryUrl`
içinde hazır gelir, paketin giriş belgesinin adresi sarmalayıcının içindedir.

- Yalnızca kaydın **o anda yayında olan** sürümü sunulur. Kayıt kapatılmışsa, sürüm geri
  çekilmişse, yayın başka bir sürüme geçmişse ya da dosya pakette yoksa 404 döner. Bu yolların
  altında hiçbir zaman yönlendirme yapılmaz.
- **Sarmalayıcı belge** paketi kum havuzundaki bir çerçevede açar ve köprüyü aktarır.
  `content-security-policy` başlığı çerçeveye yalnızca paketin giriş belgesinin yüklenmesine izin
  verir (`frame-src <giriş belgesinin adresi>`); belge yalnızca kendi betiğini çalıştırır ve hiçbir
  yere bağlanmaz. `cache-control: no-cache` ile gönderilir.
- **Paketin giriş belgesi** paketin sınırlarını çizen başlıkları taşır: `content-security-policy`
  (kod yalnızca paketin kendi klasöründen, ağ yalnızca bildirim dosyasındaki adreslere, `sandbox`,
  yalnızca sarmalayıcının çerçeveleyebilmesi), `permissions-policy` (kamera, mikrofon, konum ve
  benzerleri kapalı), `x-content-type-options`, `referrer-policy`. O da `cache-control: no-cache`
  ile gönderilir.
- **Paketin diğer dosyaları** adresleri içerik özetini taşıdığı için değişmez sayılır:
  `cache-control: public, max-age=31536000, immutable`. Belge olarak açılırlarsa etkisizdirler
  (`content-security-policy: default-src 'none'; frame-ancestors 'none'; sandbox`).
- Bütün yanıtlar `etag` taşır ve `If-None-Match` ile 304 döner. Belgelerin etiketi güvenlik
  başlıklarını da kapsar: başlıklar değiştiğinde belge baştan gönderilir.
- `VADO_APPS_ORIGIN` ayarlıysa (`https://{app}.mini.ornek.com`) kayıt API'nin adresinden değil,
  kendi alt alan adından sunulur: `https://<kayıt>.mini.ornek.com/wrapper/<özet>/` ve
  `https://<kayıt>.mini.ornek.com/files/<özet>/<dosya>`. Bu kipte `/apps/…` yolu API'nin kendi
  adresinden, bir kaydın adresleri de başka bir kaydın alan adından istenemez; mini uygulama alan
  adlarından API'nin başka hiçbir uç noktasına ulaşılamaz.

Ayrıntısı [SECURITY.md](../SECURITY.md) belgesindedir.

## Ödemeler

| Uç nokta                        | Gövde                     | Yanıt           | Not                                  |
| ------------------------------- | ------------------------- | --------------- | ------------------------------------ |
| `GET /v1/payments`              | —                         | `Page<Payment>` | Kullanıcının ödemeleri               |
| `POST /v1/payments`             | `createPaymentBodySchema` | `Payment`       | Ödeme oturumu açar (`created`)       |
| `GET /v1/payments/:id`          | —                         | `Payment`       |                                      |
| `POST /v1/payments/:id/confirm` | —                         | `Payment`       | Kullanıcı onayı; `paid` olur         |
| `POST /v1/payments/:id/cancel`  | —                         | `Payment`       | Kullanıcı vazgeçti; `cancelled` olur |

- Oturumu mini uygulama değil, kullanıcının oturumuyla VADO kabuğu açar. Mini uygulamanın
  `payment.request` yetkisi (`payment_not_allowed`) ve satıcının o mini uygulamaya panelden
  bağlanmış olması (`merchant_not_bound`) sunucuda denetlenir.
- Aynı kullanıcı, mini uygulama, satıcı ve `orderId` için ikinci istek yeni oturum açmaz, mevcut
  olanı döndürür; tutar farklıysa `payment_state_invalid` döner.
- Oturum 15 dakika geçerlidir; süresi dolan ödeme `expired` görünür ve onaylanamaz.
- `VADO_PAYMENT_MODE=sandbox` iken onay ödemeyi doğrudan `paid` yapar, gerçek para hareketi olmaz
  ve yanıtta `sandbox: true` döner. `provider` kipinde oturum açma ve onay
  `payment_provider_unavailable` (501) döndürür.

## Şikayet

| Uç nokta           | Gövde                    | Yanıt |
| ------------------ | ------------------------ | ----- |
| `POST /v1/reports` | `createReportBodySchema` | 204   |

Kullanıcı, mesaj, paylaşım, mini uygulama ve işletme şikayet edilebilir. Şikayetler panelde görünür.

## Yönetim

Bu uç noktalar kullanıcı oturumuyla değil, `x-vado-admin-key` başlığındaki yönetici anahtarıyla
çağrılır (`admin_unauthorized`). Anahtar yalnızca panel sunucusunda durur; bu uç noktalar internete
açılmamalıdır (bkz. [YAYIN.md](YAYIN.md)).

| Uç nokta                         | Gövde                           | Yanıt                 | Not                                           |
| -------------------------------- | ------------------------------- | --------------------- | --------------------------------------------- |
| `GET /v1/admin/overview`         | —                               | `AdminOverview`       | Sayılar ve yürürlükteki ayarlar               |
| `GET /v1/admin/users?q=`         | —                               | `List<AdminUser>`     | En yeni 200 kayıt; ad, numara, kimlik araması |
| `PATCH /v1/admin/users/:id`      | `adminUpdateUserBodySchema`     | 204                   | Askıya alır ya da yeniden açar                |
| `GET /v1/admin/businesses?q=`    | —                               | `List<AdminBusiness>` |                                               |
| `PATCH /v1/admin/businesses/:id` | `adminUpdateBusinessBodySchema` | 204                   | Onaylar, yayınlar, askıya alır                |
| `GET /v1/admin/reports`          | —                               | `List<AdminReport>`   |                                               |
| `PATCH /v1/admin/reports/:id`    | `adminUpdateReportBodySchema`   | 204                   | Çözüldü ya da yeniden açık                    |
| `GET /v1/admin/audit`            | —                               | `Page<AuditEntry>`    | Denetim kaydı, sayfalı                        |

Askıya alınan kullanıcının tüm oturumları kapanır. Sahibi etkin olmayan işletme yayınlanamaz
(`business_owner_unavailable`).

### Paketler

Paket incelenen koddur; sürümleri yüklenir, incelenir ve onaylanır. Akışın anlatımı
[MINI_UYGULAMA_GELISTIRME.md](MINI_UYGULAMA_GELISTIRME.md) belgesindedir.

| Uç nokta                                                 | Gövde                                     | Yanıt                 | Not                                              |
| -------------------------------------------------------- | ----------------------------------------- | --------------------- | ------------------------------------------------ |
| `GET /v1/admin/packages`                                 | —                                         | `List<AdminPackage>`  | Sürümlerinin özetiyle                            |
| `GET /v1/admin/packages/:id`                             | —                                         | `AdminPackage`        |                                                  |
| `PUT /v1/admin/packages/:id`                             | `adminSavePackageBodySchema`              | `AdminPackage`        | Paketin kimlik kaydını oluşturur ya da günceller |
| `POST /v1/admin/packages/:id/versions`                   | `multipart/form-data`, alan adı `package` | `AdminPackageVersion` | Zip arşivini taslak sürüm olarak yükler          |
| `GET /v1/admin/packages/:id/versions/:version`           | —                                         | `AdminPackageVersion` | Dosyalar, bulgular, önceki onaylı sürüme fark    |
| `GET /v1/admin/packages/:id/versions/:version/files/*`   | —                                         | `PackageFileContent`  | İnceleyenin açtığı dosya                         |
| `POST /v1/admin/packages/:id/versions/:version/submit`   | —                                         | `AdminPackageVersion` | Taslak → incelemede                              |
| `POST /v1/admin/packages/:id/versions/:version/approve`  | `adminApproveBodySchema`                  | `AdminPackageVersion` | İncelemede → onaylı                              |
| `POST /v1/admin/packages/:id/versions/:version/reject`   | `adminReviewBodySchema`                   | `AdminPackageVersion` | İncelemede → reddedildi; gerekçe zorunlu         |
| `POST /v1/admin/packages/:id/versions/:version/withdraw` | —                                         | `AdminPackageVersion` | Taslak ya da incelemede → vazgeçildi             |
| `POST /v1/admin/packages/:id/versions/:version/revoke`   | `adminRevokeBodySchema`                   | `AdminPackageVersion` | Onaylı → geri çekildi; gerekçe zorunlu           |
| `POST /v1/admin/packages/:id/versions/:version/rollout`  | —                                         | `AdminRolloutResult`  | Eski sürümdeki kayıtları bu sürüme geçirir       |

- Yükleme kurallara uymuyorsa hiçbir şey saklanmaz ve `package_invalid` (400) döner; `details`
  sorunları dosya dosya listeler. Arşiv `VADO_PACKAGE_MAX_MB` sınırını aşıyorsa `package_too_large`
  (413), bildirim dosyasındaki `id` adresteki paket kimliğiyle eşleşmiyorsa yine `package_invalid`
  döner.
- Sürüm numarası daha önce yüklenmişse `package_version_exists`, yüklenmiş bir sürümden küçükse
  `package_version_not_newer` (409) döner. Reddedilen ya da vazgeçilen sürümün numarası da yeniden
  kullanılamaz.
- Yüklenen sürümün içeriği değiştirilemez; yalnızca durumu değişir. Geçersiz durum geçişi
  `package_state_invalid` (409) döner. Bu kural veritabanında da uygulanır.
- İncelemeye gönderme ve onay, sürümün bütün dosyalarını depodan okuyup özetleriyle karşılaştırır;
  eksik ya da bozulmuş dosya `package_integrity_failed` (500) döner ve durum değişmez.
- `revoke`, sürümü yayınlayan bütün kayıtları kullanıcılara hemen kapatır. Gövdede
  `rollback: true` verilirse bu kayıtlar önceki yayınlarına döndürülür.
- `rollout`, paketin daha eski bir sürümünü yayınlayan her kaydı bu sürüme geçirir. Ayarları yeni
  sürümün beklediği alanlara uymayan kayıtlar geçirilmez ve `skipped` içinde nedenleriyle döner.
- `files/*` metin dosyalarının (512 KB'a kadar) içeriğini `text` alanında döndürür; görsel ve yazı
  tipi gibi dosyalarda `text` `null` olur.

### Uygulama kayıtları

| Uç nokta                                           | Gövde                              | Yanıt                       | Not                                            |
| -------------------------------------------------- | ---------------------------------- | --------------------------- | ---------------------------------------------- |
| `GET /v1/admin/miniapps?q=`                        | —                                  | `List<AdminMiniAppSummary>` | Kapalı olanlar dahil; ad ya da kimlik araması  |
| `GET /v1/admin/miniapps/:id`                       | —                                  | `AdminMiniApp`              | Yayın geçmişi ve satıcılarıyla                 |
| `PUT /v1/admin/miniapps/:id`                       | `adminSaveMiniAppBodySchema`       | `AdminMiniApp`              | Vitrini oluşturur ya da günceller              |
| `PATCH /v1/admin/miniapps/:id`                     | `adminUpdateMiniAppBodySchema`     | 204                         | Doğrular, açar, kapatır                        |
| `POST /v1/admin/miniapps/:id/releases`             | `adminPublishMiniAppBodySchema`    | `AdminMiniApp`              | Onaylı bir sürümü, ayarlarıyla yayınlar        |
| `POST /v1/admin/miniapps/:id/rollback`             | —                                  | `AdminMiniApp`              | Bir önceki yayına, o yayının ayarlarıyla döner |
| `PUT /v1/admin/miniapps/:id/config`                | `adminSaveMiniAppConfigBodySchema` | `AdminMiniApp`              | İşletme ayarlarını değiştirir                  |
| `PUT /v1/admin/miniapps/:id/merchants/:merchantId` | `adminSaveMerchantBodySchema`      | 204                         | Satıcıyı kayda bağlar                          |

- Yeni kayıt doğrulanmamış ve yayınsız başlar. `AdminMiniApp.offlineReason`, kaydın kullanıcılara
  neden kapalı olduğunu söyler (`disabled`, `unverified`, `unpublished`, `version_unavailable`,
  `url_mode_disabled`); açıksa `null` olur.
- Yalnızca onaylı sürüm yayınlanır (`miniapp_version_not_approved`). Ayarlar, sürümün bildirim
  dosyasındaki alanlara göre doğrulanır (`miniapp_config_invalid`). İlk yayından sonra kayıt başka
  bir pakete geçirilemez (`miniapp_package_mismatch`).
- Her yayın, ayar değişikliği ve geri alma yayın geçmişine (`releases`) eklenir; geçmiş satırları
  değiştirilemez. Geri dönülecek yayın yoksa `miniapp_no_previous_release` döner.
- `PUT` gövdesindeki `development` alanı, kaydı geliştiricinin sunucusundan açılan bir geliştirme
  kaydı yapar (giriş adresi, izinli kaynaklar, yetkiler, sürüm). Yalnızca geliştirme kipinde kabul
  edilir (`miniapp_url_mode_disabled`); paketle yayınlanmış bir kayıtta kullanılamaz
  (`miniapp_source_fixed`). Giriş adresinin kaynağı izinli kaynaklar arasında olmalıdır
  (`miniapp_origin_invalid`); adres, kaynaklar ya da yetkiler değişirse doğrulama sıfırlanır.

## Gerçek zamanlı olaylar

Bağlantı Socket.IO ile, API ile aynı adrese kurulur; belirteç bağlantı sırasında gönderilir:

```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:4000", {
  auth: { token },
  transports: ["websocket"],
});
```

Belirteç geçersizse bağlantı `unauthorized` hatasıyla reddedilir. Olayların tipleri
`packages/contracts/src/realtime.ts` dosyasındadır.

| Sunucudan gelen olay    | Veri                                      | İstemcinin yapacağı                      |
| ----------------------- | ----------------------------------------- | ---------------------------------------- |
| `message:new`           | `{ conversationId, message }`             | Mesajı sohbete ve listeye işler          |
| `conversation:read`     | `{ conversationId, userId, lastReadSeq }` | Okundu bilgisini günceller               |
| `conversation:typing`   | `{ conversationId, userId }`              | "Yazıyor" göstergesini 5 saniye gösterir |
| `conversations:changed` | —                                         | Sohbet listesini yeniden okur            |
| `contacts:changed`      | —                                         | Kişileri ve istekleri yeniden okur       |
| `session:revoked`       | —                                         | Cihazdaki oturumu kapatır                |
| `session:new-device`    | `{ sessionId, deviceName }`               | Yeni cihazdan giriş uyarısını gösterir   |

İstemciden sunucuya tek olay gider: `conversation:typing` (`{ conversationId }`). İstemci bunu en
fazla 3 saniyede bir gönderir; sunucu saniyede birden sık gelenleri yok sayar. Diğer her değişiklik
REST ile yapılır.

Olaylar "en az bir kez" güvencesi vermez. İstemci bağlantı yeniden kurulduğunda sohbet listesini ve
açık sohbetin mesajlarını REST ile tazelemelidir; mobil uygulama böyle yapar.

## Örnek: komut satırından giriş ve mesaj

Örnek veri yüklü bir geliştirme ortamında (demo modu), bash ile (macOS, Linux veya Windows'ta Git
Bash):

```bash
API=http://localhost:4000

# 1. Kod iste ve doğrula
curl -s -X POST $API/v1/auth/otp -H 'content-type: application/json' \
  -d '{"phone":"0555 000 00 01"}'
TOKEN=$(curl -s -X POST $API/v1/auth/otp/verify -H 'content-type: application/json' \
  -d '{"phone":"0555 000 00 01","code":"000000","deviceName":"Terminal","platform":"web","deviceId":"terminal-ornek-0001"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# 2. Sohbetleri listele
curl -s $API/v1/conversations -H "authorization: Bearer $TOKEN"

# 3. Bir sohbete mesaj gönder (SOHBET yerine listeden bir id yazın)
curl -s -X POST $API/v1/conversations/SOHBET/messages \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"kind":"text","clientId":"ornek-0001","body":"Merhaba"}'
```
