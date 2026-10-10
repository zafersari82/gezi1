# S6 — Sohbette paylaşılan üründen mevcut restoran siparişine geçiş

## Kapsam ve karar

S5 ürün paylaşımı korunur. Ürün kartına yeni **"Seçenekleri belirle ve siparişe devam et"** eylemi eklendi. Bu işlem **yeni bir sipariş veya sepet motoru kurmaz**; var olan `restoran` mini uygulamasını sunucu tarafından doğrulanmış işletme örneğiyle açar. Oradaki mevcut ürün seçenekleri, sepet ve `checkout` kullanılır. Sipariş kullanıcının açık onayı olmadan oluşturulmaz.

Bu geliştirme şimdilik **VADO Restoran (gel-al / mevcut masa oturumu)** akışını destekler; market ve diğer sektörleri, adrese teslimat seçimi ve teslimat bölgesi doğrulamasını tamamlandı saymayın.

## Akış ve güven sınırları

1. `/products/:businessId/:branchId/:itemId` açılır; paylaşımdaki fiyat ve stok kaynak değildir.
2. Kullanıcı eyleme dokunduğunda `share-products/:itemId` yeniden çağrılır. Ürün aktif, şubede sunuluyor ve satış fiyatı mevcut olmalıdır.
3. İşletmenin herkese açık mini uygulama listesinden yalnızca `id=restoran` ve `ordering.basic` yeteneğine sahip uygulama seçilir. Başka bir mini uygulama bu protokolle rastgele açılamaz.
4. `/v1/businesses/:businessId/miniapps/restoran/launch` uç noktası **appInstanceId** üretir/doğrular. Sohbetten veya ürün URL'sinden appInstanceId alınmaz.
5. Bellekte tutulan açılış parametrelerine yalnız `product_branch` ve `product_item` eklenir. Bunlar kullanıcıya ürün önerisidir; işletme yetkisi veya sepet komutu değildir. Mevcut `businessId` ve `appInstanceId` aynen korunur.
6. Restoran mini uygulaması açılışta bağlamı `ordering.getRestaurant` ile yeniden okur. İşletme, mini uygulama örneği, şube ve UUID alanları doğrulanır. Farklı şubede açık sepet/masa varsa **sessizce değiştirilmez** ve uyarı gösterilir.
7. `ordering.getCatalog` ile **seçilen şubenin güncel menüsü** alınır. Ürün kullanılabilir ve fiyatı mevcutsa mevcut `ProductOptions` açılır. Kullanıcı varyant, adet ve not seçer.
8. Sepet ve sipariş motoru (`ordering.openCart`, `replaceCart`, `checkout`) aynen kullanılır. Sunucu fiyat, stok/bulunurluk ve sürümü ayrıca kontrol eder. Eski fiyat teyit gerektiriyorsa checkout mevcut `cart_changed` yolunu kullanır.

### Düzenlenen / yeni kaynaklar

- `apps/mobile/src/app/(app)/products/[businessId]/[branchId]/[itemId].tsx` — ürün detayında açık kullanıcı eylemi, canlı ön doğrulama ve restoran açılışı.
- `apps/mobile/src/features/sharing/order-from-product.ts` — tek restoran uygulamasına sınırlı eşleştirme.
- `miniapps/restaurant/src/shared-product-intent.ts` — açılış önerisinin mevcut işletme/sepet/masa bağlamına göre doğrulanması.
- `miniapps/restaurant/src/app.tsx` — güncel şube kataloğundan ürünü seçme; kapalı şube/checkout sırasında eklemeyi engelleme.
- `apps/mobile/test/ordering-from-shared-product.test.ts`, `miniapps/restaurant/test/shared-product-intent.test.ts` — yeni Vitest test senaryoları.

Yeni tablo, migration, ödeme akışı veya chat veri türü oluşturulmadı. `package-lock.json` değiştirilmedi.

## Özellikle tamamlanmayanlar

- Adrese teslimat akışı, adres seçimi, servis alanı kontrolü, kurye eşleştirmesi ve gerçek teslimat ücretinin siparişe yansıması **S6 kapsamında tamamlanmadı**. Restoran mevcut gel-al/masa akışını kullanır.
- Market/berber gibi farklı mini uygulamaların bu ürün açılış protokolüyle sipariş başlatması henüz yok.
- Gerçek PostgreSQL, Vitest, Expo web/Android/iOS çalıştırması ve tam workspace tip kontrolü bu ortamda bağımlılık eksikliğinden dolayı doğrulanamadı.

## Son kabul senaryoları

- Sohbet ürün kartı → restoran uygulaması → doğru şube → güncel ürün → seçenek onayı → sepet → sipariş işlemi.
- Mesaj gönderildikten sonra ürün fiyatı değişirse müşteriye **güncel** fiyat gösterilir, checkout tekrar doğrular.
- Ürün/şube devre dışı bırakıldığında veya işletme doğrulaması kaldırıldığında işlem güvenli biçimde durur.
- Yanlış business/appInstance, hatalı UUID, başka işletmenin ürünü, farklı şubedeki açık sepet/masa oturumu geçmez.
- Aynı ürün, konuşma veya uygulama tekrar açıldığında istem dışı çift sipariş oluşmaz.
- Açılış sırasında internet kesintisi, geçici 401/403/404, kapanan uygulama/şube durumlarında anlaşılır hata görülür.
- Normal sohbet, Business Chat, S3 QR ve S4 kartları, S5 ürün paylaşımı bozulmaz.

**Geliştirme adayıdır.** Claude'un son kabulünde özellikle mevcut restoran `cart_changed`, idempotency ve PostgreSQL şube bulunurluğu işlevleri uçtan uca sınanmalıdır.
