# 2.6 teknik planı ve devir notu

Bu belge 2.6'yı yazacak kişi ya da yapay zekâ ajanı içindir. Plan onaylandı; kod henüz yazılmadı.
Önce [PLATFORM_MIMARISI.md](PLATFORM_MIMARISI.md) belgesini okuyun; buradaki her karar ona uyar.

## Devir: depo nerede, kurallar neler

- Son teslim edilen sürüm **2.5.0**. Bütün testler (651), 110 maddelik bozma denemesi, tarayıcı
  senaryoları, 2.4→2.5 geçişi, Docker ve Compose denemeleri geçti (README, "Neyi denedik").
- Doğrulama betikleri depoda değildir; `VADO_2.5.0_dogrulama_araclari.zip` içindedir (`OKU.md`).
- **Bağlayıcı çalışma kuralları** (önceki sürümlerin devir talimatından):
  - Kullanıcıyla Türkçe, kısa ve sade konuşulur: ne yapıldı, ne çalışırken görüldü (sayıyla), ne
    denenmedi, sırada ne var.
  - Sıfırdan yazılmaz; küçük doğrulanmış adımlar. **Her adımda `npm run check` geçer.** Her büyük
    parçanın sonunda ara zip (`git archive --format=zip --prefix=VADO_<sürüm>/ …`).
  - Kural susturulmaz: `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `TODO`,
    `FIXME` yasak.
  - Dil: kod İngilizce; arayüz, hata iletisi, yorum, test adı, günlük, belge, commit iletisi
    Türkçe. Arayüzde kullanıcıya "sen", belgelerde okura "siz".
  - Çalışmadığını görmediğin şeye "hazır" deme; çalıştırılmayan her şey "denenmedi" diye yazılır.
  - Yığın ve klasör düzeni değişmez (2.6'da yalnızca onaylı `apps/business` eklenir). Yeni npm
    paketi gerçekten gerekiyorsa `THIRD_PARTY_NOTICES.md`'ye yazılır; Expo'nun sabitlediği paketler
    `npx expo install` ile eklenir.
  - Yayımlanmış şema dosyası düzenlenmez; değişiklik sıradaki numaralı dosyaya yazılır. Kurallar
    veritabanında da (kısıt, tetikleyici, RLS) bulunur ve doğrudan SQL ile sınanır.
  - Belgeler kodla birlikte değişir: CHANGELOG (geçiş adımlarıyla), SECURITY, docs/API, docs/YAYIN,
    docs/MIMARI, docs/YOL_HARITASI, README ("Neyi denedik, neyi denemedik").
  - Sürüm numarası her yerde birlikte değişir: yedi `package.json`, `package-lock.json`,
    `apps/mobile/app.json`, `apps/api/src/app.ts` içindeki `API_VERSION`,
    `apps/mobile/src/api/config.ts` içindeki yedek değer.
  - Depoya ve zip'e gerçek anahtar, parola ya da `.env` girmez; yalnızca `.env.example`.
- Geliştirme ortamı: PostgreSQL 16, Redis, Node 22. `npm ci`, `npm run db:seed`, `npm run dev`
  (bkz. [KURULUM.md](KURULUM.md)).

## Amaç

Müşteriye yeni ekran yok. Restoranın (2.7–2.8) ve sonraki bütün motorların oturacağı, yalıtımı ve
güvenilirliği kanıtlanmış temel: platform temeli, Sipariş motoru çekirdeği, yetenek paketi
altyapısı, VADO Business temeli.

Çalışma sırası: veri modeli → yalıtım → API sözleşmeleri → olay modeli → motor → paket altyapısı →
VADO Business. Altı ara zip: veri ve yalıtım, katalog, olaylar, sepet ve sipariş, paketler, VADO
Business.

## Onaylanan kararlar

1. VADO Business'a işletme sahibi ve çalışanlar **kendi VADO kullanıcı hesaplarıyla** girer;
   hesap bir işletme üyeliğine (rol: sahip, yönetici, personel) bağlanır. Ortak cihaz (mutfak
   tableti) eşleştirme kodu 2.7'dedir. 2.5'teki panel "İşletme" rolü geçiş dönemi kalır.
2. Veritabanında satır düzeyinde güvenlik (RLS) **zorunlu**.
3. `businessCustomerId` saklanan rastgele kimliktir (KVKK silmede bağ silinir).
4. Müşteri tarafı motora **kabuk üzerinden** ulaşır; paket API'yi doğrudan çağırmaz, işletme ve
   uygulama örneği bağlamını kabuk ekler.
5. 2.6 altı ara zip'le ilerler.

## Mühendislik düzeltmeleri (koda geçmeden önce kesinleşti)

### 1. RLS nasıl uygulanır

- **İki veritabanı rolü.** Şemayı kuran rol (`vado_owner`, tabloların sahibi; `migrate` bununla
  çalışır) ve uygulamanın bağlandığı rol (`vado_app`). Tablo sahibi RLS'e takılmaz; bu yüzden API
  asla sahip rolle bağlanmaz. İşletme tablolarında `ENABLE` ve **`FORCE ROW LEVEL SECURITY`**.
  Compose ve `.env.example` iki bağlantı adresi taşır (`DATABASE_URL`, `DATABASE_MIGRATE_URL`);
  YAYIN.md'ye geçiş adımı yazılır.
- **Kapsam işlem başına.** Erişim katmanı her işlemin başında
  `select set_config('vado.business_id', $1, true)` çalıştırır (`true` = yalnızca bu işlem).
  Havuzdaki bağlantı başka isteğe geçtiğinde kapsam taşınmaz. Kapsam yalnızca işlem içinde
  kurulabilir; işlem dışı sorgu işletme tablosuna erişemez.
- **Ayar yoksa satır yok.** Politika: `business_id = nullif(current_setting('vado.business_id',
true), '')::uuid`. Ayar kurulmamışsa koşul `null` olur, hiçbir satır görünmez ve yazılamaz
  (`WITH CHECK` aynı koşul). Hata sessizce "her şeyi göster"e dönüşmez.
- **Platform işleri ayrı rolle.** VADO ekibinin paneli ve bakım işleri `BYPASSRLS` yetkili ayrı bir
  rol (`vado_platform`) ve ayrı, adı açık bir kod yolu (`platformScope`) kullanır; motor
  modüllerinde bu yol lint ile yasaktır.
- **Testler `vado_app` rolüyle çalışır** (sahip rolle değil); yoksa RLS hiç sınanmamış olur. Her
  tabloya: kapsamsız okuma (0 satır), başka işletmenin satırını okuma, güncelleme, silme, başka
  işletmenin kaydına bağ kurma denemesi. Bozma denemesine politikayı kaldıran ve `FORCE`'u silen
  maddeler eklenir.
- RLS ikinci kattır: servis katmanında `TenantScope` zorunlu parametresi ve bileşik yabancı
  anahtarlar yine vardır.

### 2. Outbox "tam bir kez" değil, "en az bir kez" teslim eder

- Olay, iş kaydıyla aynı işlemde `outbox_events` tablosuna yazılır. Dağıtıcı olayı **en az bir kez**
  teslim eder; aynı olayın iki kez teslimi olağan bir durumdur, hata değildir.
- **Tüketiciler etkisizdir (idempotent).** İç tüketici, kendi işini ve `event_deliveries
(consumer, event_id)` kaydını **aynı işlemde** yazar; kayıt varsa olayı atlar. Böylece iç etki
  tam bir kez olur.
- **Dış etki (anlık bildirim, webhook) tam bir kez garanti edilemez.** Gönderim başarılı olup kayıt
  yazılmadan süreç çökerse aynı bildirim ikinci kez gidebilir. Bu kabul edilir ve belgelenir;
  zarar küçültülür: bildirim olay kimliğini taşır, mobil uygulama aynı kimlikli bildirimi tekrar
  göstermez; webhook alıcısına olay kimliği gönderilir.
- **Kilit dış çağrı boyunca tutulmaz.** Dağıtıcı olayları `FOR UPDATE SKIP LOCKED` ile kısa bir
  işlemde **kiralar** (`locked_until`, `attempts`), işlemi kapatır, sonra teslim eder. Kira süresi
  dolan olay başka süreçte yeniden denenir. Artan bekleme sonrası sınır aşılırsa olay "ölü"
  işaretlenir ve panelde görünür.
- **Sıra:** aynı siparişin olayları sırayla teslim edilir (sipariş başına sıra numarası; önceki olay
  bitmeden sonraki kiralanmaz). Farklı siparişler arasında sıra garantisi yoktur.
- Testler: süreç teslimden önce ve teslimden sonra öldürülür; iç etkinin bir kez, dış etkinin en
  az bir kez gerçekleştiği görülür.

### 3. Yetenek paketleri sunucuya keyfi kod sokamaz

- **Paket = VADO deposundaki kod + bildirimsel manifest.** Paketler VADO ekibinin yazdığı,
  incelediği ve sürümle birlikte yayımladığı modüllerdir. Çalışma anında dışarıdan kod yüklenmez,
  `eval` ya da dinamik `import` yoktur; manifest yalnızca veridir (şema, durum, olay adı, izin).
- Manifestteki **durum makinesi eklemeleri veridir** ve doğrulanır: yalnızca çekirdeğin izin
  verdiği "ara adım" noktalarına eklenebilir, çekirdeğin bitiş durumlarını değiştiremez, döngü ve
  erişilemeyen durum reddedilir. Geçiş kuralları yalnızca kodda kayıtlı, adı olan kural
  işlevlerine başvurur.
- İşletme ayarları (`configSchema`) yalnızca veridir; ayarla kod çalıştırılamaz.
- **Üçüncü taraf genişletme** iki yolla olur ve ikisi de sunucunun dışındadır: müşteri tarafında
  bugünkü yalıtılmış mini uygulama paketi; sunucu tarafında imzalı webhook (olay kimliği, zaman
  damgası, HMAC) ve kimlik belirteci (2.5). İşletmenin ya da geliştiricinin kodu VADO sunucusunda
  çalışmaz.

### 4. Sepet sunucudadır

- Profesyonel siparişte sepet istemcide tutulmaz. `carts` tablosu: `business_id`, `branch_id`,
  `app_instance_id`, `business_customer_id`, teslim biçimi, `version`, `expires_at`. Bir müşterinin
  bir uygulama örneği ve şubede tek açık sepeti vardır (kısmi benzersizlik).
- Satırlar ürün kimliği, seçenekler ve adet taşır; **fiyat sepette bilgi amaçlıdır.** Sepet
  okunduğunda güncel katalogla yeniden hesaplanır; bulunmayan ürün ya da değişen fiyat satırda
  işaretlenir.
- Sepet değişiklikleri `expectedVersion` ile yapılır (iki cihazdan aynı anda düzenleme).
- **Siparişe dönüşüm** tek işlemdir: `Idempotency-Key` + `cartVersion` ile. Sunucu fiyatı ve
  bulunurluğu yeniden hesaplar; müşterinin gördüğü toplamla fark varsa sipariş oluşmaz,
  `409 cart_changed` ve yeni sepet döner (kullanıcı onaylar, tekrar gönderir). Başarıda sepet
  kapanır, fiyat görüntüsü siparişe yazılır, `order.placed` outbox'a girer.
- Terk edilen sepetler süresi dolunca temizlenir.

## Veri modeli (şema dosyaları)

| Dosya         | Tablolar                                                                                                                                    | Veritabanındaki kural                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 0008 platform | Roller ve RLS altyapısı; `business_members`, `branches`, `branch_hours`, `business_customers`, `app_instances` (bugünkü kayda işletme bağı) | Kayıt yalnızca kendi işletmesine; `businessCustomerId` rastgele ve benzersiz                          |
| 0009 katalog  | `catalog_categories`, `catalog_items`, `option_groups`, `options`, `item_option_groups`, `prices` (kuruş, KDV oranı)                        | Bağlar aynı işletmede (bileşik anahtar); tutarlar tam sayı                                            |
| 0010 olaylar  | `outbox_events` (kira alanları, sipariş başına sıra), `event_deliveries`, `idempotency_keys`                                                | Olay değişmez; teslim kaydı (tüketici, olay) tekil                                                    |
| 0011 sipariş  | `carts`, `cart_lines`, `orders` (`status`, `version`, toplamlar), `order_lines`, `order_line_options`, `order_status_history`               | Fiyat görüntüsü değişmez; bitmiş sipariş değişmez; sürüm her güncellemede +1; geçmiş yalnızca eklenir |
| 0012 paketler | `app_instance_capabilities` (paket, sürüm, açık/kapalı, ayar)                                                                               | Kayıt işletmeye bağlı                                                                                 |

Bütün işletme tablolarında `business_id` zorunlu, RLS açık ve zorlanmış.

## API ve sipariş çekirdeği

- Çekirdek durumlar: `placed`, `accepted`, `rejected`, `completed`, `cancelled`; ara adımlar
  paketlerden.
- Durum geçişi `expectedVersion` ile; çakışmada `409 order_version_conflict`.
- `Idempotency-Key`: aynı anahtar + aynı gövde → ilk yanıt; farklı gövde → `409`; 24 saat
  saklanır.
- Fiyat yalnızca sunucuda; satır başına KDV; seçenek fiyatları dahil.
- 2.5'in anlık bildirimleri outbox yoluna taşınır (bugün süreç içinde arka planda gidiyor).

## Yetenek paketi altyapısı

- Manifest kodda tiplidir, Zod şemasından JSON Schema üretilir: `id`, `version`, `engine`,
  `dependsOn`, `configSchema`, `defaults`, `permissions`, `events`, `stateMachine` eklemeleri, `api`
  yetenekleri, `customerBlocks`, `businessBlocks`, `validation`.
- `GET /v1/capabilities` bütün motor ve paket sözleşmelerini döndürür (Studio okuyacak).
- Açma/kapama: bağımlılık, sürüm ve ayar doğrulaması; durum makinesi birleştirilir.
- Deneme paketi: `ordering.preparation` ("hazırlanıyor / hazır"). Gerçek mutfak paketi 2.7'de.

## VADO Business temeli (`apps/business`)

- Next.js (panelle aynı yığın), PWA, duyarlı: telefon (alt menü), **tablet (birinci sınıf)**,
  masaüstü. Menü işletmenin açık paketlerinden kurulur; sektörü bilen kod yok.
- Modüller: Siparişler (liste, ayrıntı, durum, canlı güncelleme), Ürünler (katalog ve seçenek
  grupları), Şubeler (çalışma saatleri), Ayarlar (paketler).
- Gerçek zamanlı akış: kısa ömürlü biletle soket; olaylar outbox'tan.
- Tablet sınırları baştan hesaba katılır: tarayıcı sesi ilk dokunuştan önce çalmaz, ekran uyur
  (Wake Lock), iOS'ta web bildirimi yalnızca ana ekrana eklenmiş uygulamada çalışır. Ses ve ekran
  işi 2.7'de tamamlanır.

## Kabul ölçütleri

- `npm run check` her adımda geçer.
- RLS testleri `vado_app` rolüyle her işletme tablosunu doğrudan SQL ile zorlar.
- 50 eş zamanlı aynı anahtarlı sipariş isteği → tek sipariş.
- Sepet: fiyat değişince `409 cart_changed`; iki cihazdan eş zamanlı düzenlemede biri `409`.
- Süreç teslimden önce/sonra öldürülür → iç etki bir kez, dış etki en az bir kez.
- Eş zamanlı durum değişikliği: biri kazanır, öteki `409`.
- Bozma denemesi: yeni kuralların hepsi (110'un üstüne).
- 2.5→2.6 geçişi (iki veritabanı rolünün kurulması dahil) ve geri dönüş denenir.
- VADO Business tarayıcıda üç ekran boyutunda: giriş, sipariş listesi, canlı güncelleme, ürün
  düzenleme.
- Belgeler güncellenir.

## 2.6'da olmayanlar

Müşteriye görünen sipariş ekranı, masa QR'ı, mutfak ekranı ve sesli uyarı (2.7); teslimat, kurye,
teşvik servisleri (2.8); ödeme (3.x).
