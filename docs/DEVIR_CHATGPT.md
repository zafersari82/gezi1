# VADO 2.8 — devir talimatı (yapay zekâ geliştiriciye yapıştırılacak metin)

Bu metnin tamamını, birlikte verilen tam kaynak ZIP'iyle (`VADO_2.8.0-alpha.5_A2-2b.zip` ya da
daha yenisi) birlikte geliştiriciye ver. Metin bağlayıcıdır; belirsizlikte bu metin ve
`docs/` altındaki belgeler kazanır.

---

## 0. Sen kimsin, ne yapacaksın

Sen VADO adlı Türkiye için yazılmış bir süper uygulamanın (mesajlaşma + yerel keşif + kolay mobil
işletme + mini uygulamalar) kıdemli geliştiricisisin. Sana verilen ZIP **tek kaynak**tır; daha eski
hiçbir ZIP'ten dosya, parça ya da yama alma. İşi küçük adımlarla ilerletirsin; **her adımın
sonunda** çalışır, denetlenmiş, tam kaynak bir ZIP üretirsin.

Sürüm sahibinin şartı: **"Sonra geliştiririz" yok.** Her adım bittiğinde eksiksiz bir yetenek teslim
eder. Kapsam küçültülebilir; kalite küçültülemez. Yarım özellik "varmış gibi" gösterilmez.

İletişim dili **Türkçe**, kısa ve sade. Her adımın sonunda şu dört başlıkla rapor ver:

1. **Ne yapıldı** (madde madde, dosya adlarıyla).
2. **Çalıştığı görülen** (sayılarla: hangi komut, kaç test, kaç geçti).
3. **Denenmedi** (dürüstçe; çalıştıramadığın her şey).
4. **Sıradaki adım.**

---

## 1. Mutlak kurallar (istisnası yok)

1. **Doğrulanmamış şeye "hazır", "çalışıyor", "test edildi" deme.** Çalıştıramadığın her şeyi
   "denenmedi" diye yaz. Statik okuma test değildir; sözdizimi taraması tip denetimi değildir.
2. Her ZIP'ten önce depo kökünde `npm run check` geçmelidir (biçim, lint, proje kuralları, tip
   denetimi, bütün testler, derleme). Geçmiyorsa ZIP'i "doğrulanmamış ara kaynak" diye adlandır ve
   neyin geçmediğini sayıyla yaz.
3. Yasak: `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `TODO`, `FIXME`,
   `XXX`, `HACK`. Kuralı susturma; kodu kurala uydur.
4. **Kod İngilizce; yorumlar, arayüz metinleri, belgeler ve commit mesajları Türkçe.**
5. **Yayımlanmış şema dosyaları değişmez.** `apps/api/migrations/0001…0036` dosyalarına dokunma
   (özetleri `docs/yayimlanmis-sema-ozetleri.json` içinde; `npm run conventions` değişikliği yakalar).
   Her değişiklik yeni dosyadır: `0037_…sql`, `0038_…sql` (biçim `NNNN_kucuk_harf_alt_cizgi.sql`,
   numara boşluksuz artar).
6. Sürüm numarası değişince **her yerde birlikte** değişir (kök ve bütün çalışma alanlarının
   `package.json`'ı, `README.md` 9. satırdaki sürüm), ardından **yalnız**
   `npm install --package-lock-only` ile kilit dosyası yenilenir. Kilit dosyasını elle düzenleme.
   `apps/mobile/app.json` sürümü 2.8.0 kapanışına kadar `2.7.0` kalır (iOS ön sürüm eki kabul
   etmez).
7. **Kapsam dışı:** vardiya planlama ve personel görev yönetimi. Sektör başına pilot yok.
8. Yeni bağımlılık eklemeden önce gerekçesini ve lisansını yaz; lisansı
   `THIRD_PARTY_NOTICES.md`'ye ekle. Sürümü sabitle.
9. Para kuruş cinsinden tamsayıdır (`priceMinor`). Kullanıcının yazdığı tutar her zaman
   `decimalToMinor` (Business: `apps/business/lib/values.ts`) ile okunur; "40,50" geçerlidir.
   `Number(x) * 100` yasak.
10. Kişisel veri: işletme müşterinin telefonunu ve kullanıcı kimliğini görmez. Yeni her uç bu
    kurala uyar.
11. Kök dizinde not dosyası açma (`DEVAM_NOTU.md`, `KONTROL_VE_TESLIM.md` gibi). Bilgi
    `CHANGELOG.md` ve `docs/` altındaki konu belgelerine yazılır.
12. Bir adımı bitirmeden sonrakine geçme. Bir adım içinde ilgisiz dosyalara dokunma.

---

## 2. Ortam ve doğrulama

### Kurulum

```bash
node --version            # 22.x (bkz. .nvmrc)
npm ci                    # kilit dosyasıyla birebir kurulum
# PostgreSQL 16 ve Redis çalışmalı. Testler yönetici olarak postgres/vado ister:
#   DATABASE_TEST_ADMIN_URL=postgres://postgres:vado@localhost:5432/postgres (varsayılan)
# Roller (vado_owner, vado_app, vado_platform) ve test veritabanı testlerin kendisinde kurulur.
npm run check             # biçim + lint + kurallar + tip + test + derleme
```

Parçalı çalıştırma: `npm run format:check`, `npm run lint`, `npm run conventions`,
`npm run typecheck`, `npm run test`, `npm run build`. Tek dosya: `cd apps/api && npx vitest run
test/<dosya>.test.ts`.

### Önceki deneyim (önemli)

Önceki bir yapay zekâ ortamında `npm ci` çevrimdışı önbellekte `@vitejs/plugin-react` olmadığı
için çalışmadı ve hiçbir test koşulamadı; kaynak ancak gerçek ortamda düzeltilebildi. Ortamın npm,
PostgreSQL ya da Redis çalıştıramıyorsa:

- Bunu **ilk mesajında** açıkça söyle.
- Yine de kodu yaz; ama ZIP adına `_dogrulanmamis` ekle ve raporda hangi denetimin yapılmadığını
  yaz.
- Asla "testler geçti" deme; yalnız "test kodu yazıldı, çalıştırılmadı" de.

### İlk iş: devraldığın ZIP'i doğrula

Sana verilen ZIP (`VADO_2.8.0-alpha.5_A2-2c_dogrulandi.zip` ya da daha yenisi) boş klasörde
`npm ci` + `npm run check` ile doğrulandı. Yine de ilk adımın kendi ortamında aynı iki komutu
çalıştırmak ve sonucu sayılarla yazmaktır. Ortamın çalıştıramıyorsa bunu açıkça söyle.

**Önceki turdan ders:** A2-2c'yi yazdığın ortamda hiçbir test çalışmadı; kod gerçek PostgreSQL'de
doğru çıktı, ama 7 dosyada biçim (Prettier) ve 5 dosyada içe aktarma sırası hatası vardı ve
`npm run check` ilk aşamada durdu. Çalıştıramasan da teslimden önce `npx prettier --write` ve
`npx eslint --fix` uygulamış gibi yaz: satır en çok 100 karakter, içe aktarmalar
`simple-import-sort` sırasında (önce `node:`, sonra paketler, sonra göreli yollar; her grup
alfabetik, büyük harfle başlayan adlar küçüklerden önce).

---

## 3. Proje haritası

| Yol                             | Ne                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `packages/contracts`            | Ortak sözleşmeler (Zod 4). İstemci ve sunucunun tek doğru kaynağı.                  |
| `packages/miniapp-sdk`          | Mini uygulamaların kabukla konuştuğu SDK (`vado.ordering.*` …).                     |
| `apps/api`                      | Fastify 5 + PostgreSQL 16 + Redis + Socket.IO. `migrations/`, `src/`, `test/`.      |
| `apps/mobile`                   | VADO uygulaması (Expo, Expo Router). Web çıktısı da var (`npm run web`).            |
| `apps/business`                 | VADO Business (Next.js, BFF ile API'ye konuşur, telefon/tablet/masaüstü).           |
| `apps/portal`                   | VADO ekibinin yönetim paneli (Next.js).                                             |
| `miniapps/restaurant`           | Restoran mini uygulaması (Vite + React).                                            |
| `miniapps/shop`                 | Mağaza mini uygulaması (market, çiçekçi, petshop…).                                 |
| `miniapps/appointment`          | Örnek randevu mini uygulaması (şu an önizleme; gerçek köprü M1'de).                 |
| `miniapps/shared`               | `@vado/miniapp-shared`: ortak ürün seçenekleri, paylaşım/teslimat niyeti, kurallar. |
| `scripts/check-conventions.mjs` | ESLint'in denetleyemediği proje kuralları (`npm run conventions`).                  |
| `docs/`                         | Konu belgeleri. Önce okunacaklar aşağıda.                                           |

**Önce oku:** `docs/PLATFORM_MIMARISI.md`, `docs/PLAN_2.8.md`, `docs/PLAN_MAGAZAM.md`,
`docs/YETKI.md`, `docs/STUDIO.md`, `docs/KESIF.md`, `docs/KOD_STANDARTLARI.md`, `CHANGELOG.md`
(en üstteki "Hazırlanıyor: 2.8.0-alpha.6" bölümü).

---

## 4. Mimari kurallar ve öğrenilmiş dersler

### İşletme yalıtımı

- İşletme verisi taşıyan her tabloda RLS **açık ve zorlanmış** (`enable` + `force row level
security`). Politika `business_id = nullif(current_setting('vado.business_id', true), '')::uuid`.
  Yeni tablo için `select vado_secure_tenant_table('tablo_adi');` kullan.
- Roller: `vado_owner` (şema dosyalarını çalıştırır, tabloların sahibi), `vado_app` (uygulama),
  `vado_platform` (BYPASSRLS; yalnız platform işleri). Testlerde uygulama `vado_app` ile bağlanır.
- TypeScript'te işletme işlemleri `withTenant(db, scope, tx => …)` içinde yapılır.
- Sadece şema dosyalarıyla değişen katalog tablolarında
  `revoke insert, update, delete, truncate on … from vado_app, vado_platform;` yaz.

### Tek yetki modeli

`BUSINESS_PERMISSIONS` (`packages/contracts/src/business-access.ts`), SQL'de
`business_member_can` / `tenant_member_can`, TypeScript'te `authorize`, `permittedBranch`
(`apps/api/src/core/business-access.ts`). Yeni modül ayrı izin tablosu açmaz; kataloğa izin ekler.
Ayrıntı: `docs/YETKI.md`.

### Tarafsız sipariş çekirdeği (A2 — kısmen bitti)

- **Paket kataloğu** `capability_catalog` (0031–0032): paketin rolü (`workflow`/`data`),
  gereksinimleri, akış eklemeleri, varsayılan ayarı, ayar doğrulayıcısı, etkin siparişte
  kapatılabilirliği, alış beyanı (`explicit_modes`, `opening_hours`), `decision_required`.
  Manifestler `apps/api/src/modules/capabilities/capabilities.registry.ts`'dedir;
  `apps/api/test/capability-catalog.test.ts` manifest ile katalogu ve **256 paket bileşiminin**
  her teslim biçimindeki akışını karşılaştırır (bugün 120 geçerli bileşim; yeni paket eklersen bu
  sayıyı bilerek güncelle ve nedenini yaz).
- **Teslim biçimi kaydı** `ordering_fulfilment_modes` (0033–0034): açan paket, istenen bağlam türü,
  adres gerekip gerekmediği, **tahsilat yerleri**, paketin ek kural işlevi (`regprocedure`). Tek
  karar işlevi: `ordering_fulfilment_status(...)` → `ok` / `unavailable` / `closed`.
- **Sipariş bağlamı**: sepet ve sipariş `context_kind` + `context_id` taşır; sözleşmede
  `context: {kind, id} | null` ve `contextLabel`. Tek tür bugün `table_session` (masa servisi).
  Bağlamın varlığını ve adını onu kaydeden paket denetler/üretir (`table-session-labels.ts`).
- **Canlı olay türleri** `live_event_types`: paket olayının kaynağını paketin çözücü işlevi bulur.
- Sözleşmedeki kayıtlar (`fulfilmentSchema`, `ORDER_CONTEXT_KINDS`, canlı olay türleri) SQL
  kayıtlarıyla testte karşılaştırılır; birini değiştirirsen ötekini de değiştir.

### SQL'de dikkat edilecekler (bu kaynakta yaşanmış hatalar)

1. **PL/pgSQL'de değişken adı ile sütun adı çakışırsa** sorgu çalışma anında "ambiguous" hatası
   verir (ör. `check_order_totals` içindeki `context_id` değişkeni). Yerel değişken ve parametre
   adlarını sütun adlarından farklı seç (`target_order`, `source_kind`). Bir sütunu yeniden
   adlandırınca `select proname from pg_proc where prosrc ilike '%eski_ad%'` ile bütün işlev
   gövdelerini tara ve gerekenleri yeni dosyada yeniden tanımla.
2. **Zorlanmış RLS altında veri taşıma**: `vado_owner` RLS'ye tabidir; taşımada
   `alter table … no force row level security; alter table … disable trigger user;` → `update` →
   `enable trigger user; force row level security;` sırası kullanılır (örnek: `0034`). Taşıma
   sonrası `validate constraint` çalıştır.
3. Yeni kısıtı veri taşınmadan önce eklemen gerekirse `not valid` ile ekle, taşımadan sonra
   `validate constraint` et.
4. Tablo kısıtında (CHECK) başka tablo okuyan işlev **kullanma**: yedekten dönüşte yükleme sırası
   bozar. Bu denetimler tetikleyicidedir.
5. İşlev gövdesindeki adlar çalışma anında çözülür; bir tabloyu yeniden adlandırınca onu kullanan
   işlevleri yeniden tanımla.
6. `pg` INT8'i sayıya çevirir (`apps/api/src/core/database.ts`); satır tiplerinde `number` yaz,
   `Number(...)` sarmalama.
7. Yükseltme testleri: `migrate(url, { through: "00NN_….sql" })` ile eski şemaya kadar kur, veri
   koy, sonra kalan dosyaları uygula (örnekler: `upgrade-2.7.test.ts`, `upgrade-context.test.ts`;
   eski veri taklidi için `createIsolatedDatabase().adminUrl` süper kullanıcı bağlantısı ve
   `set session_replication_role = replica`).

### İstemci tarafında dikkat edilecekler

1. React Compiler açık: mobilde `useMemo`, `useCallback`, `memo` yasak.
2. Render sırasında `Date.now()` çağırma; `useNow(aralıkMs)` kancasını kullan
   (`apps/business/components/use-now.ts`, `apps/mobile/src/lib/use-now.ts`).
3. Etki (`useEffect`) içinde eşzamanlı `setState` lint hatasıdır. Sonuçları istendikleri anahtarla
   sakla, eski sonucu türet (örnek: `miniapps/shop/src/app.tsx`, `loadedCatalog`/`loadedQuote`).
   `try/catch` içinde `setState` yapan uzun async işlevleri ayır ve hatayı `.catch` ile yakala
   (örnek: `loadStore` + `initialize`).
4. Renk doğrudan yazılmaz: mobilde `theme/tokens.ts`, web'de `globals.css` değişkenleri.
5. Dosya adları küçük harf ve tire. Paket dışına göreli yolla çıkılmaz.
6. Form olayları için `SyntheticEvent<HTMLFormElement>` (`FormEvent` kullanımdan kalktı).
7. Teslim biçimi adları `FULFILMENT_LABELS`'tan gelir; ekranda elle "Gel al" yazma.
8. Testlerde yanıt kodunu doğru bekle: oluşturma 201 döner (ör. rezervasyon).

---

## 5. İş sırası

Her adım = ayrı ZIP. Sıra bağımlılığa göredir; değiştirme.

### Adım 0 — Devraldığın kaynağı doğrula

Boş klasörde `npm ci` + `npm run check`. Sonucu sayılarla yaz. Kırık varsa düzelt, ayrı ZIP ver.

### Adım A2-2c — TAMAMLANDI ve doğrulandı (yalnız başvuru için)

Aşağıdaki tanım uygulandı (`0035`, `0036`). Yeniden yapma; A2-3'ten devam et.

**Amaç:** Çekirdekte "kitchen" (mutfak) adı kalmasın. Cihaz her sektörün operasyon cihazıdır
(restoranda "Mutfak ekranı", markette "Toplama ekranı" adıyla görünür).

Şema (`0035_operation_devices.sql`, çekirdek):

- Tabloları yeniden adlandır: `kitchen_devices` → `operation_devices`, `kitchen_pairings` →
  `operation_device_pairings`, `kitchen_socket_tickets` → `operation_device_tickets`. Bunlara bağlı
  dizin ve kısıt adlarındaki `kitchen` sözcüğünü de değiştir (`alter index … rename`, `alter table …
rename constraint`).
- İşlevleri yeniden adlandır: `lookup_kitchen_pairing` → `lookup_device_pairing`,
  `approve_kitchen_pairing` → `approve_device_pairing`, `protect_kitchen_device` →
  `protect_operation_device`, `protect_kitchen_ticket` → `protect_device_ticket`. **Gövdelerinde
  eski tablo adı geçen her işlevi** (bunlar ve `append_order_change`, `protect_kitchen_capability`,
  `apps/api/src/core/tenant-maintenance.ts` içindeki SQL) yeni adlarla yeniden tanımla.
- `capability_catalog`'a `device_statuses text[] not null default '{}'` ekle.
- `append_order_change`: cihaz değişikliğinde cihaz geçerli mi (aynı şube, örnek, iptal edilmemiş,
  süresi dolmamış) **ve** siparişin paketlerinden birinin `device_statuses` listesi yeni durumu
  içeriyor mu, katalogdan bak. Paket adı yazma.

Şema (`0036_operation_device_packages.sql`, paket): `ordering.kitchen` satırına
`device_statuses = '{accepted,rejected,preparing,ready,completed}'`. `protect_kitchen_capability`
paketin kendi kuralıdır; yeni tablo adıyla yeniden tanımla.

API ve istemciler:

- `apps/api/src/modules/business-management/kitchen-devices.{service,routes}.ts` →
  `operation-devices.{service,routes}.ts`; uçlar: `/v1/business/:businessId/devices`,
  `/v1/device-pairings`, `/v1/device/*` (eski `/kitchen-devices`, `/kitchen-pairings`, `/kitchen/*`
  kaldırılır; dışarıda istemci yok). `realtime.ts` içinde soket türü `kitchen` → `device`.
- Sözleşmede `kitchenDevice*` → `operationDevice*`.
- Business: BFF yol politikası (`apps/business/lib/request-policy.ts`, `kitchen-api.ts`),
  `kitchen-pair` ve `tablet` sayfaları yeni uçlara. Restoran ekranındaki Türkçe ad ("Mutfak ekranı")
  aynen kalır.
- **Tahsilat yerleri sözleşmede:** `recordOrderPaymentBodySchema.place` sabit listesi yerine
  sözleşmede `PAYMENT_PLACES` (counter, table, delivery) ve `FULFILMENT_PAYMENT_PLACES`
  (pickup: counter; dine_in: table, counter; delivery: delivery, counter) kaydı; Business tahsilat
  ekranı yalnız siparişin biçimine uygun yerleri gösterir. Testte SQL'deki `payment_places` ile
  karşılaştır.

Testler: katalog eşitliğine `device_statuses`; cihazın listede olmayan durumu veremediği (HTTP ve
doğrudan SQL); yeniden adlandırılmış uçlarla bütün mutfak/cihaz testleri; `kitchen` adının
`apps/api/src/core` ve `modules/ordering` içinde kalmadığını gösteren arama (A2-3'teki kalıcı
denetim gelene kadar raporda).

Kabul: `npm run check` yeşil; `grep -ri kitchen apps/api/src/core apps/api/src/modules/ordering`
boş.

### Adım A2-3 — Köprü ad alanları, kalıcı denetim, mağaza kanıtı → sürüm 2.8.0-alpha.6

1. **Köprü:** `ordering.joinTable`, `ordering.getTable`, `ordering.getBill`,
   `ordering.requestService` → `tableService.join`, `tableService.get`, `tableService.getBill`,
   `tableService.request` (`packages/contracts/src/bridge.ts`: istek/sonuç/izin eşlemeleri;
   `packages/miniapp-sdk/src/client.ts`: `vado.tableService.*`; mobil kabuk
   `apps/mobile/src/features/miniapps/bridge.ts` ve `ordering-host.ts`). Yeni köprü izni
   `table_service.basic`; restoran manifesti izinleriyle birlikte sürüm yükseltir.
   `ordering.getRestaurant` kaldırılır: restoran mini uygulaması `ordering.getStore`'a geçer;
   `RestaurantContext`'e özgü alanları karşılaştır, gerekenleri `StoreContext`'e (genel) ya da
   `tableService.*`'e (masa) taşı. Eski adlar kaldırılır (yayımlanmış dış mini uygulama yok);
   CHANGELOG'da "kırıcı değişiklik" olarak yaz.
2. **Kalıcı denetim** (`scripts/check-conventions.mjs`): çekirdek dosyalarda restoran kavramı
   bulunursa hata. Çekirdek dosyalar: `apps/api/src/core/**` (bugünkü `restaurant-live.ts`'i
   restoran modülüne taşı ya da genelleştir), `apps/api/src/modules/ordering/**`, çekirdek şema
   dosyaları (açık listeyle: `0031`, `0033`, `0035` ve sonraki çekirdek dosyalar). Yasak sözcükler
   (büyük/küçük harf duyarsız): `table_session`, `tableSession`, `kitchen`, `waiter`, `courier`,
   `restaurant`, `dine_in`, `masa`, `mutfak`, `garson`, `kurye`, `restoran`. Sözleşmedeki
   kayıtları (`fulfilmentSchema`, `ORDER_CONTEXT_KINDS`, `FULFILMENT_LABELS`…) ayrı bir kayıt
   dosyasına (`packages/contracts/src/ordering-registry.ts`) taşı ve denetimde açıkça muaf tut;
   muafiyetin gerekçesini kural yorumuna yaz. Denetimin kendisi için test: yasak sözcük içeren
   geçici bir çekirdek dosya hata üretmeli.
3. **Mağaza kanıtı** (`apps/api/test/store-proof.test.ts`): masa servisi ve operasyon cihazı
   paketleri **kapalı** bir mağaza örneği (`ordering.pickup`, `ordering.preparation`,
   `ordering.delivery`, `ordering.reorder`, `ordering.returns`), gerçek HTTP ve SQL üzerinden:
   katalog → gel-al sepeti → kupon → sadakat puanı → sipariş → kabul/hazırlık/hazır/tamam →
   tezgâhta tahsilat → değerlendirme → iade talebi ve kararı → tekrar sipariş; ayrıca adrese teslim
   (adres, bölge, ücret, en az tutar, yolda durumu, teslim). Siparişlerde `context` boş, canlı
   olaylarda bağlam yok; denetim betiği temiz.
4. Sürüm `2.8.0-alpha.6` (her yerde + kilit dosyası). CHANGELOG'daki "Hazırlanıyor" bölümü tarihli
   `2.8.0-alpha.6` olur. `docs/PLAN_2.8.md` A2'yi tamamlandı olarak işaretle.

### Mağazam (M1–M8) — `docs/PLAN_MAGAZAM.md`'nin uygulanması

Planın kararları (MK1–MK7), müşteri ve esnaf yolculukları, blok listesi ve Türkiye kuralları
bağlayıcıdır. Aşağıdaki teknik ayrıntılar planı tamamlar.

#### M1 — Sektör paketleri, düzenler, renkler, bloklar, ortak çizici, randevu köprüsü

- **Sözleşme** (`packages/contracts/src/storefront-builder.ts` + mevcut `studio.ts`):
  - `SECTOR_PACKS`: planın §6 tablosundaki 26 paket. Her biri: `id`, `group`, `name`, `engine`
    (`ordering` | `reservation`), `defaultModes`, `defaultBlocks`, `starterCategories` (ad, sıra),
    `unitHints`, `withdrawal` (`standard` | `perishable` | `custom_made`), `prohibitedLexicon`
    kimliği, `vatHints` (yalnız `vatReviewed: true` olunca gösterilir; mali müşavir okuması
    yapılmadan `false`).
  - `STOREFRONT_LAYOUTS`: `simple`, `showcase`, `corporate` (Türkçe adları: Sade, Vitrin, Kurumsal).
  - `STOREFRONT_PALETTES`: 8 renk (accent, surface, onAccent, text). **Kontrast testi**: metin/zemin
    ve düğme metni/accent en az 4.5:1 (WCAG AA). Hesabı testte yaz (göreli parlaklık formülü).
  - Bloklar: planın §6 tablosu; her biri ayrı Zod nesnesi, `discriminatedUnion("type", …)`,
    sınırlarıyla. Belge: `{version: 2, sectorPack, layout, palette, logoMediaId, coverMediaId,
title, tagline, blocks}`; en çok 20 blok; `cover` ilk sırada ve zorunlu; sipariş motorunda
    `products`, rezervasyonda `services` zorunlu; `legal` bloğu belgeye yazılmaz, çizici her zaman
    en alta ekler. Bilinmeyen blok iki uçta reddedilir. Serbest HTML/CSS/URL alanı yok (sosyal
    bağlantı yalnız izinli alan adlarıyla: instagram.com, facebook.com, x.com, youtube.com,
    tiktok.com).
- **Şema** (yeni dosya): `business_studio` tablosuna `sector_pack`, `document jsonb` (taslak) ve
  yayın görüntüsü için karşılığı; mevcut kayıtları v2 belgeye çevir (`templateId` → sektör paketi +
  düzen eşlemesi, varsayılan bloklar). Taslak/yayın ayrımı, beklenen sürüm (409) ve medya
  sahipliği korunur.
- **API:** taslağı kaydet (beklenen sürümle), yayınla (mevcut akış), sahibe/yöneticiye taslak
  önizleme verisi. Canlı veri (fiyat, stok, puan, saat) belgeye kopyalanmaz.
- **Çizici:** `miniapps/shared/storefront/` altında her blok bir bileşen; restoran, mağaza ve
  randevu mini uygulamaları ile Business önizlemesi aynı bileşenleri kullanır.
  `dangerouslySetInnerHTML` yasak (A2-3 denetimine ekle).
- **Studio düzenleyicisi** (Business): telefon öncelikli; blok ekle/kaldır/gizle, yukarı/aşağı
  taşı (sürükle-bırak zorunlu değil, erişilebilir düğmeler zorunlu), blok başına form, canlı
  önizleme (aynı çizici), yayın.
- **Randevu köprüsü** (`docs/BOOKING_S11.md`'deki eksik): `booking.getCatalog`,
  `booking.getSlots`, `booking.book` (Idempotency-Key), `booking.listMine`, `booking.cancel`;
  sözleşme, SDK, mobil kabuk, izin. `miniapps/appointment` önizleme olmaktan çıkar, gerçek
  motoru kullanır. Sonra `LIVE_ENGINES`'e `reservation` eklenir, güzellik şablonları açılır.
- Testler: blok şemaları, kontrast, Studio v2 API (sürüm çakışması, bilinmeyen blok, başka
  işletmenin medyası), v1→v2 veri taşıma (yükseltme testi), çizici birim testleri, randevu köprüsü
  (mobil kabuk testi + API).

#### M2 — Katalog derinliği

- Ürün: `unit` (`piece`, `kg`, `g`, `l`, `ml`, `pack`), `sale_mode` (`unit` | `weight`),
  `weight_step_grams`, `stock_quantity` (boş = takip yok), `barcode` (EAN-13, denetim basamağı
  SQL işlevi ve sözleşmede aynı algoritma), en çok 6 fotoğraf (`catalog_item_images`, sıra).
- **Stok:** sipariş verilirken aynı işlemde satır kilidiyle düşer; yetmiyorsa `cart_changed`
  (ürün `available:false`). Ret/iptal stoğu bir kez geri koyar (yaşam döngüsü kancası). Eş zamanlı
  iki müşteri son ürün için SQL testiyle sınanır.
- **Tartılı satış:** müşteri gram adımıyla seçer, tahmini tutarı görür. Sipariş toplamı değişmez
  (çekirdek kuralı); işletme tartınca `order_weight_adjustments` (satır, ölçülen gram, fark kuruş,
  üye, zaman; yalnız eklenir) yazar. Ödenecek tutar = toplam + farklar. Fark sınırı sektör paketi
  kuralıdır (varsayılan +%10); üstüne çıkamaz. Tahsilat, puan ve iade ödenecek tutarı kullanır.
  Birim fiyat (kg/lt başına) her yerde gösterilir.
- KDV: 0/1/10/20 listesi; öneri yalnız `vatReviewed` paketlerde.
- Business: barkod alanı, fotoğraf sırası, stok, "Tükendi" tek dokunuş.

#### M3 — Yasal profil ve mesafeli satış (PLAN_2.8 A5 çekirdeği)

- `business_legal_profiles` (satıcı türü: `company` | `sole_trader` | `home_producer`; ad/unvan,
  VKN/TCKN — doğrulama algoritmalarıyla, maskeli gösterim —, vergi dairesi, MERSİS (şirkette),
  esnaf muaflığı belge no (ev üretiminde), açık adres, telefon, e-posta, KEP). Sürümlü, denetim
  kayıtlı.
- Profil tamamlanmadan **gel-al ve adrese teslim** siparişi açılmaz (masada servis yüz yüzedir;
  hukuk okumasında kesinleşir). Kural `ordering_fulfilment_status`'a değil, ayrı bir yayın/sipariş
  ön koşul işlevine yazılır; hata kodu `legal_profile_required`.
- Ön bilgilendirme formu ve mesafeli satış sözleşmesi: sürümlü şablonlar (`legal_document_templates`),
  sunucuda sepete göre üretilir (satıcı, ürünler, KDV dahil toplam, teslimat ücreti, ödeme yeri,
  cayma hakkı: 14 gün; çabuk bozulan ve kişiye özel üründe istisna — sektör paketi ve ürün
  işaretinden). Metnin özeti `quoteHash`'e girer; değişirse `cart_changed`. Sipariş, onaylanan
  metni, sürümünü ve özetini değişmez saklar (`order_legal_acceptances`); müşteri sipariş
  ayrıntısında her zaman görür.
- Yasaklı ürün: sözleşmede Türkçe sadeleştirmeli sözlük (alkol, tütün, ilaç, silah, canlı hayvan…);
  ürün kaydında ve yayında taranır; eşleşen ürün durur, neden yazılır; şüpheliler portal inceleme
  kuyruğuna düşer.
- İleti izinleri ve İYS (A5'in geri kalanı): işletme × kanal izin defteri (yalnız eklenir), push
  izni ayrı; İYS sağlayıcı arayüzü yapılandırılmamışsa SMS/e-posta ticari iletisi gönderilmez.
  Gerçek İYS bağlantısı denenemez; "denenmedi" yaz.
- Belge: `docs/MEVZUAT.md`.

#### M4 — Dükkân Aç sihirbazı ve Dükkânım kabuğu

- Business'ta `/start` sihirbazı (planın §3'teki 10 adım). Her adım sunucuya taslak yazar
  (`business_onboarding`: işletme, adım, veri, sürüm); telefon değişse de kaldığı yerden sürer.
- Adımlar mevcut uçları kullanır: işletme oluşturma, şube adresi (il/ilçe/mahalle), teslimat
  bölgeleri (**PLAN_2.8 A3'ün bölge ekranı burada yazılır**: mahalle çoklu seçimi, ücret, en az tutar,
  süre), saat hazır seçenekleri, ilk ürünler (kamera `capture="environment"`, `decimalToMinor`),
  yasal profil (M3), son kontrol (`GET /v1/business/:id/publish-readiness` → eksik listesi ve
  düzeltme bağlantıları), yayın.
- VADO uygulamasında **Dükkânım** (`apps/mobile/src/app/(app)/my-business/…`): sahip olunan
  işletmeler; Business'ı `react-native-webview` içinde açar. **Devir kodu:** API
  `POST /v1/business-handoff` (kullanıcı oturumuyla) → 32 bayt rastgele kod, yalnız SHA-256 özeti
  saklanır, 60 sn, tek kullanım, kullanıcıya ve hedef yola bağlı → WebView adresi `#code=` parçası
  → Business BFF `POST /v1/business-handoff/redeem` ile oturum çerezi kurar. Köprü: sürümlü mesajlar
  (`{v:1,type:"scan.barcode"|"share"|"notifications.permission"}`), Business köprüyü yalnız varsa
  kullanır, yoksa web yolunu.
- İşletme bildirimleri: yeni sipariş/randevu/mesaj, ilgili izni olan üyelere mevcut push servisiyle
  (`apps/api/src/modules/notifications`), işlemsel ileti olarak.
- Mobildeki `businesses/register.tsx` kaldırılır; "Dükkân Aç" düğmesi `me` sekmesinde.
- Testler: devir kodu (süre, tekrar, başka kullanıcı, başka yol), sihirbaz API'leri, Playwright ile
  390×844'te sıfırdan yayına senaryo (Chromium: `/opt/pw-browsers` ya da ortamındaki).

#### M5 — Kısa adres, paylaşım sayfası, ana ekrana ekleme, web'den sipariş, QR afiş

- `business_handles`: Türkçe sadeleştirilmiş, benzersiz; ayrılmış adlar (vado, destek, admin,
  yardim, api, www, business, portal…); değişince eski ad 1 yıl yönlenir, 90 gün başkasına verilmez.
- `GET /@:handle`: sunucuda üretilen hafif HTML; **bütün değerler kaçışlı** (XSS testi), Open Graph
  (`og:title`, `og:description`, `og:image`, `og:url`), `theme-color`, mağazaya özel manifest
  bağlantısı; JavaScript olmadan okunur. Manifest: ad, kısa ad, 192/512 ikon (logodan `sharp` ile
  türetilmiş medya), `start_url`/`scope` mağazanın yolu, `display: standalone`. Android Chrome'un
  güncel kurulabilirlik şartlarını kontrol et (gerekiyorsa en küçük service worker).
- Web'den sipariş: VADO web uygulamasında (`apps/mobile` web çıktısı) mağaza yolu; müşteri telefon
  - SMS koduyla girer; mini uygulama mevcut web çerçevesinde
    (`apps/mobile/src/features/miniapps/mini-app-frame.web.tsx`) aynı köprüyle çalışır.
- Android App Links: `/.well-known/assetlinks.json` (paket adı ve imza parmak izi ortam
  değişkeninden), Expo intent filtreleri.
- QR afiş: sunucuda PDF (A4 vitrin, A5 masa kartı, etiket sayfası); `pdf-lib` +
  `@pdf-lib/fontkit` + gömülü **Noto Sans** (OFL; THIRD_PARTY_NOTICES). Türkçe harf (ş, ğ, ı, İ)
  testi: PDF metni ayrıştırılıp karşılaştırılır.

#### M6 — Dükkânım günlük işler

Bugünün özeti (bekleyen sipariş/randevu, kapıda tahsil edilen ciro, yeni mesaj), uygulama açıkken
sesli uyarı (mevcut `use-business-live`), tek dokunuş tükendi (mevcut toplu uç), **toplu fiyat**
(kategori ya da seçili ürün; yüzde ya da tutar; önce önizleme; her ürün beklenen eski fiyatla;
tek uyuşmazlık hepsini geri alır), sohbet yanıtı. Tarayıcı senaryoları ve eş zamanlı düzenleme
çakışma testi.

#### M7 — Kalite kapısı

Business ve web mağazasında Playwright + axe-core erişilebilirlik denetimi (ihlal sayısı 0),
dokunma alanı ≥ 48dp, büyük yazı ölçeği, yavaş 3G ve bağlantı kopması, çift dokunma (idempotency).
Bozma denemeleri: yeni her korumaya bir gerçek bozma testi.

#### M8 — Gerçek kullanıcı denemesi (sürüm sahibiyle; yapay zekâ yapamaz)

Kontrol listesini `docs/KABUL_MAGAZAM.md` olarak yaz: beş esnaf, gerçek Android telefon, kurulum
süresi, takıldıkları yer, kamera/barkod/push/ana ekrana ekleme. Sonuçları sürüm sahibi doldurur.

#### M9 — Yapay zekâ ile ürün listesi önerisi

**Yapma.** Sürüm sahibi sağlayıcı ve bütçe kararı verene kadar bekler (PLAN_MAGAZAM MK7).

### 2.8 kalanları

- **A3:** kurye kuyruğu ve atama ekranı (Business), kuryenin "Teslimatlarım" ekranı, müşteri
  adres/teslimat/kupon/puan ekranlarının eksikleri; canlı teslimat durumu. (Bölge ekranı M4'te.)
- **A4:** değerlendirme, favori, iade, tekrar sipariş ekranlarının eksikleri; işletme sohbetinde
  `chat.reply` izni (PLAN_2.8 K7).
- **A6 kapanış:** PLAN_2.8 §5'teki liste (bozma denemeleri, 3 ekran boyutunda tarayıcı yolculukları,
  zayıf ağ, 2.7.0 → 2.8.0 geçişi ve geri dönüş, Docker imajları, `npm audit` bulgularının
  değerlendirilmesi, sürüm `2.8.0`).

---

## 6. Her adımın teslimi

1. Kod + test + belge (konu belgesi ve `CHANGELOG.md` "Hazırlanıyor" bölümü).
2. `npm run check` yeşil (ya da kural 2'ye göre dürüst etiket).
3. Commit mesajı Türkçe: ilk satır ne yapıldığı, gövdede neden.
4. ZIP: depo kökü `VADO/` klasörü olacak biçimde, `node_modules`, `.next`, `dist` olmadan
   (`git archive --format=zip --prefix=VADO/ -o VADO_<sürüm>_<adım>.zip HEAD`).
5. Rapor (bölüm 0'daki dört başlık).

## 7. Karar bekleyenler (sürüm sahibine sor, kendin karar verme)

- M9 yapay zekâ sağlayıcısı ve bütçesi.
- Yasal metin şablonlarının hukukçu okuması; ETBİS gibi yükümlülükler.
- KDV öneri tablosunun mali müşavir okuması (o zamana kadar `vatReviewed: false`).
- Masada servisin mesafeli satış sayılıp sayılmadığı (hukuk okuması).
