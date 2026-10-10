# VADO S9 — Keşiften adrese teslimat siparişine (2026-10-10)

**Ana kaynak:** `VADO_2.8_A1_S8_Konuma_Gore_Teslimat_Tam_Kaynak.zip`. Claude'un yeniden düzenlediği A1 temeli ve S1–S8 işleri korunmuştur. Önceki sürümden dosya kopyalanmadı. **S9 geliştirme adayıdır; üretim onayı değildir.**

## Neler eklendi?

1. Keşfet/Arama'daki, kayıtlı adres ile doğrulanmış teslimat sonucundan **işletme kimliği + uygun şube kimliği + adres kimliği** işletmenin profil ekranına aktarılır. GPS veya açık adres rota parametresine yazılmaz.
2. İşletme profilindeki ayrı **“Bu şubeden teslimatla sipariş ver”** eylemi yayımlanmış `restoran` uygulamasının **gerçek appInstanceId**'sini sunucudan bulur. Ardından `POST /v1/shell/:businessId/:appInstanceId/delivery-quote` isteğiyle adres sahipliği, şube/teslimat alanı ve etkin yetenek paketleri yeniden sınanır. Olumsuz yanıtla mini uygulama başlatılmaz.
3. Uygun sonucu doğrulanmış kabuk, `rememberLaunch` ile bellekte tutar. URL'ye yalnız rastgele açılış anahtarı eklenir; ham adres, telefon veya tam teslimat teklifi eklenmez. Mini uygulama yalnız şube ve adres kimliği önerisini alır. Bu kimlikler **sipariş yetkisi değildir**.
4. Restoran mini uygulaması `deliveryLaunchIntent` ile işletme/örnek/şube eşleşmesini ve eski sepet/masa çakışmalarını kontrol eder. Uygun durumda `ordering.getDeliveryQuote` ile güncel adres, teslimat ücreti, asgari tutar ve süre alınır; kabuk `location.addresses` iznini müşteriden ister.
5. Sepet `ordering.openCart` içinde mevcut `fulfilment: "delivery"` ve `addressId` kullanılarak açılır. Ürün ve opsiyonlar mevcut katalog üzerinden gelir; yeni sepet, mesajlaşma veya sipariş motoru yazılmadı. Siparişten hemen önce teklif tekrar sorgulanır; backend checkout ayrıca durum, stok, fiyat, asgari tutar, teslimat alanı ve adres geçerliliğini yeniden denetler.
6. Mevcut sepetin **yanıtına yalnız `addressId` alanı** eklendi (`packages/contracts/src/ordering.ts` ve `ordering.service.ts`); tam adres ve telefon sepete veya sipariş mesajına eklenmedi. Bu, doğru adrese ait eski teslimat sepetinin güvenle geri yüklenmesini sağlar. Önceki sepet başka şube, tür veya adrese aitse otomatik değiştirilmez.
7. Restoran mini uygulamasının paket manifesti `1.1.0` sürümüne yükseltildi ve `location.addresses` yeteneği eklendi. **Paket yeniden derlenip onaylanıp yayımlanmadan**, eski manifestle `getDeliveryQuote` çalışmaz. Bu adım dağıtım için zorunludur; burada dağıtım yapılmadı.

## Önemli iş kuralları

- İl/ilçe keşfi teslimat vaadi değildir. S9 yalnız **adresle eşlenen S8 teslimat sonucundan** başlar. İşletmenin başka genel mini uygulamaları standart açılır, teslimat hakkı iddia etmez.
- Müşteri profil ekranında `deliveryBranchId`/`deliveryAddressId` değerlerini değiştirerek sunucunun yetki denetimini aşamaz. Önce `businessLaunch`, sonra aynı işletme kapsamındaki gerçek `delivery-quote` ve checkout kontrolleri gerekir.
- Mini uygulama **kullanıcının izni olmadan tam adresi alamaz**. İzin reddedilirse adrese teslimat siparişi açılmaz.
- Bekleyen tamamlanmamış checkout anahtarı değiştirilmez; aynı anahtarla yeniden sorgulanır.
- Başka şube, başka adres, masa ve gel-al sepeti sessizce teslimata çevrilmez. Kullanıcının eski sepeti korunur.
- Eski açık teslimat sepetinin `addressId` bilgisi eksikse normal gel-al siparişine dönüştürülmez; sepet bırakılana kadar sipariş engellenir.
- Birden fazla aktif `restoran` örneği varsa mevcut `businessLaunch` bilinçli biçimde belirsiz açılışı reddeder. Rastgele örnek seçilmez.
- Teslimat bölgesi ve fiyat güncellemeleri checkout sırasında yeniden kontrol edilir. Müşteri uygun olmasa siparişin kabul edileceğini varsaymamalıdır.

## Değişiklik alanları

- `apps/mobile/src/features/discovery/discovery-result-row.tsx`, `.../(tabs)/discover.tsx`, `.../search.tsx`: seçim bağlamını taşır.
- `apps/mobile/src/features/discovery/delivery-order-launch.ts`: yayımlanmış örnek + sunucu teslimat teklifli, güvenli açılış.
- `apps/mobile/src/app/(app)/businesses/[id].tsx`: açık teslimat eylemi ve hata yönetimi.
- `miniapps/restaurant/src/delivery-launch-intent.ts`: bağlam ve sepet çakışması saf kuralı.
- `miniapps/restaurant/src/app.tsx`, `.../styles.css`: teslimat sipariş modu, alan bilgisi, güncel quote, doğru sepet tipi.
- `miniapps/restaurant/public/vado.app.json`: `location.addresses` izni ve yeni paket sürümü.
- `packages/contracts/src/ordering.ts` + `apps/api/src/modules/ordering/ordering.service.ts`: yetkili kullanıcıya sepet adres **kimliği**.
- `miniapps/restaurant/test/delivery-launch-intent.test.ts`, `apps/mobile/test/discovery-delivery-launch.test.ts` ve `apps/api/test/delivery.test.ts`: regresyon senaryoları.

## Gerçek kabul için zorunlu kontrol listesi

1. `npm ci`, `npm run check` (lint, typecheck, Vitest, build) **tüm workspaces**. S9'un değiştirdiği paket manifesti de doğrulanmalı.
2. Docker/PostgreSQL üzerinde temiz kurulum, A1 `0022–0027` migrasyon uyumluluğu ve gerçek RLS. S9 **yeni migration gerektirmez**.
3. `delivery-quote` testleri: yalnız kendi adresi; başka müşterinin adresi 404, kapalı/başka şube, etkin olmayan servis bölgesi, güncellenen ücret ve iptal edilen adresler.
4. Yeni `addressId` alanının yalnız yetkili müşterinin kendi sepet API yanıtında döndüğünü, platform başka kullanıcıya sızmadığını ve idempotency yanıtlarının hâlâ kişisel adres/telefon taşımadığını test et.
5. `restoran` mini uygulamasını **1.1.0 izin setiyle paketleyip yayımla**; yeni `location.addresses` için açık kullanıcı izni/ret senaryosunu Android/iOS'ta kontrol et. Eski paket kuruluysa uygulama özellik eşleştirmesini test et.
6. Hatay/Belen gibi mahalle filtresinden şube seç → doğru restoran/şube/adres → güncel ürün → seçenek → teslimat ücreti → sepet → checkout → işletme sipariş paneli. Testi çok şubeli işletmede de tekrarla.
7. Aynı hesapta farklı açık gel-al/masa/şube/teslimat sepetleri, kapanan şube, fiyat/değişmiş servis alanı, minimum tutar ve yanlış adres ile fail-closed akışını doğrula.
8. Ağ kesintisi, tekrar açılış ve eski yetki/izin paketine geçiş halinde kullanıcıya yanlış teslimat vaadi gösterilmediğini kontrol et.

## Kontrol kanıtı ve sınırlar

- Denendi (2.8.0-alpha.5, PostgreSQL 16, `vado_app`/`vado_platform` rolleriyle RLS altında): `npm run check`; teslimat açılış niyeti testleri (`miniapps/shared/test/delivery-launch-intent.test.ts`); API teslimat ve keşif testleri.
- Denenmedi: telefonda Keşfet → restoran teslimat sepeti akışı; yeni `restoran` paketinin yayımlanması.

**Sonraki hedef:** Mağaza motoruna yayma S10'da yapıldı. Kurye akışının teslimat uygunluğuyla birleşmesi 2.8 planındadır (A3, bkz. [PLAN_2.8.md](PLAN_2.8.md)).
