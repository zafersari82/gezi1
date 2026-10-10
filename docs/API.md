# API

Bu belge API'nin haritasıdır: hangi uç nokta ne alır, ne döndürür. İstek ve yanıt biçimlerinin kesin
tanımı kodda, `packages/contracts/src` içindeki şemalardadır; aşağıdaki tablolarda her biçimin
yanında o şemanın ya da tipin adı yazar. Mobil uygulama ve panel aynı tanımları kullandığı için
belge ile kod arasında fark görürseniz doğru olan koddur.

## Business canlı bağlantısı

| Uç                                            | Gövde                    | Yanıt                  | Erişim                                |
| --------------------------------------------- | ------------------------ | ---------------------- | ------------------------------------- |
| `POST /v1/business/:businessId/socket-ticket` | Boş nesne veya boş gövde | `BusinessSocketTicket` | VADO oturumu ve etkin işletme üyeliği |

Bilet, `ticket`, `expiresAt`, `socketUrl` alanlarını taşır. Socket.IO el sıkışmasına
`auth: { businessTicket: ticket }` verilir; VADO belirteci birlikte gönderilmez.
Bir bilet tek kez ve 60 saniye içinde kullanılabilir. Bağlantı en çok beş dakika
açık kalır; oturum daha önce biterse bağlantı da kapanır. Çıkış açık soketi kapatır.
`business:order`, `BusinessOrderEvent` biçimindedir: olay, işletme ve sipariş kimliği,
sıra numarası, `order.placed` veya `order.status_changed` türü. Alıcı güncel üyelikle
seçilir; bağlantı kurulduğunda veya yeniden kurulduğunda sipariş listesi okunmalıdır.

Business'ın `/api/auth/*`, `/api/selection` ve `/api/business/*` yolları Next.js
sunucusunun vekil yollarıdır. Oturum çerezden okunur; değişiklik isteğinde tam Origin
denetlenir. İşletme kimliği doğrulanmış seçimden gelir; vekil yol ve sorguları sınırlıdır.

## Genel kurallar

- **Adres:** geliştirmede `http://localhost:4000`. Tüm uç noktalar `/v1` ile başlar.
- **Biçim:** istek ve yanıt gövdeleri JSON'dur (`content-type: application/json`). JSON gövdesi en
  fazla 100 KB olabilir.
- **Oturum:** girişten sonra dönen belirteç her istekte `Authorization: Bearer <belirteç>` başlığıyla
  gönderilir. Belirteç istemeyen uç noktalar yalnızca kod isteme, kod doğrulama, `/health`,
  yüklenmiş dosyaların adresleri (`/media/…`) ve yayındaki mini uygulamaların sarmalayıcı belgesi
  ile paket dosyalarıdır (`/apps/…`). Yönetim uç noktaları panel hesabının belirtecini ve panel sunucusunun yönetici anahtarını birlikte ister. İşletme uçları sıradan VADO oturumu ve işletme üyeliğini doğrular; `/v1/capabilities` açık manifest sözleşmesidir.
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

`GET /health` veritabanına ulaşabiliyorsa `{ "status": "ok", "version": "2.6.0" }` döndürür.

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

| Uç nokta                     | Gövde                                  | Yanıt                  | Not                                            |
| ---------------------------- | -------------------------------------- | ---------------------- | ---------------------------------------------- |
| `GET /v1/me`                 | —                                      | `Me`                   | Oturum sahibinin hesabı                        |
| `PATCH /v1/me`               | `updateMeBodySchema`                   | `Me`                   | Ad, VADO kimliği, hakkında, fotoğraf, gizlilik |
| `DELETE /v1/me`              | —                                      | 204                    | Hesabı ve kişisel verileri siler               |
| `GET /v1/users/search?q=`    | —                                      | `List<UserProfile>`    | Telefon numarası ya da VADO kimliğiyle arama   |
| `GET /v1/users/:id`          | —                                      | `UserProfile`          | `relation` alanı aradaki ilişkiyi gösterir     |
| `PUT /v1/me/push-token`      | `pushTokenBodySchema`                  | 204                    | Bu oturumun bildirim adresi (2.5)              |
| `DELETE /v1/me/push-token`   | —                                      | 204                    | Bildirim adresini siler                        |
| `GET /v1/me/notifications`   | —                                      | `NotificationSettings` | Bildirim ayarları                              |
| `PATCH /v1/me/notifications` | `updateNotificationSettingsBodySchema` | `NotificationSettings` | En az bir alan                                 |

- Arama yalnızca tam eşleşme bulur ve en fazla bir sonuç döndürür; kısmi arama bilinçli olarak
  yoktur. "Numaramla bulunabileyim" ayarını kapatan kullanıcı numarayla bulunamaz.
- Telefon numarası yalnızca `Me` içinde yer alır; başka hiçbir yanıtta dönmez.
- Bir kullanıcı sizi engellediyse profili `user_not_found` döndürür.
- Hesap silindiğinde ad, numara, VADO kimliği, fotoğraflar, paylaşımlar, kişiler ve grup üyelikleri
  kaldırılır; gönderilmiş mesajlar karşı tarafta "Silinmiş Hesap" adıyla kalır.
- **Bildirim adresi** Expo push belirtecidir (`ExponentPushToken[…]`) ve isteği yapan oturuma
  bağlanır. Aynı adres başka bir oturumda kayıtlıysa oradan alınır. Çıkışta ve oturum kapatılınca
  silinir. Ayarlar: `pushMessages` (yeni mesaj bildirimi, varsayılan açık) ve `pushPreview`
  (bildirimde gönderen ve metin, varsayılan kapalı). Yeni cihazdan giriş bildirimi kapatılamaz.
  Bildirimin `data` alanı `{ type: "message", conversationId, eventId }` ya da `{ type: "new_device", eventId }`
  biçimindedir (`pushDataSchema`).

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

Mini uygulama kodu, panelden üretildiyse imzalı parametreler taşıyabilir (2.5; masa numarası, şube
kodu gibi). `resolve` yanıtında `type: "miniapp"` için `params` alanı bulunur; parametresiz kodlarda
boş nesnedir. Kullanıcının `POST /v1/qr` ile ürettiği kod parametre taşımaz. Parametreler en fazla
beş tanedir; ad `[a-z0-9_]{1,20}`, değer 1-64 karakterdir. Kabuk parametreleri mini uygulamaya
`app.getContext().params` olarak verir.

## İşletmeler ve mini uygulamalar

| Uç nokta                               | Gövde                      | Yanıt                  | Not                                                          |
| -------------------------------------- | -------------------------- | ---------------------- | ------------------------------------------------------------ |
| `GET /v1/businesses?category=`         | —                          | `List<Business>`       | Yalnızca onaylanmış işletmeler                               |
| `GET /v1/businesses/mine`              | —                          | `List<Business>`       | Kendi başvuruları, onay bekleyenler dahil                    |
| `POST /v1/businesses`                  | `createBusinessBodySchema` | `Business`             | Başvuru; panelden onaylanana kadar `pending`                 |
| `GET /v1/businesses/:id`               | —                          | `BusinessDetail`       | Bağlı mini uygulamalarla birlikte                            |
| `GET /v1/miniapps?category=`           | —                          | `List<MiniApp>`        | Yalnızca kullanıcılara açık kayıtlar                         |
| `GET /v1/miniapps/:id`                 | —                          | `MiniAppDetail`        | Kabuğun açarken okuduğu kayıt; ayarlarıyla                   |
| `GET /v1/miniapps/:id/identity`        | —                          | `MiniAppIdentity`      | Kullanıcının o uygulama kaydına özel kimliği                 |
| `POST /v1/miniapps/:id/identity-token` | —                          | `MiniAppIdentityToken` | Mini uygulamanın sunucusuna iletilecek imzalı belirteç (2.5) |
| `GET /v1/identity-keys`                | —                          | `IdentityKeySet`       | Oturumsuz; belirteci doğrulayan açık anahtarlar (JWKS)       |

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
- `identity-token` aynı koşullarla (kayıt açık, `identity.basic` yetkisi var, kullanıcı izin vermiş)
  bir JWT verir: `alg: EdDSA` (Ed25519), başlıkta `kid`; içerikte `iss` (API'nin dış adresi),
  `aud` (uygulama kaydının kimliği), `sub` (`openId`), `iat`, `exp` (beş dakika), `jti`. Ad, telefon
  ya da VADO kullanıcı kimliği taşımaz. Mini uygulama belirteci kendi sunucusuna gönderir; sunucu
  imzayı `GET /v1/identity-keys` anahtarlarıyla, `aud` değerini kendi kayıt kimliğiyle, `exp`
  değerini saatle denetler. Örnek: [MINI_UYGULAMA_GELISTIRME.md](MINI_UYGULAMA_GELISTIRME.md).
- `identity-keys` yanıtı `cache-control: public, max-age=600` taşır. Anahtar değiştirildiğinde eski
  anahtar ertesi günün sonuna kadar listede kalır ([ANAHTARLAR.md](ANAHTARLAR.md)).

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

Yönetim uç noktaları kullanıcı oturumuyla değil, iki şeyle birlikte çağrılır:

- `x-vado-admin-key` başlığındaki **yönetici anahtarı**: isteğin panel sunucusundan geldiğini
  kanıtlar. Anahtar yalnızca panel sunucusunda durur; yoksa ya da yanlışsa `admin_unauthorized`
  (401). Bu uç noktalar internete açılmamalıdır (bkz. [YAYIN.md](YAYIN.md)).
- `Authorization: Bearer <belirteç>` başlığındaki **panel hesabının oturumu**: isteği yapan
  hesabı kanıtlar. Oturum yoksa, süresi dolduysa ya da kapatıldıysa `admin_session_invalid` (401).

Her uç, gerektirdiği izni bildirir (aşağıdaki tablolarda "İzin" sütunu). Hesabın rolünde o izin
yoksa `forbidden` (403); hesabın parolasını bir yönetici belirlediyse (ilk hesap, sıfırlama) parola
değişene kadar izin gerektiren her uç `admin_password_change_required` (403) döner. Rollerin
izinleri `packages/contracts/src/admin-accounts.ts` içindeki `ADMIN_ROLE_PERMISSIONS`
tablosundadır. İşletme hesabının kapsamı ayrıca uygulanır (aşağıda, "Panel hesapları"):

| İzin                               | Sahip | İnceleyen | Operatör | Destek | Denetçi | İşletme |
| ---------------------------------- | :---: | :-------: | :------: | :----: | :-----: | :-----: |
| `overview.read`                    |   ✓   |     ✓     |    ✓     |   ✓    |    ✓    |         |
| `users.read`                       |   ✓   |           |          |   ✓    |    ✓    |         |
| `users.manage`                     |   ✓   |           |          |   ✓    |         |         |
| `businesses.read`                  |   ✓   |           |    ✓     |   ✓    |    ✓    |         |
| `businesses.manage`                |   ✓   |           |    ✓     |        |         |         |
| `reports.read`                     |   ✓   |           |          |   ✓    |    ✓    |         |
| `reports.manage`                   |   ✓   |           |          |   ✓    |         |         |
| `audit.read`                       |   ✓   |     ✓     |          |        |    ✓    |         |
| `packages.read`                    |   ✓   |     ✓     |    ✓     |        |    ✓    |         |
| `packages.upload`                  |   ✓   |           |    ✓     |        |         |         |
| `packages.review`                  |   ✓   |     ✓     |          |        |         |         |
| `packages.rollout`                 |   ✓   |           |    ✓     |        |         |         |
| `miniapps.read`                    |   ✓   |     ✓     |    ✓     |   ✓    |    ✓    |    ✓    |
| `miniapps.manage`                  |   ✓   |           |    ✓     |        |         |         |
| `miniapps.configure` (ayar, QR)    |   ✓   |           |    ✓     |        |         |    ✓    |
| `miniapps.publish`                 |   ✓   |           |    ✓     |        |         |         |
| `emergency.disable` (acil kapatma) |   ✓   |     ✓     |    ✓     |        |         |         |
| `accounts.manage`                  |   ✓   |           |          |        |         |         |

Yönetim işlemlerinin denetim kaydına ve "kim yaptı" alanlarına hesabın kimliği yazılır. Yanıtlarda
işlemi yapan `Actor` biçimindedir: `{ id, name }`. `id`, hesabın ya da kullanıcının kimliğidir;
hesap olmayanlar için `admin` (2.4'ten önceki ortak panel hesabı), `cli` (komut satırı) ya da
`anonymous` (var olmayan hesap adıyla giriş denemesi) yazar.

### Panel girişi ve hesabım

| Uç nokta                                 | Erişim       | Gövde                           | Yanıt                |
| ---------------------------------------- | ------------ | ------------------------------- | -------------------- |
| `POST /v1/admin/auth/login`              | anahtar      | `adminLoginBodySchema`          | `AdminLoginResult`   |
| `POST /v1/admin/auth/totp-setup`         | yarım oturum | —                               | `AdminTotpSetup`     |
| `POST /v1/admin/auth/totp-setup/confirm` | yarım oturum | `adminTotpConfirmBodySchema`    | `AdminSessionResult` |
| `POST /v1/admin/auth/second-factor`      | yarım oturum | `adminSecondFactorBodySchema`   | `AdminSessionResult` |
| `POST /v1/admin/auth/logout`             | oturum       | —                               | 204                  |
| `GET /v1/admin/me`                       | oturum       | —                               | `AdminMe`            |
| `PUT /v1/admin/me/password`              | oturum       | `adminChangePasswordBodySchema` | 204                  |
| `GET /v1/admin/me/sessions`              | oturum       | —                               | `List<AdminSession>` |
| `DELETE /v1/admin/me/sessions/:id`       | oturum       | —                               | 204                  |
| `POST /v1/admin/me/recovery-codes`       | oturum       | `adminTotpConfirmBodySchema`    | `AdminRecoveryCodes` |

- Giriş iki adımdır. `login` parolayı doğrular ve yalnızca ikinci adıma yarayan bir **yarım
  oturum** belirteci döndürür (10 dakika); `next`, ikinci adımın kurulu olup olmadığını söyler
  (`totp` ya da `totp_setup`). İkinci adım geçilince yeni bir belirteçle **tam oturum** açılır.
  Yarım oturumla tam oturum gerektiren uç, tam oturumla ikinci adım ucu çağrılamaz
  (`admin_session_invalid`).
- Hesap yoksa, kapalıysa, kilitliyse ya da parola yanlışsa `admin_login_failed` (401) döner;
  dördü dışarıdan ayırt edilmez. Parola ve ikinci adım denemeleri birlikte sayılır; beş hatalı
  denemeden sonra hesap 15 dakika kilitlenir. Kilit, parola sıfırlanınca da açılır.
- İkinci adım ya `{ "code": "123456" }` (doğrulama uygulamasının kodu) ya da
  `{ "recoveryCode": "abcd-efgh-ijkl-mnop" }` (kurtarma kodu; tire ve büyük harf yok sayılır)
  ile geçilir. Hatalı ya da daha önce kullanılmış kod `admin_second_factor_invalid` (401) döner.
  Demo modunda `000000` kodu da geçer (canlı ortamda demo modu açılamaz).
- `totp-setup` her çağrıda yeni bir sır üretir; ikinci adım kuruluysa `admin_totp_already_enabled`
  (409). Kurulum, sırla üretilen ilk kodla `totp-setup/confirm` çağrılınca etkinleşir; kurtarma
  kodları yalnızca bu yanıtta (ve `me/recovery-codes` ile yenilenince) bir kez döner.
- Tam oturum 30 dakika kullanılmazsa ya da açıldıktan 12 saat sonra kapanır.
- Parola değişikliği mevcut parolayı ister (`admin_password_invalid`), yenisi en az 12 karakter
  olmalı ve eskisiyle aynı olmamalıdır (`admin_password_reused`). Hesabın diğer oturumları kapanır.
- Panel sunucusu, oturum listesinde ve denetim kaydında yöneticinin tarayıcısının görünmesi için
  `x-vado-client-ip` ve `x-vado-client-agent` başlıklarını gönderir; API bunlara yalnızca
  yönetici anahtarı doğrulandıktan sonra bakar.

### Panel hesapları

| Uç nokta                                     | İzin              | Gövde                          | Yanıt                    |
| -------------------------------------------- | ----------------- | ------------------------------ | ------------------------ |
| `GET /v1/admin/accounts`                     | `accounts.manage` | —                              | `List<AdminAccount>`     |
| `POST /v1/admin/accounts`                    | `accounts.manage` | `adminCreateAccountBodySchema` | `AdminTemporaryPassword` |
| `PATCH /v1/admin/accounts/:id`               | `accounts.manage` | `adminUpdateAccountBodySchema` | `AdminAccount`           |
| `POST /v1/admin/accounts/:id/password-reset` | `accounts.manage` | —                              | `AdminTemporaryPassword` |
| `POST /v1/admin/accounts/:id/totp-reset`     | `accounts.manage` | —                              | `AdminAccount`           |

- Yeni hesabın ve sıfırlanan parolanın geçici parolası yalnızca yanıtta, bir kez döner; hesap ilk
  girişte parolasını değiştirir ve ikinci adımı kurar. Kullanıcı adı alınmışsa
  `admin_username_taken` (409).
- Rol değişince ya da hesap kapatılınca (`status: "disabled"`), parola ya da ikinci adım
  sıfırlanınca hesabın açık oturumları kapanır. Son etkin sahip hesabı sahiplikten çıkarılamaz ve
  kapatılamaz (`admin_last_owner`, 409); kural veritabanında da korunur.
- Hesap silinmez, kapatılır: denetim kaydında adı kalır.
- **İşletme hesabı (2.5):** `role: "business"` ile açılır ve `businessId` ister; diğer roller
  `businessId` almaz (`validation_failed`). İşletme yoksa `business_not_found`. Yanıttaki
  `business` alanı (`{ id, name }`) hesabın işletmesidir; ekip hesaplarında `null`. İşletme
  hesabının rolü değiştirilemez, ekip hesabı işletme rolüne geçirilemez
  (`admin_scope_change_forbidden`, 409); kural veritabanında da korunur.
- İşletme hesabı yalnızca `miniapps.read` ve `miniapps.configure` izinlerini kullanır ve yalnızca
  işletmesinin satıcı olarak bağlı olduğu uygulama kayıtlarını görür: liste süzülür, başka bir
  kayıt `miniapp_not_found` (404) döner. Yayın geçmişinde VADO ekibinin hesapları "VADO ekibi"
  adıyla görünür, kayda bağlı başka işletmelerin satıcıları gösterilmez.

### Kullanıcılar, işletmeler, şikayetler

| Uç nokta                         | İzin                | Gövde                           | Yanıt                 | Not                                           |
| -------------------------------- | ------------------- | ------------------------------- | --------------------- | --------------------------------------------- |
| `GET /v1/admin/overview`         | `overview.read`     | —                               | `AdminOverview`       | Sayılar ve yürürlükteki ayarlar               |
| `GET /v1/admin/users?q=`         | `users.read`        | —                               | `List<AdminUser>`     | En yeni 200 kayıt; ad, numara, kimlik araması |
| `PATCH /v1/admin/users/:id`      | `users.manage`      | `adminUpdateUserBodySchema`     | 204                   | Askıya alır ya da yeniden açar                |
| `GET /v1/admin/businesses?q=`    | `businesses.read`   | —                               | `List<AdminBusiness>` |                                               |
| `PATCH /v1/admin/businesses/:id` | `businesses.manage` | `adminUpdateBusinessBodySchema` | 204                   | Onaylar, yayınlar, askıya alır                |
| `GET /v1/admin/reports`          | `reports.read`      | —                               | `List<AdminReport>`   |                                               |
| `PATCH /v1/admin/reports/:id`    | `reports.manage`    | `adminUpdateReportBodySchema`   | 204                   | Çözüldü ya da yeniden açık                    |
| `GET /v1/admin/audit`            | `audit.read`        | —                               | `Page<AuditEntry>`    | Denetim kaydı, sayfalı                        |

Askıya alınan kullanıcının tüm oturumları kapanır. Sahibi etkin olmayan işletme yayınlanamaz
(`business_owner_unavailable`).

### Paketler

Paket incelenen koddur; sürümleri yüklenir, incelenir ve onaylanır. Akışın anlatımı
[MINI_UYGULAMA_GELISTIRME.md](MINI_UYGULAMA_GELISTIRME.md) belgesindedir.

| Uç nokta                                                 | İzin                | Gövde                                     | Yanıt                 | Not                                              |
| -------------------------------------------------------- | ------------------- | ----------------------------------------- | --------------------- | ------------------------------------------------ |
| `GET /v1/admin/packages`                                 | `packages.read`     | —                                         | `List<AdminPackage>`  | Sürümlerinin özetiyle                            |
| `GET /v1/admin/packages/:id`                             | `packages.read`     | —                                         | `AdminPackage`        |                                                  |
| `PUT /v1/admin/packages/:id`                             | `packages.upload`   | `adminSavePackageBodySchema`              | `AdminPackage`        | Paketin kimlik kaydını oluşturur ya da günceller |
| `POST /v1/admin/packages/:id/versions`                   | `packages.upload`   | `multipart/form-data`, alan adı `package` | `AdminPackageVersion` | Zip arşivini taslak sürüm olarak yükler          |
| `GET /v1/admin/packages/:id/versions/:version`           | `packages.read`     | —                                         | `AdminPackageVersion` | Dosyalar, bulgular, önceki onaylı sürüme fark    |
| `GET /v1/admin/packages/:id/versions/:version/files/*`   | `packages.read`     | —                                         | `PackageFileContent`  | İnceleyenin açtığı dosya                         |
| `POST /v1/admin/packages/:id/versions/:version/submit`   | `packages.upload`   | —                                         | `AdminPackageVersion` | Taslak → incelemede                              |
| `POST /v1/admin/packages/:id/versions/:version/approve`  | `packages.review`   | `adminApproveBodySchema`                  | `AdminPackageVersion` | İncelemede → onaylı                              |
| `POST /v1/admin/packages/:id/versions/:version/reject`   | `packages.review`   | `adminReviewBodySchema`                   | `AdminPackageVersion` | İncelemede → reddedildi; gerekçe zorunlu         |
| `POST /v1/admin/packages/:id/versions/:version/withdraw` | `packages.upload`   | —                                         | `AdminPackageVersion` | Taslak ya da incelemede → vazgeçildi             |
| `POST /v1/admin/packages/:id/versions/:version/revoke`   | `emergency.disable` | `adminRevokeBodySchema`                   | `AdminPackageVersion` | Onaylı → geri çekildi; gerekçe zorunlu           |
| `POST /v1/admin/packages/:id/versions/:version/rollout`  | `packages.rollout`  | —                                         | `AdminRolloutResult`  | Eski sürümdeki kayıtları bu sürüme geçirir       |

- Yükleme kurallara uymuyorsa hiçbir şey saklanmaz ve `package_invalid` (400) döner; `details`
  sorunları dosya dosya listeler. Arşiv `VADO_PACKAGE_MAX_MB` sınırını aşıyorsa `package_too_large`
  (413), bildirim dosyasındaki `id` adresteki paket kimliğiyle eşleşmiyorsa yine `package_invalid`
  döner.
- Sürüm numarası daha önce yüklenmişse `package_version_exists`, yüklenmiş bir sürümden küçükse
  `package_version_not_newer` (409) döner. Reddedilen ya da vazgeçilen sürümün numarası da yeniden
  kullanılamaz.
- **Dört göz ilkesi:** sürümü yükleyen ya da incelemeye gönderen hesap onu onaylayamaz
  (`package_self_review`, 409); kural veritabanında da uygulanır. 2.4'ten önce incelemeye
  gönderilmiş sürümün göndereni bilinmez (`submittedBy: null`); onay `package_resubmit_required`
  (409) döner. Böyle bir sürüm için `submit` çağrılınca durum değişmez, gönderen olarak çağıran
  hesap yazılır; sonra başka bir hesap onaylar. Sürümü yükleyen kendi sürümünü reddedebilir ve
  sürümden vazgeçebilir.
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

| Uç nokta                                           | İzin                 | Gövde                              | Yanıt                       | Not                                                           |
| -------------------------------------------------- | -------------------- | ---------------------------------- | --------------------------- | ------------------------------------------------------------- |
| `GET /v1/admin/miniapps?q=`                        | `miniapps.read`      | —                                  | `List<AdminMiniAppSummary>` | Kapalı olanlar dahil; ad ya da kimlik araması                 |
| `GET /v1/admin/miniapps/:id`                       | `miniapps.read`      | —                                  | `AdminMiniApp`              | Yayın geçmişi ve satıcılarıyla                                |
| `PUT /v1/admin/miniapps/:id`                       | `miniapps.manage`    | `adminSaveMiniAppBodySchema`       | `AdminMiniApp`              | Vitrini oluşturur ya da günceller                             |
| `PATCH /v1/admin/miniapps/:id`                     | `miniapps.manage`    | `adminUpdateMiniAppBodySchema`     | 204                         | Doğrular, açar, kapatır                                       |
| `POST /v1/admin/miniapps/:id/releases`             | `miniapps.publish`   | `adminPublishMiniAppBodySchema`    | `AdminMiniApp`              | Onaylı bir sürümü, ayarlarıyla yayınlar                       |
| `POST /v1/admin/miniapps/:id/disable`              | `emergency.disable`  | —                                  | 204                         | Acil kapatma: kaydı kullanıcılara kapatır                     |
| `POST /v1/admin/miniapps/:id/rollback`             | `miniapps.publish`   | —                                  | `AdminMiniApp`              | Bir önceki yayına, o yayının ayarlarıyla döner                |
| `PUT /v1/admin/miniapps/:id/config`                | `miniapps.configure` | `adminSaveMiniAppConfigBodySchema` | `AdminMiniApp`              | İşletme ayarlarını değiştirir                                 |
| `POST /v1/admin/miniapps/:id/qr`                   | `miniapps.configure` | `adminIssueMiniAppQrBodySchema`    | `IssuedQr`                  | İmzalı, isteğe bağlı parametreli kod; denetim kaydına yazılır |
| `PUT /v1/admin/miniapps/:id/merchants/:merchantId` | `miniapps.manage`    | `adminSaveMerchantBodySchema`      | 204                         | Satıcıyı kayda bağlar                                         |

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

## 2.6 ilk aşama: işletme bağlamı

Bu uçlar panel anahtarı yerine kullanıcının kendi VADO oturumunu kullanır. Sahip ve yönetici
şubeleri, çalışma saatlerini ve uygulama örneklerini yönetir; personel şubeleri okuyabilir.
Üyelik ekleme veya kapatma yalnızca sahibin yetkisidir. Sahip üyeliğinin kimliği ve rolü
veritabanında da korunur.

| Yöntem    | Yol                                           | İşlem                                             |
| --------- | --------------------------------------------- | ------------------------------------------------- |
| GET       | `/v1/business/memberships`                    | Kendi etkin üyelikleriniz                         |
| GET, PUT  | `/v1/business/:businessId/members`            | Üyeleri listeleme ve sahip tarafından güncelleme  |
| GET, POST | `/v1/business/:businessId/branches`           | Şubeler                                           |
| PUT       | `/v1/business/:businessId/branches/:id`       | Şube güncelleme                                   |
| GET, PUT  | `/v1/business/:businessId/branches/:id/hours` | Haftalık çalışma aralıkları                       |
| GET, POST | `/v1/business/:businessId/app-instances`      | Mevcut uygulama-satıcı kaydına bağlı motor örneği |
| POST      | `/v1/shell/business-context`                  | Kabuk için doğrulanmış işletme ve müşteri bağlamı |

Saat aralığı `weekday` (0=Pazartesi), `opensAt`, `closesAt` alanları taşır; saatler günün
başından itibaren dakikadır. Geceyi aşan kapanış 1440'tan büyük olabilir; süre en çok 24 saattir.
Hafta sınırında da çakışma reddedilir. Şubenin IANA saat dilimi ayrıca saklanır.

Kabuk bağlamı `{businessId, appInstanceId}` alır; kalıcı, rastgele `businessCustomerId` döndürür.
Aynı işletmede farklı uygulama örnekleri aynı müşteri kimliğini kullanır. Başka işletmede kimlik
farklıdır; hesap silinince kullanıcıyla bağı kopar. Üyelik veya uygulama örneği başka işletmeye
aitse erişim verilmez. Müşteri bağlamı yalnızca etkin, doğrulanmış işletme ve yayımlanmış,
satıcı bağı etkin mini uygulama için kurulabilir.

## 2.6 ikinci aşama: ortak katalog

Tutarlar kuruş, `vatBasisPoints` yüzde biriminin yüzde biridir (1000=%10). Para birimi TRY'dir.
Şube fiyatı varsa genel fiyatın önüne geçer. KDV, seçenek tutarları dahil satırın toplamından
ayrılır ve satır başına en yakın kuruşa yuvarlanır; hesap BigInt ile yapılır. Aynı satırın
seçenekleri ürünün KDV oranını kullanır. İstek içindeki fiyat sipariş için yetkili kaynak değildir.

| Yöntem | Yol                                                        | İşlem                              |
| ------ | ---------------------------------------------------------- | ---------------------------------- |
| GET    | `/v1/business/:businessId/catalog`                         | İşletmenin bütün kataloğu          |
| POST   | `/v1/business/:businessId/catalog/categories`              | Kategori oluşturma                 |
| PUT    | `/v1/business/:businessId/catalog/categories/:id`          | Kategori güncelleme                |
| POST   | `/v1/business/:businessId/catalog/items`                   | Ürün ve ilk fiyat                  |
| PUT    | `/v1/business/:businessId/catalog/items/:id`               | Ürün ve fiyat güncelleme           |
| PUT    | `/v1/business/:businessId/catalog/items/:id/prices`        | Genel veya şube fiyatı             |
| POST   | `/v1/business/:businessId/catalog/option-groups`           | Seçenek grubu ve seçenekler        |
| PUT    | `/v1/business/:businessId/catalog/option-groups/:id`       | Grubu güncelleme                   |
| PUT    | `/v1/business/:businessId/catalog/items/:id/option-groups` | Ürünün grup bağları                |
| POST   | `/v1/business/:businessId/catalog/quote`                   | Güncel fiyat görüntüsü             |
| GET    | `/v1/shell/:businessId/:appInstanceId/catalog?branchId=…`  | Doğrulanmış kabuk müşteri kataloğu |

Ürün, kategori, fiyat, grup, seçenek ve bütün bağlar aynı işletmeye ait olmalıdır. Yönetim
sahip ve yöneticidedir; personel okuyabilir. Müşteri yalnızca etkin ürünleri ve bu ürünlerde
kullanılan etkin seçenekleri görür. Başka işletmenin şubesi veya kaydı bağlamda kullanılamaz.
Grup güncellerken mevcut seçenekler `id` ile gönderilir; gönderilmeyenler kapatılır, kimlikleri
başka gruba taşınmaz. `minSelected` zorunlu seçim sayısı, `maxSelected` üst sınırdır. Doğrudan
SQL'de de zorunlu grubun yeterli etkin seçeneği olması gerekir.

Fiyat görüntüsü gövdesi `{branchId, lines:[{itemId, quantity, optionIds}]}` biçimindedir.
Yanıt satırların bulunurluğunu, seçenekleri, birim fiyatlarını, toplam ve KDV'yi taşır. Eksik
zorunlu seçim veya kapalı ürün `available:false` olur. Bir fiyat görüntüsü işlemi sürerken
katalog fiyatları ve bağları değiştirilemez; doğrudan SQL de aynı kilit kuralına uyar.

## 2.6 olay teslimi

| Uç                                       | İzin / yanıt                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /v1/admin/events/dead`              | `events.read`; `listOf(deadEventSchema)`, yalnızca kimlik ve teslim metadata'sı |
| `POST /v1/admin/events/:queue/:id/retry` | `events.retry`; `queue` tenant/platform, gövdesiz 204 ve denetim kaydı          |

Yeni push verisi önceki `message` / `new_device` alanlarına UUID `eventId` ekler; eski
istemci verisi sözleşmede uyumluluk için kabul edilir. Aynı olay yeniden gönderilebilir.
Tekrar yardımcısı 24 saatlik anahtarı işletme + uygulama örneği + müşteri + işlemle
bağlar; aynı gövdeye ilk HTTP yanıtı, farklı gövdeye `409 idempotency_conflict` döner.
Sepet checkout ucu bu yardımcıyı kullanır.

## 2.6 sunucuda sepet ve sipariş

Kabuk yollarının kökü `/v1/shell/:businessId/:appInstanceId`; oturum kabukta kalır.
`POST /v1/shell/business-context` isteğine seçili `miniAppId` de eklenebilir;
eşleşmeyen örnek `business_not_found` alır.

| Yöntem | Kök altındaki yol     | Gövde / yanıt                                                          |
| ------ | --------------------- | ---------------------------------------------------------------------- |
| POST   | `/carts`              | `{branchId, fulfilment:"pickup"}` → `Cart`                             |
| GET    | `/carts/:id`          | Güncel katalogdan yeniden hesaplanmış `Cart`                           |
| PUT    | `/carts/:id`          | `{expectedVersion,lines:[{itemId,quantity,optionIds}]}`                |
| POST   | `/carts/:id/checkout` | `Idempotency-Key` + `{cartVersion,seenTotalMinor,quoteHash}` → `Order` |
| GET    | `/orders/:id`         | Müşterinin kendi sipariş görüntüsü ve geçmişi                          |

Düzenleme çakışması `409 cart_version_conflict`, checkout değişimi
`409 cart_changed` döndürür; `error.details.cart` güncel sepeti taşır. KDV, seçenek
fiyatı, bulunurluk veya satır adı toplam aynı kalsa bile `quoteHash` ile karşılaştırılır.
Yeni onay yeni tekrar anahtarıyla gönderilir. Aynı anahtar/gövde ilk HTTP yanıtını
(tekrar eden 409 dahil) döndürür; farklı gövde `idempotency_conflict` alır.

İşletme yolları: `GET /v1/business/:businessId/orders` (cursor, limit, status,
virgülle ayrılmış `statuses`, `active=true|false`),
`GET /v1/business/:businessId/orders/:id`,
`PUT /v1/business/:businessId/orders/:id/status` (`{expectedVersion,status}`).

Sipariş süzgeçleri SQL'de **sayfalama öncesinde** uygulanır. Birlikte verilen
`status`, `statuses` ve `active` koşullarının kesişimi alınır. `active=true` bitiş
durumlarını dışarıda bırakır; `active=false` yalnız bitiş durumlarını döndürür.
`statuses` 1–20 benzersiz durum ister. Business, aktif liste ve manifestin hazırlık
kuyruğu için bu sorguları kullanır; canlı yenilemede yüklenen sayfaları yeniden okur.
Sahip, yönetici ve personel kendi işletmelerinde okuyup durum değiştirebilir.
Çakışma `order_version_conflict`, yasak geçiş `order_state_invalid` olur.

SDK `vado.ordering.getCatalog/openCart/getCart/replaceCart/checkout/getOrder`
yalnızca köprüyü kullanır. Parametreler işletme, uygulama veya oturum içermez.
`replaceCart` sonucu `type:cart|cart_conflict`, checkout sonucu
`type:order|cart_changed` ile güncel sepeti veya siparişi taşır.

## 2.6 yetenek sözleşmesi

`GET /v1/capabilities` oturumsuz, veri içeren `{engines,packages}` sözleşmesi
döndürür. Her kayıt `id`, `version`, `engine`, `dependsOn`, `configSchema`,
`defaults`, `permissions`, `events`, `stateMachine`, `api`, `customerBlocks`,
`businessBlocks`, `validation` taşır. `configSchema` depodaki Zod şemasından
üretilir; müşteri blokları 2.6'da boştur.

İşletme: `GET /v1/business/:businessId/app-instances/:id/capabilities`;
`PUT /v1/business/:businessId/app-instances/:id/capabilities/:capabilityId`
gövdesi `{version,enabled,config}`. Okuma sahip/yönetici/personel, değişiklik
sahip/yöneticidir. Yanıt örnek bağlamını, ayarları, sürümlü paket kimliklerini,
birleştirilmiş durum grafiğini ve işletme bloklarını verir. Yanlış sürüm,
bağımlılık veya ayar `validation_failed` olur.

Deneme paketi `ordering.preparation`, sürüm `1.0.0`, ayarı
`{stationLabel:"Hazırlık"}` (1–40 karakter). Kabulden sonra hazırlanıyor → hazır
→ tamamlandı ekler; iptal kenarları korunur. Sipariş `capabilities` alanında
`ordering.preparation@1.0.0` görüntüsü saklar. Paket kapansa da sipariş bu
akışla biter; yeni sipariş çekirdek akışını kullanır.

## 2.7 restoran, mutfak ve ortak tablet

`POST /v1/shell/:businessId/:appInstanceId/carts/:id/reset`, `{expectedVersion}`
alır; müşteri/işletme/örnek yalıtımı ve CAS ile açık sepeti `expired` yapar.
Geçersiz teslim saati bırakmayı engellemez. Aynı bırakma tekrarında aynı son sürüm
döner; checkout olmuş sepet `cart_closed`, eski sürüm `cart_version_conflict`
(döndürülen güncel sepet ile) verir. SDK `ordering.resetCart` sonucu
`type:cart|cart_conflict` taşır.

Sipariş özeti ve ayrıntısı sunucudan çözülmüş `tableLabel: string|null` taşır;
müşteri ve dar mutfak cihazı için aynı kapsam filtreleri geçerlidir. Sıfır toplam
`paymentStatus:paid`, `paymentVersion:0` taşır; tahsilat kaydı gerektirmez.

Shell kökü `/v1/shell/:businessId/:appInstanceId`; müşterinin kendi işletme kimliği
sunucuda çözülür. İşletme kökü `/v1/business/:businessId`; her işlem güncel üyeliği
doğrular. Şemalar `@vado/contracts` kaynağındadır; bilinmeyen/gereksiz yetki alanı
kabul edilmez. Katalogda `includeUnavailable` ve teslim zamanı `at` sorgusu vardır.

| Kök         | Yöntem / yol                                                     | İşlev                                                     |
| ----------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| Shell       | `GET /restaurant`                                                | İşletme/örnek, şubeler, açık durumu ve restoran paketleri |
| Shell       | `GET /fulfilment-slots?branchId=…`                               | Yerel çalışma/prep/istisnaya uygun zamanlar               |
| Shell       | `GET /orders`                                                    | Yalnız müşterinin kendi sipariş geçmişi                   |
| Shell       | `POST /table-sessions`                                           | `{qr}` ham imzasını doğrulayarak masaya katılma           |
| Shell       | `GET /table-sessions/:id`                                        | Kendi katılımının açık/kapalı durumu                      |
| Shell       | `GET /table-sessions/:id/bill`                                   | Yalnız kendi tutarı, ödenen ve kalan                      |
| Shell       | `POST /table-sessions/:id/requests`                              | Idempotency-Key + `{kind:"waiter"                         | "bill"}` |
| Her iki kök | `GET /live-events?cursor=…`                                      | Kapsama göre kalıcı olay imleci                           |
| İşletme     | `GET /kitchen-queue`                                             | FIFO aktif işler; instance/branch/cursor süzgeci          |
| İşletme     | `POST /orders/:id/accept`                                        | `{expectedVersion,preparationMinutes}`                    |
| İşletme     | `POST /orders/:id/reject`                                        | `{expectedVersion,reason}`                                |
| İşletme     | `POST /orders/:id/payment`                                       | `{expectedPaymentVersion,place,method}`                   |
| İşletme     | `GET /tables`, `POST /tables`, `PUT /tables/:id`                 | Masa yönetimi; güncelleme expectedVersion ister           |
| İşletme     | `POST /tables/:id/qr`                                            | İmzalı masa/şube/örnek QR                                 |
| İşletme     | `GET /table-requests`, `POST /table-requests/:id/resolve`        | Çağrılar ve expectedVersion ile karşılandı                |
| İşletme     | `GET /table-sessions/:id/bill`, `POST /table-sessions/:id/close` | Birleşik hesap; kapanış expectedVersion ister             |
| İşletme     | `GET /kitchen-devices`, `POST /kitchen-devices`                  | Cihazlar; onay `{code,label,branchId,appInstanceId}`      |
| İşletme     | `POST /kitchen-devices/:id/revoke`                               | Cihaz ve açık bağlantısını kapatma                        |

Sepet açma `{branchId,fulfilment,tableSessionId,scheduledAt}` alır; satırlara `note`
eklenir. Mutfak kabulü 1–240 dakika, ret en az üç karakter ister. Sipariş
`estimatedReadyAt`, `preparationMinutes`, `rejectionReason`, ayrı `paymentVersion`
ve `paymentStatus` taşır. `place` table/counter, `method` cash/card; card fiziksel
POS'tur. Online ödeme bu ucu kullanmaz. Ödeme ek kayıtla atomik tutulur.

Kişisel giriş gerektirmeyen `POST /v1/kitchen-pairings` kısa kod ve gizli poll değeri
verir; `POST /v1/kitchen-pairings/:id/poll` yalnız o gizli değerle sonuç alınmasını
sağlar. Gizli değer Business BFF'de HttpOnly çerezdedir. Cihaz bearer ile `/v1/kitchen`
altında `GET /device`, `/queue`, `/orders`, `/orders/:id`, `/live-events`;
`POST /orders/:id/accept`, `/reject`, `PUT /orders/:id/status`, `POST /socket-ticket`
kullanır. Kapsam cihaz kaydından gelir; istemci başka şube/örnek seçemez. Tahsilat,
ürün/ayar erişimi yoktur. Cihaz ve şube/işletme durumu her işlemde yeniden denetlenir.

Şube işletme kökünde `GET/PUT /branches/:id/ordering-settings`,
`GET/PUT /branches/:id/hours-exceptions` (yazma gövdesinde tarih),
`GET /branches/:id/availability`,
`PUT /catalog/items/:id/availability` (gövdede şube),
`GET/PUT /catalog/items/:id/menu-windows` ve
`GET/PUT /catalog/categories/:id/menu-windows` (sorgu/gövdede şube) uçları vardır. Değişiklikler beklenen sürümle
uygulanır. [RESTORAN_2.7.md](RESTORAN_2.7.md) ve gerçek rota/şema kaynağı kurulumu
tamamlar. `GET /v1/capabilities` yeni dört paketin tipli manifestinden üretilen
ayar şeması, uçlar, olaylar ve arayüz bloklarını yayımlar.

## Konum platformu (2.8.0-alpha.1)

Bütün uçlar VADO oturumu ister. Adres sahibi oturumdan alınır; iş uçlarında
üyelik ve şube/işletme bağı her istekte doğrulanır. Katalog yüklenmemişse
`location_catalog_not_ready` (503) döner. Kurulum ve lisans: [KONUM.md](KONUM.md).

| Yöntem | Yol                                                                     | Sonuç / girdi                                |
| ------ | ----------------------------------------------------------------------- | -------------------------------------------- |
| GET    | `/v1/location/countries`                                                | Ülkeler: `{ items }`                         |
| GET    | `/v1/location/countries/:id/provinces`                                  | Ülkenin illeri: `{ items }`                  |
| GET    | `/v1/location/provinces/:id/districts`                                  | İlin ilçeleri: `{ items }`                   |
| GET    | `/v1/location/districts/:id/neighborhoods`                              | İlçenin mahalleleri: `{ items }`             |
| GET    | `/v1/location/neighborhoods/:id`                                        | Ülke/il/ilçe/mahalle tam zinciri             |
| GET    | `/v1/location/addresses`                                                | Sahibin arşivlenmemiş adresleri: `{ items }` |
| GET    | `/v1/location/addresses/:id`                                            | Sahibin adresi; arşivli kayıt okunabilir     |
| POST   | `/v1/location/addresses`                                                | Adres oluşturur                              |
| PUT    | `/v1/location/addresses/:id`                                            | Adres gövdesi ve `expectedVersion`           |
| POST   | `/v1/location/addresses/:id/archive`                                    | `{ expectedVersion }`                        |
| GET    | `/v1/business/:businessId/branches/:branchId/service-areas`             | Üyenin bölgeleri: `{ items }`                |
| POST   | `/v1/business/:businessId/branches/:branchId/service-areas`             | Sahip/yönetici: `{ name, neighborhoodIds }`  |
| PUT    | `/v1/business/:businessId/branches/:branchId/service-areas/:id`         | Bölge gövdesi ve `expectedVersion`           |
| POST   | `/v1/business/:businessId/branches/:branchId/service-areas/:id/disable` | Sahip/yönetici: `{ expectedVersion }`        |

Bütün POST/PUT uçları `idempotency-key` başlığını ister (1–128 karakter,
harf/rakam/nokta/alt çizgi/iki nokta/tire). Aynı anahtar ve girdi eski yanıtı
getirir; değişmiş girdi `idempotency_conflict` (409), eski sürüm
`location_version_conflict` (409), arşivli/devre dışı kayıt değişikliği
`location_inactive` (409) verir. Geçersiz ülke/il/ilçe/mahalle bağı
`location_parent_invalid` (400) verir. Yabancı adres `not_found` (404), yetkisiz
bölge yazması `forbidden` (403) olur.

Adres gövdesi: `label` (1–60), `recipientName` (2–120), uluslararası `phone`,
`countryId`, `provinceId`, `districtId`, `neighborhoodId`, `addressLine` (5–500),
`door` (1–80), `note` (en çok 500; boş olabilir). Yanıt bunlara `id`, `version`,
`archived`, `geography`, `createdAt`, `updatedAt` ekler. Bölge adı 1–100 karakter,
mahalle listesi 1–1000 benzersiz UUID'dir; yanıt işletme/şube kimliği, sürüm,
`active` ve zamanları ekler. Şemaların kaynağı `packages/contracts/src/location.ts`.

SDK LocationAPI katalog için `location.catalog` yetkisini ister. Adres için
`location.addresses` yetkisi ve ayrıca kullanıcı izni gerekir. Yeni deneyim ekranları Görev 5 kapsamındadır.
Sipariş yanıtındaki `branchTimezone` açık IANA saat dilimidir; planlı saat ve
`estimatedReadyAt` bu dilimde biçimlendirilir. Eski checkout tekrarında yalnız
bu sunum alanı tamamlanır; saklanmış mali/durum yanıtı değiştirilmez.
