# S8 — Adrese göre gerçek teslimat keşfi (2026-10-10)

**Temel:** `VADO_2.8_A1_S7_Sohbet_Siparis_Kartlari_Tam_Kaynak.zip`. Kaynak tümüyle korunmuştur; eski alpha.3 kodu taşınmadı. Bu **geliştirme adayıdır**, üretim onayı değildir.

## Müşteri deneyimi

- Keşfet ve Arama aynı kaydedilmiş teslimat adresini kullanır; kullanıcı GPS izni vermek zorunda değildir.
- Kullanıcı adres kaydetmediğinde, telefonundaki **Yeni teslimat adresi ekle** ekranından il/ilçe/mahalle ve açık adres seçebilir.
- **Yerel keşif** seçiliyse önceki il/ilçe filtresi aynen çalışır. Kayıtlı adres seçilirse yalnız o mahalleye etkin teslimat bölgesi tanımlanmış işletmelerin şubeleri değerlendirilir.
- Teslimata uygun işletmelerin ön izlemesi şube adı, teslimat ücreti (minor->TRY) ve süre içerir. Mini uygulama sekmesi ayrı, ülke genelinde görünür; **teslimat garantisi olarak sunulmaz**.
- Adrese göre aramada `kind=business&deliveryAddressId=<uuid>` parametreleri kullanılmalıdır. `kind=all` / `miniapp` ile adresli keşif şema tarafından reddedilir.
- Sonuçlar arama sayfalama imlecini adres kimliğine bağlar. Eski adrese ait imleçle farklı adres taranamaz.

## Sunucu ve veri güvenliği

1. `discovery.routes.ts` oturumu doğrular; `search(query,userId)` kullanıcının adresine `readOwnedAddress` üzerinden erişir. Başkasının adresi veya rastgele UUID `not_found` döndürür; arşivli adresle liste boş döner.
2. `createDeliveryAvailabilityReader(platformDb)` bağımsız, **tek okuma** sınırıdır. Yalnız `business_id`, `branch_id/name`, etkin **bölge ücreti / asgari tutar / dakika** alanları çıkar; müşteri kullanıcı kimliği, telefon, adres satırı veya sipariş verisini **almaz**. Kimlik doğrulanmış müşterinin mahallesi parametre olarak verilir.
3. Okuma yalnız doğrulanmış ve aktif işletmeyi, aktif şubeyi, aktif bölgeyi, o mahalleye eşlenen servis alanını, etkin ordering.delivery paketli aktif uygulama örneğini ve `delivery_time_allowed` çalışma saatleri kuralını birlikte eşleştirir.
4. **Bilinçli RLS kararı:** A1'de tenant tablolarında `FORCE ROW LEVEL SECURITY` ve `vado_owner` rolünde `NOBYPASSRLS` bulunduğundan, bir `SECURITY DEFINER` SQL fonksiyonu ile RLS atlanamaz. Bu yüzden `vado_app` rolüne ek tablo okuma izni, kamusal RLS açılımı veya yeni SQL trigger/projection yapılmadı. Var olan `vado_platform` bağlantısı yalnız üstteki izole, parametreli ve sınırlı okuma için kullanılır. Genel DiscoveryService'e privileged DB nesnesi verilmez.
5. Siparişe geçildiğinde mevcut `quoteDelivery` ve checkout tekrar bölge, adres, şube, zaman, menü ve ücret kontrolü yapmalıdır. Arama sonuçları **anlık, bağlayıcı fiyat teklifi değildir**. Açılan işletme ekranında şube tercihini sepete otomatik aktarma bu aşamaya dahil değil; siparişte şube yeniden seçilir.

## Değişen dosyalar

- `packages/contracts/src/discovery.ts`: `deliveryAddressId` query parametresi ve seçenekli `delivery` sonuç önizlemesi.
- `apps/api/src/modules/discovery/delivery-availability.reader.ts`: tek amaçlı, read-only teslimat uygunluğu sorgusu.
- `apps/api/src/modules/discovery/discovery.service.ts`, `discovery.routes.ts`, `discovery-cursor.ts`: adres sahipliği, şube filtresi ve imleç kontrolü.
- `apps/api/src/services.ts`: yalnız okuma arayüzü üzerinden bağımlılık enjeksiyonu.
- `apps/mobile/src/features/discovery/delivery-filter.tsx`: ortak adres seçici.
- `apps/mobile/src/app/(app)/delivery-address-new.tsx`: GPS'siz adres kaydetme formu.
- `apps/mobile/src/app/(app)/(tabs)/discover.tsx`, `.../search.tsx`, `apps/mobile/src/features/discovery/discovery-result-row.tsx`: sonuç ve filtre ekranları.
- `apps/api/test/discovery-search.test.ts` ve `apps/api/test/discovery-delivery.test.ts`: parametre, sahiplik, mahalle ayrımı, ücret ön izlemesi, bölge kapanması, imleç bağı.

## Kabul kontrol listesi (gerçek DB/cihazda çalıştırılmalı)

1. Temiz `npm ci`, `npm run check` (format, lint, conventions, typecheck, Vitest, build) bütün workspace'lerde sıfır hata.
2. PostgreSQL 16 ve Docker ile A1/S7 güncellemesi, migration sırası ve yeni adres ekleme; RLS altında test kullanıcısının adresini okuma.
3. Test `discovery-delivery.test.ts` dahil tam regresyon paketi; diğer işletmenin mahalle/teslimat bölgesi bilgisi API'ye sızmamalı.
4. Sipariş oluşturma öncesi `quoteDelivery` kapalı bölge/şube, mağaza dışı adres, farklı fiyat ve stok için tekrar doğrulama.
5. Android/iOS üzerinde adres seçiminde şehir, ilçe, mahalle geçişi, adres kaydı, arama sayfalaması, mini uygulama sekmesi, ağ kesilmesi, hesap değişimi ve geri dönüş akışları.
6. Çok sayıda işletme barındıran mahallede performans ölçümü. Şu an okuma mahalle bazında uygun **işletme başına bir şube** getirir; büyük hacimde `EXPLAIN ANALYZE` ile indeks ve sorgu maliyeti incelenmelidir.

**Denenen ve denenmeyen:** Denendi (2.8.0-alpha.5, PostgreSQL 16, `vado_app`/`vado_platform` rolleriyle RLS altında): `apps/api/test/discovery-delivery.test.ts` dahil bütün API testleri; adrese bağlı imleç başka bir kayıtlı adresle kullanılınca `validation_failed`, başkasının ya da var olmayan adresle `not_found` alır. Denenmedi: telefonda adres seçimi ve arama; büyük veride `EXPLAIN ANALYZE`.

**Sonraki mantıklı iş:** S9'da teslimata uygun seçilmiş şubenin mini uygulama ve sipariş ekranına güvenli devri + müşteri seçili adresini checkout'a bağlama. Ürün/şube/stok son onayı sunucuda yapılmalı; istemci tercihleri yetki değildir.
