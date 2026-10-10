# VADO 2.8 — Müşteri Keşfi ve Yayımlanan İşletme Vitrini

Bu aşama son kaynak paketindeki mevcut **VADO Search** ve **Business Studio** üzerine kuruludur. Yeni arama veya ayrı bir mağaza motoru eklenmedi.

## Müşteri ana ekranı

- Keşfet sayfası artık `/v1/businesses` üzerinden ilk 200 işletmeyi indirmez.
- `/v1/discovery/search?kind=business&limit=6` ve `kind=miniapp` sorguları, ana ekrana **iki ayrı, küçük önizleme listesi** sağlar.
- Önizleme listeleri ücretli reklam ya da puana göre sıralanmış “öne çıkan” mağazalar değildir. Sunucunun mevcut kararlı sıralaması gösterilir.
- Yemek, alışveriş, güzellik, ulaşım, eğitim, sağlık sektörlerine tek dokunuşla sunucu aramasında geçilir. Diğer sektörler arama filtresinde bulunur.
- Keşfet ve Arama aynı `DiscoveryResultRow` ve `discoveryItemKey` bileşenlerini kullanır; işletme ve mini uygulama doğru ve mevcut açılış yollarına yönlenir.
- Bağımsız yükleme, yenileme ve hata durumları vardır. Bir katalog geçici hata verse de diğerinin sonuçları korunur.

## Gerçek müşteri vitrini

- `/v1/businesses/:id` yalnız etkin, doğrulanmış işletmeler için yanıt verir.
- `BusinessDetail.storefront` değeri, henüz yayın yapılmamışsa `null` olur.
- Yayımlanmış tasarım varsa müşteri, **logo, kapak, başlık, tanıtım sloganı ve tema rengini** görebilir.
- Studio taslakları, sürüm bilgileri ve medya kimlikleri müşteri profilinin yanıtına **eklenmez**. `publicStorefrontSchema` yayınlanan tasarımın yalnızca gerekli alanlarını seçer.
- `business_studio` RLS koruması kaldırılmadı. Profili listeleme koşulu veritabanı işleminde yeniden denetlenir; geçici işletme kapsamı yalnız işlem süresince geçerlidir.
- Mini uygulama açılışı daha önceki denetlenmiş `miniapps/[id]` rotasını kullanır. İşletmenin yayında mini uygulaması yoksa boş durum gösterilir.

## Değişen dosyalar

- `packages/contracts/src/businesses.ts`
- `apps/api/src/modules/businesses/businesses.service.ts`
- `apps/mobile/src/app/(app)/(tabs)/discover.tsx`
- `apps/mobile/src/app/(app)/search.tsx`
- `apps/mobile/src/app/(app)/businesses/[id].tsx`
- `apps/mobile/src/features/discovery/discovery-result-row.tsx` (yeni)
- `apps/api/test/studio-publication.test.ts`
- `apps/api/test/studio-media.test.ts`
- `apps/api/test/discovery-search.test.ts`

## Devam eden doğrulama borcu

- Gerçek PostgreSQL'de Studio RLS, yayın ve medya bağlantı testleri.
- Tam npm bağımlılık kurulumu sonrası `npm run check`.
- iOS/Android cihazlarda kapak görseli, uzun isimler, erişilebilirlik, QR ile mini uygulama açma ve ağ kesintisi senaryoları.
- Büyük kataloglarda Keşfet yenileme ve arama performansı.

**Not:** Kod sözdizimi ve proje kuralları kontrolünden geçmesi; derleme, migrasyon, cihaz veya uçtan uca kabulün tamamlandığı anlamına gelmez.
