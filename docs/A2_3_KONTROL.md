## Ara teslim 9 — masa oturumu kimliği ve liste filtrelerinin doğrulanması

- `apps/mobile/src/features/miniapps/ordering-host.ts` artık `tableService.get` yanıtının
  yalnızca seçilen uygulama örneğine değil, istemcinin istediği oturum `id` değerine de
  ait olmasını zorunlu kılar. Başka oturumun bilgileri mini uygulamaya aktarılmaz.
- Aynı dosyada `ordering.listOrders` sorgusu isteğe bağlı filtreler `undefined` olduğunda
  bunları URL'ye eklemez; yanlışlıkla `cursor=undefined` ve `active=undefined` üretilmez.
- `apps/mobile/test/ordering-host.test.ts` doğru ve farklı kimlikli masa yanıtlarını,
  farklı uygulama örneğini ve boş liste filtrelerini denetleyen yeni testler içerir.
- `npm run conventions` çalıştırıldı; tüm kaynak denetimi ve 3 negatif mimari test geçti.
  `npm ci --offline` yerel önbellekte `zxing-wasm` olmadığı için tamamlanamadı.
  Mobil Vitest, PostgreSQL testleri, tam lint/tip kontrolü ve derleme çalıştırılamadı.
  `0001–0036` yayımlanmış şemalar değişmedi; sürüm numarası yükseltilmedi.

## Ara teslim 8 — masa servisi köprü yanıtının bağlama doğrulanması

- `apps/mobile/src/features/miniapps/ordering-host.ts` içindeki `tableService.request`,
  HTTP sonucunu doğruladıktan sonra `tableSessionId` değerinin istenen masa oturumuna,
  `kind` değerinin istenen çağrı türüne ait olmasını zorunlu kılar.
  Başka oturumun yanıtı mini uygulamaya aktarılmaz.
- `apps/mobile/test/ordering-host.test.ts` doğru yanıtı ve tekrar anahtarının aktarımını,
  ayrıca yanlış oturum ve yanlış çağrı türünün reddini sınar.
- Bağımlılıklar bu ortamda temiz kurulamadığından mobil Vitest ve tam `npm run check`
  henüz doğrulanmadı; yayımlanmış 0001–0036 şemaları değiştirilmedi.

## Ara teslim 7 — eski köprü adları için kalıcı kaynak sınırı

- `scripts/check-conventions.mjs` eski `ordering.getRestaurant` ve masa köprüsü
  yöntemlerini sözleşme, SDK, mobil kabuk ve mini uygulama üretim kaynaklarında reddeder.
  Böylece A2-3 ile kaldırılan yöntemler sonraki geliştirmelerde geri dönemez.
- `scripts/check-conventions.test.mjs` kaynak dosyasında eski bir masa yöntemi
  bulunduğunda komutun başarısız olduğunu gerçek alt süreçte doğrular. Önceki iki
  negatif mimari testi aynen korunur.
- `docs/KOD_STANDARTLARI.md` güncellendi; yayımlanan şema aralığı artık 0001–0036
  olarak doğru belirtiliyor. Bu teslimde uygulama kodu ve yayımlanmış SQL şemaları
  değiştirilmedi.
- Tam `npm run check`, bağımlılıklar temiz kurulamadığı için doğrulanamadı;
  PostgreSQL testleri, tip denetimi, lint ve derleme denenmedi.

# A2-3 — kaynak ilerleme ve doğrulama sınırı

**Tarih:** 10.10.2026. **Durum:** Ara kaynak, tam kabul yapılmadı.

Bu çalışmanın tek girdisi `VADO_2.8.0-alpha.5_A2-2c_dogrulandi.zip` dosyasıdır. Önceki sürümden kod veya `node_modules` kullanılmadı. Önceki 1082 testin geçtiği bilgisi doğrulanmış kaynakla birlikte geldi; **bu değişikliklerin test sonuçları değildir**.

## Ara teslim 6 — gerçek alışveriş kategorisiyle mağaza kanıtı

- `apps/api/test/support/tenant-fixture.ts` ortak işletme kurucusu artık isteğe bağlı
  `Category` alır. Varsayılan `food` korundu; eskiden çalışan restoran testleri için
  davranış değişikliği yoktur. İşletme ve mini uygulama kategorisi aynı değerden oluşturulur.
- `catalog-fixture.ts` ve `delivery-fixture.ts` bu kategoriyi geriye uyumlu biçimde
  iletir. `store-proof.test.ts` bütün senaryolarda `shopping` işletmesi kullanır; ham
  SQL ile işletme ve mini uygulamanın gerçekten `shopping` olduğunu ve masa/cihaz
  paketlerinin etkin olmadığını kontrol eder. Önceden yazılan mağaza kanıtı `food`
  kategorisinde örnek üzerinde çalışıyordu; bu eksiklik kapatıldı.
- Kaynak kod ve test senaryoları güncellendi. PostgreSQL entegrasyon testi, tam tip
  denetimi, lint ve üretim derlemesi **henüz doğrulanmadı**. Yayımlanmış
  `0001–0036` şemaları değiştirilmedi.

## Ara teslim 5 — ham HTTP gizlilik ve reddedilen ödemenin etkisizliği

- `apps/api/test/store-proof.test.ts` genel vitrin ve eski `/restaurant`
  uçlarının **ham HTTP gövdelerini** karşılaştırır. Zod nesne şeması bilinmeyen
  alanları temizlediğinden, gizlilik testi ayrıştırılmış yanıt yerine gerçek
  HTTP gövdesine bakar. Alıcının ve hesap sahiplerinin telefonları ile müşteri
  kimliği vitrin JSON'unda bulunmamalıdır.
- Değişen puan ayarı nedeniyle eski teklifin `cart_changed` yanıtından sonra aynı
  tekrar anahtarıyla ikinci istek yine 409 olmalı; ortada yeni sipariş
  bulunmamalı, sepet açık ve sürümü aynı kalmalı, sadakat bakiyesi değişmemelidir.
  Güncel teklif ve **yeni** tekrar anahtarıyla yalnızca bir sipariş oluşmalıdır.
- `npm run conventions` ve iki mimari negatif test çalıştırıldı ve geçti.
  Çevrimdışı `npm ci` yerel npm önbelleğinde `zxing-wasm` olmadığı için
  durdu; `npm run check` Prettier kurulamadığından durdu.
  HTTP/SQL regresyon testi, lint, tip denetimi ve derlemeler **denenmedi**.
  0001–0036 migration dosyaları değiştirilmedi.

## Ara teslim 4 — güncel sepet teklifi ve fiyat özeti regresyonu

- `apps/api/test/store-proof.test.ts` içindeki mağaza kurulumu, sadakat puanı ayarı
  güncellendikten sonra teslimat sepetini müşteri ucundan tekrar okur. Böylece
  siparişte eski ayara göre hesaplanan `quoteHash` gönderilmez.
- Yeni HTTP testi işletme puan ayarının değiştiği anda eski teklifin `cart_changed`
  yanıtıyla reddedilmesini, güncel sepet özetiyle ödeme adımının kabulünü denetler.
- `npm run conventions` çalıştı: 713 dosya ve 2 mimari negatif test başarılı.
  `npm ci --offline` için `zxing-wasm` arşivi önbellekte yok. Yeni HTTP/SQL testi,
  Prettier, lint, tip denetimi ve derleme **doğrulanmadı**.
- Yayımlanmış `0001–0036` şema dosyaları değiştirilmedi. Yeni bağımlılık eklenmedi.

## Ara teslim 3 — mağaza puan döngüsü ve kalıcı SQL denetimi

- `apps/api/test/store-proof.test.ts` içinde ilk gel-al siparişi tamamlanıp puan kazandıktan
  sonra ikinci bir gel-al sepeti açılır. Biriken puanın 100 kuruşluk kısmı harcanır;
  sipariş iptal edilince müşteri cüzdanına geri yüklenmesi beklenir. Ardından ilk
  siparişin değerlendirme, iade ve tekrar sipariş işlemleri kontrol edilmeye devam eder.
- Teslimat testi artık gerçek 10.000 kuruşluk asgari ürün tutarıyla çalışır; ücret ve
  asgari tutar hem müşteri teklifinde hem veritabanındaki değişmez teslimat görüntüsünde
  karşılaştırılır.
- `scripts/check-conventions.test.mjs` iki negatif test içerir: sektör adı taşıyan çekirdek
  TypeScript dosyası ve yeni `0037_ordering_probe.sql` dosyası reddedilir. Geçici deneme
  dosyaları her test sonunda silinir; yayımlanmış `0001–0036` şemaları değişmez.
- `npm run conventions` gerçek çalıştırmada geçti: 713 kaynak dosyası ve 2 negatif test.
  `npm ci --offline` eksik `zxing-wasm` arşivi nedeniyle tamamlanamadı; PostgreSQL testleri,
  tip denetimi, lint, Prettier ve üretim derlemesi çalıştırılmadı. Bu kaynak ara teslimdir.

## Ara teslim 2 — ortak vitrin ve derleme bağı

- `apps/api/src/modules/ordering/ordering.routes.ts` dosyasında taşıma sonrası eksik kalan `shellBusinessParamsSchema` içe aktarımı tamamlandı. Bu, ortamdan bağımsız simge çözümleme kontrolünde yakalandı.
- `apps/api/src/services.ts` içinde ortak `storefrontContext` servisi tanımlandı. `/store` ve `/restaurant` müşteri bağlamları artık doğrudan aynı sektör bağımsız servise bağlanır; mağazanın vitrini restoran nesnesine bağımlı değildir.
- Taşınan API modüllerinin içe aktarmaları üstte ve düzenli gruplarda toplandı.
- Mağaza kanıtı, eski `/restaurant` yoluyla genel `/store` yanıtlarının eşitliğini ve müşteri telefonunun bu yanıtlara eklenmediğini de denetler.
- Bağımlılıksız statik denetim: `npm run conventions` ve negatif kural testi geçti; bütün uygulama testleri PostgreSQL üzerinde henüz tekrar çalıştırılmadı.

## Köprü ve paket

- Masa işlemleri artık `tableService.join`, `tableService.get`, `tableService.getBill`, `tableService.request` ile sunulur. `table_service.basic` izni gereklidir; eski `ordering.*` masa yöntemleri köprüden kaldırıldı.
- Restoran mini uygulaması, ortak `ordering.getStore` bağlamını kullanır. Paket manifesti `1.2.0` oldu ve yeni izin eklendi.
- `apps/mobile/test/bridge.test.ts`, `apps/mobile/test/ordering-host.test.ts`, `packages/contracts/test/bridge.test.ts` ve `packages/miniapp-sdk/test/client.test.ts` regresyon senaryoları içerir.

## Çekirdek sınırı

- Sektöre ait canlı olay işleyicisi restoran modülüne, mağaza bağlamı rotası storefront modülüne taşındı.
- HTTP durum kodları sözleşme katmanına, teslim rolü sabiti iş yetkisi kataloğuna alındı.
- Teslimat biçimi, ödeme yeri ve bağlam türü kayıtları `packages/contracts/src/ordering-registry.ts` dosyasına ayrıldı; eski dışa aktarımlar korunur.
- `scripts/check-conventions.mjs` sektör sözcüklerini çekirdek API klasörlerinde engeller. Yayımlanmış 0031, 0033 ve 0035 SQL şemaları değiştirilemediğinden yeni içerik taramasından muaftır, bütünlükleri zaten SHA-256 ile sabittir. Sonraki çekirdek migration'ları da sektör sözcüklerinden arındırılmalıdır.
- `scripts/check-conventions.test.mjs` yasaklı bir çekirdek dosyası eklendiğinde komutun başarısız olduğunu sınar; `npm run conventions` ile koşar.

## Mağaza kanıtı

`apps/api/test/store-proof.test.ts` testinde masa/cihaz paketi kapalıyken gel-al ve adrese teslim için gerçek HTTP/SQL çağrılarıyla iki senaryo yazıldı. Kupon, puan, durumlar, ödeme, değerlendirme, iade, tekrar sipariş, adres, ücret, minimum tutar ve olay bağlamı kontrol ediliyor. **Bu senaryolar henüz PostgreSQL'de çalıştırılmadı.**

## Çalıştırılanlar ve engeller

- `npm run conventions`: çalıştırıldı ve geçti; negatif kural testi de geçti.
- `npm ci --offline`: eksik `zxing-wasm` önbelleği nedeniyle tamamlanamadı.
- `npm run format:check`: bağımlılıklar kurulmadığı için `prettier: not found`.
- ESLint, tam TypeScript tip denetimi, Vitest, PostgreSQL yükseltme/entegrasyon testleri, üretim derlemesi: **denenmedi**.

Tam `npm run check` geçmedikçe `2.8.0-alpha.6` ilan edilmez. Kalan kabul işleri: bütün denetimler, mağaza kanıt testlerinin gerçek veritabanında geçmesi, kırıcı köprü değişikliğinin tüm istemcilerde denenmesi, sürümün tüm `package.json` dosyalarında ve `README.md` içinde birlikte yükseltilmesi, ardından yalnız `npm install --package-lock-only` ile kilidin yenilenmesi. Çalışma alanı içinde uygulama paketleri için eski bağımlılık klasörlerinden hiçbir şey taşınmamalıdır.
