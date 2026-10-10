# VADO 2.8 — Merkez, bölge, şube düzeninin ilk kodlama aşaması

Bu aşama kurumsal organizasyonun **temelini** kurar. Genel müdür/bölge müdürü/şube müdürü adına bütün sistem yetkileri açılmış değildir; **bölge kapsamlı ürün bulunurluğu** yetkisiyle sınırlı, güvenli bir başlangıçtır.

## İşletme sahibinin telefonundaki kullanım

1. **VADO Business → Şubeler → Bölge yönetimi** alanında Marmara, Ege gibi bölgeler ekler.
2. Bölge ismini değiştirebilir; kayıtta sürüm uyuşmazlığı başka cihazın değişikliğini ezmeyi engeller.
3. Her şubeyi bir bölgeye bağlar veya bölgeden çıkarır. Bir şube aynı anda en fazla bir bölgeye bağlıdır.
4. İlgili bölgeye **ürün sorumlusu** olarak aktif işletme personelini atar.
5. Personel telefondaki **Ürünler → Şube stok durumu** ekranından kendine atanmış bölgedeki şubelerde ürünleri satışta/tükendi olarak değiştirebilir.
6. Şube başka bölgeye aktarılınca veya yetki kaldırılınca önceki bölge görevlisinin erişimi anında yeni sorgularda sona erer. Personel pasifleştirildiğinde tüm bölge görevlendirmeleri silinir.

## Güvenlik sınırları

- Bölgeleri yalnız **işletme sahibi** oluşturur, değiştirir, şubelere bağlar ve bölge ürün sorumlularını atar.
- **İşletme yöneticisi** bölgeleri ve atamaları görebilir, ancak bölge yetkisi atayamaz.
- **Personel** bölgeler listesine, atamalara veya görevli ayarlarına erişemez; şube listesinde yalnızca doğrudan ya da bölge üzerinden verilmiş yetkili şubeleri görür.
- Bölge ürün sorumlusu **fiyat, personel, yayınlama, genel mağaza yönetimi, tüm siparişler veya şirketin diğer şubeleri üzerinde yönetici yetkisi kazanmaz**.
- Tüm sorgularda sunucunun doğruladığı `TenantScope` kullanılır; istemciden işletme kimliği alınmaz.
- Yeni üç tabloda bileşik yabancı anahtarlar, `ENABLE ROW LEVEL SECURITY` ve `FORCE ROW LEVEL SECURITY` vardır.
- Şube yeniden atamalarında şube satırı kilitlenir ve `expectedRegionId` karşılaştırılır. Bölge adlarında sürüm kontrolü uygulanır.
- Doğrudan şube yetkileri önceki sürümde olduğu gibi çalışmaya devam eder.
- Tüm bölge ve görevlendirme değişiklikleri denetim günlüğüne yazılır.

## Kaynaklar

- `apps/api/migrations/0030_business_regions.sql` — bölge, şube eşlemesi, bölge görevlendirmesi.
- `packages/contracts/src/business-management.ts` — bölge giriş/çıkış sözleşmeleri.
- `apps/api/src/modules/business-management/region-management.service.ts` — atomik yönetim işlemleri ve iş kuralı.
- `apps/api/src/modules/business-management/region-management.routes.ts` — korumalı API uçları.
- `apps/api/src/modules/business-management/branch-access.ts` — **tek** şube kapsamı kontrolü; eski doğrudan yetki ve yeni bölge yetkisi birlikte.
- `apps/business/components/business-regions-view.tsx` — telefon öncelikli yönetim.
- `apps/api/test/business-regions.test.ts` — bölge ataması, şube veri yalıtımı, yetki kaybı, fiyat reddi, eski sürüm çatışması ve personel yaşam döngüsü senaryoları.

## Tamamlanmayan kurumsal kapsam

Genel müdür ile bölge/şube müdürünün tüm sipariş, rapor, kampanya ve personel yönetimi **henüz bölge bazlı yetkilendirilmedi**. Bu altyapıda işletme sahibi ve mevcut `manager` rolü işletme genelinde yetkilidir; bölge ürün sorumlusu ise yalnız ürün bulunurluğunu yönetebilir. `manager` rolü bölge müdürü olarak kullanılmamalıdır. Tam kurumsal yetki hiyerarşisi ancak diğer modüllerin tamamına şube kapsamı eklenip sınır testleri çalıştırıldıktan sonra açılacaktır.

## Kabul kontrolü

Kod kuralları ve TypeScript sözdizimi taraması yapıldı. npm paketleri bu ortamda kurulamadığından tam TypeScript tip kontrolü/ESLint/Prettier, PostgreSQL migrasyonu, entegrasyon testleri ve gerçek telefon testleri henüz doğrulanmadı. Docker/PostgreSQL kabulünü, planlandığı gibi, geliştirmelerin tamamına saklıyoruz.

## Sonraki kaynak aşamasında gelen bağımsız sipariş yetkileri

`0031_business_order_access.sql` ile ayrı **sipariş görüntüleme/işlem** yetkileri getirildi. Bu, bu dosyadaki bölge **ürün sorumlusu** hakkını değiştirmez ve otomatik işletme yöneticisi yetkisi vermez. Ayrıntılar `STUDIO_KURUMSAL_SIPARIS_YETKILERI.md` içinde.
