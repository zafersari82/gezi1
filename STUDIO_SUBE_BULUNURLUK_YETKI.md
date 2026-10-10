# VADO 2.8 — Çok şubeli ürün bulunurluğu ve personel yetkisi

## İşletme sahibinin telefondaki akışı

1. **Ürünler → Şube stok durumu** sekmesinden yetkili olduğu şubeyi seçer.
2. Ürün adını arar, **Satışta** / **Tükendi** durumunu işaretler.
3. En fazla 100 ürün değişikliğini tek işlemde kaydeder. Değişiklikler sadece seçilen şubeye ve yeni siparişlere yansır.
4. **Şubeler** ekranında şubeyi açıp ilgili personel için **Şube personel yetkisi** kutusunu işaretleyebilir (yalnız işletme sahibi).
5. Yetkilendirilen personel aynı **Şube stok durumu** ekranından sadece atanmış şubesini değiştirebilir.

## Kaynak mimari

- **Ortak sözleşmeler:** `packages/contracts/src/restaurant.ts` (toplu bulunurluk), `packages/contracts/src/business-management.ts` (şube görevlisi yetkisi).
- **API:** `apps/api/src/modules/business-management/branch-operations.routes.ts` ve `branch-operations.service.ts`.
- **Veritabanı:** `apps/api/migrations/0029_branch_availability_delegation.sql`. `branch_availability_grants` tablolarında bileşik işletme/şube/personel FK, RLS ve FORCE RLS mevcuttur.
- **Ekranlar:** `apps/business/components/branch-availability-matrix.tsx`, `branch-availability-grants.tsx`; mevcut Ürünler ve Şubeler ekranlarına bütünleşik.
- **Vekil:** `apps/business/lib/request-policy.ts` yalnız bu API uçlarına açık izinler tanımlar.
- **Denetim kaydı:** Yetki değişimi ve toplu bulunurluk güncellemesi mevcut `audit_log` ile kaydedilir.
- **Üyelik yaşam döngüsü:** Personel pasifleştirilirse veya rolü değişirse şube ürün yetkisi kaldırılır; yeniden etkinleştirme eski yetkiyi geri getirmez.

## Güvenlik ve tutarlılık

- Sadece sahibi/yöneticisi bütün şubelerde ürün bulunurluğu düzenleyebilir.
- Personel ataması yalnız işletme sahibi tarafından, mevcut aktif personel için yapılır.
- Atanmış çalışan **yalnız** ürün bulunurluğu işlemleriyle sınırlıdır; fiyat, işletme, şube ayarı veya üyelik yetkileri genişletilmez.
- Şube ve ürünler işletmeye ait olmak zorundadır. Şube satırı, sonra ürün satırları sabit sırayla kilitlenir; beklenen sürüm uyuşmazsa değişikliklerin tamamı geri alınır.
- Sunucu istemciden işletme kimliği kabul etmez; güvenilir oturum kapsamını kullanır.
- Mevcut katalog ve ürünün genel `active`/`available` durumu değişmez. Sadece `catalog_branch_availability` üzerinde şube durumu saklanır.

## Bilinçli kapsam sınırı

Bu adım, **şube bazlı genel kurumsal rol yönetimi** değildir. Mevcut **manager** rolü hâlâ işletme genelinde yetkilidir. Tam şube müdürü rolü, sipariş/rapor/şube yönetimi dahil bütün API'lerde şube kapsamı uygulandığında tamamlanacaktır; bu dosyanın kapsamı **yalnız ürün bulunurluğu delegasyonu**dur. Merkezi stok miktarı, depo hareketleri ve otomatik envanter düşümü uygulanmadı: "Tükendi" satışa açık/kapalı işaretidir. Büyük kataloglar için sunucu sayfalaması ve CSV/ERP aktarımı sonraki geliştirmedir.

## Kabul kontrolleri

`npm ci && npm run check`, PostgreSQL migration/RLS, çoklu cihaz yarışması, kullanıcı rol düşürme, yabancı şube ve ürün denemeleri, şubeye özgü sipariş hesaplama ve fiziksel telefon üzerinde dokunmatik kullanılabilirlik. Bu paket yalnız kod ve statik kaynak kontrollerinden geçmiştir; Docker/PostgreSQL testleri son kabulde yapılacaktır.
