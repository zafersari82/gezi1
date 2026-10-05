# Kod standartları

Bu depodaki kodun "tek elden çıkmış" görünmesi tesadüf değil; aşağıdaki kuralların sonucudur.
Kuralların çoğu makine tarafından denetlenir: kurala uymayan kod `npm run check` komutundan geçemez.
Makinenin denetleyemediği az sayıdaki kural ayrıca işaretlenmiştir; onlara gözden geçirmede bakılır.

Yeni kod yazarken yöntem basittir: aynı işi yapan mevcut bir dosyayı açın ve onun gibi yazın. Bu
belge, o dosyaların neden öyle yazıldığını anlatır.

## Denetim

| Ne                         | Araç                            | Komut                  |
| -------------------------- | ------------------------------- | ---------------------- |
| Biçim                      | Prettier                        | `npm run format:check` |
| Kod kalitesi               | ESLint (typescript-eslint)      | `npm run lint`         |
| Proje kuralları            | `scripts/check-conventions.mjs` | `npm run conventions`  |
| Tipler                     | TypeScript (`strict`)           | `npm run typecheck`    |
| Davranış                   | Vitest                          | `npm run test`         |
| Hepsi ve derlemeler birden | —                               | `npm run check`        |

İki kural bu tablonun üstündedir:

1. **Kural susturulmaz.** `eslint-disable`, `@ts-ignore`, `@ts-expect-error` ve `@ts-nocheck`
   yazılamaz; proje kuralları denetimi bunları reddeder. Araç şikâyet ediyorsa kod düzeltilir. Kural
   gerçekten yanlışsa `eslint.config.mjs` içinde herkes için değiştirilir, tek dosyada kapatılmaz.
2. **Yarım iş notu bırakılmaz.** Koda `TODO`, `FIXME` gibi notlar yazılmaz. İş ya bitirilir ya da
   [YOL_HARITASI.md](YOL_HARITASI.md) dosyasına yazılır.

Sayfa adreslerinin tipleri (Expo Router ve Next.js'in `typedRoutes` özelliği) kaynak koddan üretilir
ve depoya girmez. `npm run lint` ve `npm run typecheck` önce bu tipleri üretir (`npm run typegen`);
böylece denetimler yeni indirilmiş bir kopyada da aynı sonucu verir.

## Biçim

Biçim tartışılmaz; Prettier ne üretirse odur. Kaydetmeden önce `npm run format` çalıştırmak yeterlidir.

- Satır genişliği 100 karakter, girinti iki boşluk, çift tırnak, sonda virgül.
- Dosyalar UTF-8 ve LF satır sonuyla kaydedilir (`.editorconfig` ve `.gitattributes` bunu sağlar).
- İçe aktarımlar ESLint tarafından sıralanır: önce paketler, sonra `@/` ile başlayanlar, sonra göreli
  yollar. Elle sıralamaya gerek yoktur; `npx eslint --fix .` düzeltir.

## Dil

- **Kod İngilizce:** değişken, işlev, tip, dosya ve tablo adları.
- **İnsana görünen her şey Türkçe:** arayüz metinleri, hata iletileri, kod yorumları, test adları,
  günlük iletileri, belgeler ve commit iletileri.
- Kullanıcıya "sen" diye hitap edilir ("Kodu gir", "Bağlantını kontrol et"). Belgelerde okura "siz"
  denir.
- Düğme ve başlıklarda yalnızca ilk sözcük büyük harfle başlar ("Yeni sohbet", "Kişi ekle").
- Yorum, kodun _ne_ yaptığını değil _neden_ öyle yaptığını anlatır. Dışa açılan ve adı kendini
  anlatmayan her işlevin, tipin ve sabitin üstünde `/** … */` biçiminde bir açıklama bulunur.

## Adlandırma

| Ne                              | Biçim                                   | Örnek                                 |
| ------------------------------- | --------------------------------------- | ------------------------------------- |
| Dosya                           | küçük harf ve tire                      | `message-bubble.tsx`, `use-prompt.ts` |
| Servis ve rota dosyası          | `<alan>.service.ts`, `<alan>.routes.ts` | `chat.service.ts`, `chat.routes.ts`   |
| Test dosyası                    | `test/<konu>.test.ts`                   | `test/contacts.test.ts`               |
| Şema dosyası                    | `NNNN_aciklama.sql`                     | `0001_baseline.sql`                   |
| Platforma özel dosya            | `<ad>.web.tsx`                          | `qr-scanner.web.tsx`                  |
| Değişken ve işlev               | camelCase                               | `sendMessage`, `unreadCount`          |
| Tip, arayüz, React bileşeni     | PascalCase                              | `Conversation`, `MessageBubble`       |
| React kancası                   | `use` ile başlar                        | `useConversations`                    |
| Modül düzeyinde sabit           | BÜYÜK_HARF                              | `MESSAGE_MAX_LENGTH`                  |
| Zod şeması ve tipi              | `xSchema` ve `X`                        | `messageSchema`, `Message`            |
| Servis kurucusu                 | `create<Alan>Service`                   | `createChatService`                   |
| Tablo ve sütun                  | snake_case; tablolar çoğul              | `contact_requests.created_at`         |
| JSON alanı                      | camelCase                               | `lastReadSeq`                         |
| Hata kodu, denetim kaydı eylemi | snake_case, `alan.eylem`                | `otp_invalid`, `payment.created`      |

Dosya adını çatının belirlediği yerler (Expo Router ve Next.js'te `_layout.tsx`, `[id].tsx`,
`page.tsx`) bu kuralın dışındadır. Kısaltma yapılmaz: `msg`, `usr`, `btn` yerine `message`, `user`,
`button` yazılır.

## TypeScript

- `strict` ve `noUncheckedIndexedAccess` açıktır. `any`, `!` (boş olamaz iddiası) ve gereksiz tip
  dönüşümü kullanılmaz; lint bunları reddeder. Bir değerin tipi bilinmiyorsa `unknown` alınır ve
  daraltılır.
- Yalnızca adlı dışa aktarım (`export function …`) kullanılır. Varsayılan dışa aktarım, yalnızca
  çatının zorunlu tuttuğu dosyalarda (ekranlar, sayfalar, yapılandırma dosyaları) bulunur.
- Yalnızca tip olarak kullanılan içe aktarımlar `import type` ile yazılır.
- Nesne biçimleri `interface`, birleşimler `type` ile tanımlanır. `enum` kullanılmaz; sabit listeler
  `as const` dizisi ve ondan türeyen tiptir (`CAPABILITIES`, `Capability`).
- Sınıf yalnızca hata türleri için yazılır (`AppError`, `ApiError`). Geri kalan her şey işlevdir;
  durum taşıması gereken parçalar, bağımlılıklarını parametre alan kurucu işlevlerdir
  (`createChatService(context)`).
- "Değer yok" durumu veride ve API'de `null` ile gösterilir; `undefined` yalnızca "bu alan
  gönderilmedi" anlamına gelir.
- Karşılaştırmada her zaman `===` kullanılır. Boşluk denetimi açık yazılır
  (`if (user === null)`); değerin doğruluğuna güvenilmez.
- `console` yalnızca komut satırı betiklerinde ve `main.ts` içinde kullanılır; geri kalan yerde
  sunucunun günlük nesnesi (`log`) kullanılır.
- Sihirli sayı yazılmaz: sınırlar ve süreler adlı sabitlerdir (`OTP_MAX_ATTEMPTS`,
  `PAYMENT_TTL_MINUTES`). İstemcinin de bilmesi gereken sınırlar sözleşme paketinde durur.

## Sözleşmeler (`packages/contracts`)

- API'ye giren ve API'den çıkan her biçim burada, Zod şeması olarak tanımlanır. Tip elle yazılmaz;
  şemadan türetilir (`type Message = z.infer<typeof messageSchema>`).
- Yeni bir hata iki satırla eklenir: `ERROR_MESSAGES` tablosuna kod ve Türkçe ileti, API'deki
  `STATUS_CODES` tablosuna HTTP durumu. İkincisini unutursanız derleyici hatırlatır.
- İsteğe bağlı alanlar için şemada varsayılan değer (`.default()`) kullanılmaz; varsayılanı rota
  ya da servis verir (`body.message ?? ""`). Böylece her isteğin tek bir tipi olur. İki istisna
  vardır: sayfa boyutu (`limit`) ve bir istek değil dosya biçimi olan paket bildirim dosyası
  (`vado.app.json`); orada varsayılanlar biçimin parçasıdır.
- Paket yalnızca `zod`'a bağımlıdır ve tarayıcıda, telefonda ve sunucuda aynı şekilde çalışır;
  içine Node.js'e veya React'e özgü kod konmaz.

## API (`apps/api`)

- **Rota** yalnızca dört iş yapar ve hep bu sırayla: oturumu doğrular (`guard`), girdiyi şemayla
  çözer (`parse`), servisi çağırır, sonucu döndürür. Rotada iş kuralı ve SQL bulunmaz.
- **Servis** iş kurallarını taşır ve HTTP'yi bilmez: istek ve yanıt nesnelerine dokunmaz, durum kodu
  seçmez. Kural bozulduğunda `throw new AppError("hata_kodu")` yazar.
- **SQL** her zaman `sql` etiketiyle yazılır; değerler araya `${…}` ile konur ve bağlı parametreye
  dönüşür. Metin birleştirerek sorgu kurulmaz. Sorgunun döndürdüğü satırın tipi (`…Row`) sorgunun
  yanında tanımlanır ve sütun adlarıyla aynı kalır (snake_case); API biçimine çeviri `to…`
  işlevlerinde yapılır.
- Birden çok yazma birlikte geçerli olmalıysa `db.transaction` içinde yapılır. Gerçek zamanlı
  bildirim (`realtime.emit`) işlem tamamlandıktan sonra gönderilir.
- Aynı isteğin iki kez gelmesi veriyi bozmamalıdır. Mesajda `clientId`, ödemede `orderId`, kişi
  isteklerinde benzersizlik kısıtları bunun içindir; yeni yazma uç noktaları da aynı soruyu
  yanıtlamalıdır.
- Panelden yapılan her değişiklik ve para ya da hesapla ilgili her kullanıcı işlemi `recordAudit`
  ile denetim kaydına yazılır.
- "Bu mini uygulama kullanıcılara açık mı" sorusunun tek yanıtı `miniAppLive` koşuludur. Uygulama
  kaydını kullanıcı adına okuyan her sorgu (liste, kimlik, ödeme, QR, dosya sunumu)
  `mini_app_runtime` görünümünü bu koşulla okur; koşul kopyalanmaz. Acil kapatma buna dayanır.
- Tarayıcıya metin olarak gönderilen betik (sarmalayıcı belgenin betiği, `wrapper-document.ts`)
  derleyiciden ve lint'ten geçmez. Bu yüzden kısa ve yalın yazılır, uygulamaya özel değer
  içermez (değerler belgenin kendisindedir), güvenlik politikasında içerik özetiyle tanımlanır ve
  birim testinde aynı metin çalıştırılarak sınanır. İşlevi metne çevirmek (`toString`) kullanılmaz:
  geliştirme, test ve canlı derlemeler aynı işlevden farklı metin üretir.
- Yeni bir ortam değişkeni dört yere birlikte yazılır: `core/config.ts` (doğrulamasıyla),
  `apps/api/.env.example`, canlı ortamda anlamlıysa `infra/docker-compose.prod.yml` ile
  `infra/.env.production.example`, ve [YAYIN.md](YAYIN.md).
- Yetki, verinin kendisinden doğrulanır: "bu kullanıcı bu sohbetin üyesi mi" sorusu her istekte
  veritabanına sorulur; istemcinin gönderdiği bilgiye güvenilmez.

## Veritabanı

- Şema dosyaları `apps/api/migrations` içindedir ve 0001'den başlayarak boşluksuz numaralanır.
- Yayınlanmış bir şema dosyası bir daha düzenlenmez; değişiklik sıradaki numarayla yeni dosya olarak
  eklenir. (2.0 yayınlanana kadar tek dosya, `0001_baseline.sql`, doğrudan düzenlendi.)
- Kayıtların kimliği UUID'dir (`id`); iki kaydı birbirine bağlayan tablolarda (`contacts`,
  `conversation_members`) anahtar, bağlanan iki sütundur. Zaman sütunları `timestamptz` tipindedir.
- Kısıtlara ad verilir (`users_status_check`, `payments_order_key`); servisler çakışmayı bu adla
  tanır.
- Başka tabloyu gösteren her sütunun silme davranışı açıkça yazılır (`on delete cascade`,
  `set null` veya `restrict`) ve sorgularda kullanılıyorsa dizini eklenir.
- Kural veritabanında da durur: benzersizlik, izinli değerler ve biçimler `check` ve `unique`
  kısıtlarıyla korunur; yalnızca uygulama koduna bırakılmaz.
- Değişmemesi gereken kayıtlar (paket sürümleri, dosya listeleri, yayın geçmişi) tetikleyiciyle
  korunur ve bu koruma, kuralı doğrudan SQL ile zorlayan bir testle birlikte yazılır. Böyle bir
  tabloya `update` ya da `delete` gerektiren bir özellik, tetikleyiciyi gevşetmek yerine yeni bir
  satır ekleyecek biçimde tasarlanır.

## Mobil uygulama (`apps/mobile`)

- Katmanlar tek yönlü bağlıdır: `app` (ekranlar) → `features` (alan mantığı) → `ui`, `lib`, `api`,
  `theme`. `ui` içindeki bileşen hiçbir alanı tanımaz; sohbetten, ödemeden habersizdir.
- Ekranlar sunucuyla doğrudan konuşmaz. Her alanın `features/<alan>/queries.ts` dosyasında
  `use…` kancaları vardır; `fetch` ve `api.get` yalnızca orada geçer.
- Renk, boşluk, köşe yarıçapı ve yazı boyutu yalnızca `theme/tokens.ts` içinden alınır. Ekranda
  doğrudan renk kodu yazılamaz; proje kuralları denetimi reddeder.
- React Compiler açıktır. `useMemo`, `useCallback` ve `memo` yazılmaz; denetim reddeder.
- Stiller dosyanın sonunda `StyleSheet.create` ile tanımlanır; satır içi stil yalnızca hesaplanan
  değerler için kullanılır.
- Platform farkı `if (Platform.OS === …)` ile ekranlara yayılmaz; aynı adlı `.web.tsx` dosyasıyla
  ayrılır. Ortak tipler `<ad>.types.ts` dosyasında durur.
- Dokunulan öğelerin erişilebilirlik etiketi (`accessibilityLabel`) vardır; yalnızca simgeden oluşan
  düğmelerde bu zorunludur. Uçtan uca senaryoların kullandığı öğeler ayrıca `testID` taşır.
- Dokunulabilir öğeler iç içe konmaz: tıklanabilir bir satırın ya da kartın içine düğme
  yerleştirilmez. Web'de geçersiz HTML üretir, telefonda ekran okuyucu içteki düğmeye ulaşamaz.
  Düğme taşıyan satır tıklanmaz; ayrıntıya götüren öğe (profil resmi gibi) ayrıca dokunulabilir olur.
- Telefonda ve web'de aynı çalışan özellikler yazılır: dokunmayı geçirme ve dikey hizalama stilde
  durur (`pointerEvents`, `verticalAlign`), ekran okuyucudan gizleme `aria-hidden` ile yapılır.
  Web önizlemesinde uyarı veren eski karşılıklarını (`pointerEvents` özelliği, `textAlignVertical`,
  `accessibilityElementsHidden`, `importantForAccessibility`) denetim reddeder.
- Yükleniyor, boş ve hata durumları her liste ekranında `ui/states.tsx` bileşenleriyle gösterilir;
  ekranlar kendi boş durum tasarımını yapmaz.

## Yönetim paneli (`apps/portal`)

- Sayfalar sunucu bileşenidir ve veriyi `lib/api.ts` üzerinden okur. Tarayıcıda çalışan bileşen
  (`"use client"`) yalnızca etkileşim gerektiğinde yazılır.
- Değişiklikler `lib/actions.ts` içindeki sunucu işlevleriyle yapılır. API'ye giden her çağrı
  `lib/api.ts` üzerinden geçer ve oturum çerezindeki belirteci taşır; yetkiye panel değil API karar
  verir. Yönetici anahtarı ve oturum belirteci tarayıcıya gönderilen hiçbir dosyada geçmez
  (`server-only`, `HttpOnly` çerez).
- Panelde menüyü ya da düğmeyi gizlemek yetki değildir; yalnızca rolün yapamayacağı işlemi
  göstermemek içindir. Her yönetim ucu gerektirdiği izni rota ayarında bildirir
  (`adminAccess(…)`); bildirmeyen uç kaydedilemez.
- API yanıtları sözleşme şemasıyla doğrulanır; panel "herhalde böyle gelir" varsayımıyla veri okumaz.
- Renkler `app/globals.css` içindeki CSS değişkenlerinden gelir; bileşenlerde renk kodu yazılamaz.

## Testler

- API testleri gerçek PostgreSQL üzerinde, HTTP katmanından geçerek çalışır; veritabanı taklit
  edilmez. Her test dosyası kendi uygulama örneğini kurar ve birbirinden bağımsızdır.
- Test adı Türkçe bir cümledir ve davranışı anlatır: "aynı kişiye yinelenen istek tek kayıt olarak
  kalır". İşlev adı ya da "çalışıyor mu" gibi adlar yazılmaz.
- Yeni bir uç nokta için başarılı yolun yanında, kuralın koruduğu durumlar da sınanır: yetkisi
  olmayan kullanıcı, geçersiz girdi ve isteğin yinelenmesi.
- Hata düzeltirken önce hatayı yakalayan test yazılır, sonra kod düzeltilir.
- Mobilde telefona bağlı olmayan mantık (köprü, biçimlendirme, sohbet listesi) birim testiyle
  sınanır; bu yüzden o mantık ekran dosyalarında değil `features` ve `lib` altında durur.

## Bağımlılıklar ve sürüm

- Yeni bir npm paketi eklemeden önce aynı işin mevcut paketlerle ya da on beş satır kodla yapılıp
  yapılamayacağına bakılır. Eklenen her paket [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
  dosyasına yazılır.
- Expo'nun sürümünü belirlediği paketler (`expo-*`, `react-native-*`) elle yükseltilmez;
  `npx expo install --fix` kullanılır.
- Tüm paketler kök `package.json` ile aynı sürümü taşır; denetim bunu doğrular. Sürüm
  yükseltilirken [CHANGELOG.md](../CHANGELOG.md) güncellenir.
- Çalışma alanı paketleri birbirine yalnızca adlarıyla (`@vado/contracts`) bağlanır; göreli yolla
  başka paketin içine girilemez.

## Yeni özellik eklerken sıra

1. Sözleşme: şemalar, tipler ve gerekiyorsa hata kodları (`packages/contracts`).
2. Şema değişikliği: yeni numaralı SQL dosyası (`apps/api/migrations`).
3. Servis ve rota (`apps/api/src/modules/<alan>`); servis `services.ts`, rota `routes.ts` içine
   kaydedilir.
4. API testleri.
5. Mobil sorgu kancaları (`features/<alan>/queries.ts`), sonra ekran.
6. Gerekiyorsa panel sayfası ve sunucu işlevi.
7. Belgeler: [API.md](API.md), kullanıcıya görünen değişiklik varsa `CHANGELOG.md`. Belgedeki
   komut ve örnekler çalıştırılarak yazılır; denenmeyen adım "denenmedi" diye işaretlenir.
8. `npm run check`.

## Makinenin denetleyemedikleri

Gözden geçirmede şunlara bakılır:

- Ad, yaptığı işi anlatıyor mu? Yorum "neden"i söylüyor mu?
- İş kuralı serviste mi, yoksa rotaya ya da ekrana mı sızmış?
- Aynı şeyi yapan ikinci bir yardımcı işlev mi yazılmış? Varsa mevcut olan kullanılır.
- Kullanıcıya görünen metin Türkçe, kısa ve suçlamayan bir dille mi yazılmış?
- İstek yinelenirse veya yarıda kesilirse veri tutarlı kalıyor mu?
- Mini uygulamanın yalıtımına dokunan bir değişiklik (güvenlik başlıkları, sarmalayıcı belge,
  kabuğun kilidi) gerçek bir tarayıcıda, kaçış yolları tek tek denenerek ölçüldü mü? Başlığın
  yanıtta bulunması, tarayıcının onu beklenen biçimde uyguladığını göstermez; ölçümün sızıntıyı
  görebildiği de koruma kaldırılarak doğrulanmalıdır.
- Yeni ekran geliştirme kipinde (`npm run web`) açıldığında tarayıcı konsolu temiz mi? React'in
  uyarıları (iç içe düğme, tanınmayan özellik) yalnızca bu kipte görünür.
