# VADO 2.8 — Şube ve bölge sipariş yetkileri (geliştirme adayı)

Bu aşama, tek merkezden çok şubeli siparişleri **telefon üzerinden yetki bazlı görme ve yönetmenin** ilk adımıdır. Kurumsal bölge müdürü veya şube müdürünün bütün işletme modüllerindeki tam rolü **henüz uygulanmamıştır**.

## İşletme sahibinin telefonunda

1. **Business → Şubeler**: İlgili şubeyi açar veya bölge seçer.
2. **Sipariş erişimi** altında aktif personel için **Erişim yok / Siparişleri görsün / Siparişleri yönetsin** seçeneklerinden birini seçer.
3. Yetki anında kaydedilir. Personelin müşteri siparişleri yalnızca bağlı şubelerde listelenir. `view` izninde mutasyon düğmeleri görünmez, sunucu da işlemleri reddeder.
4. `manage` izni, izinli şubede sipariş işleme ve ödeme kaydı açar. Sipariş iptali, iade, fiyat, üyelik ve işletme ayarları için genel yönetici hakkı verilmez.
5. Şube bölge değiştirdiğinde bölge görevlisinin erişimi yeni atamaya göre yeniden hesaplanır. Yetki silindiğinde veya personel pasifleştirildiğinde sipariş erişimi sona erer.

## Mimari

- `apps/api/migrations/0031_business_order_access.sql`: işletme kapsamında iki açık izin tablosu, birleşik yabancı anahtarlar, RLS/FORCE RLS ve indeksler.
- `packages/contracts/src/business-management.ts`: açık `none/view/manage` sözleşmesi.
- `region-management.{service,routes}.ts`: izin verme / kaldırma yalnız `owner`; denetim izi.
- `ordering/order-access.ts`: **tek sipariş yetki ilkesi**. Sipariş listesi, imleçli sorgu, detay, mutasyon ve personel olay akışları bu kuralı kullanır.
- `ordering.service.ts`: müşterinin ve mutfak cihazının mevcut özel erişimleri korunur; `staff` artık varsayılan tüm şube siparişlerine erişemez.
- `business-socket.service.ts`: işletmenin bütün olaylarını gönderen soket yalnız sahip/yönetici için; yetkisi sınırlı personel filtreli olayları düzenli sorgular.
- `apps/business/components/order-access-grants.tsx`: mobil öncelikli izin seçimi.
- `apps/business/components/orders-view.tsx`: görüntülemeye açık personele yönetim eylemi sunulmaz. Sunucu tarafında ayrı kontrol zorunludur.
- `apps/api/test/business-order-access.test.ts`: personel, stok izni, kapsam, yönetme, revokasyon, bölge taşıma, çapraz işletme ve soket reddi test senaryoları.

## Dikkat: tam kurumsal yönetici sistemi değil

- `manager` mevcut sistemde **işletme geneli** rolüdür. Birine yalnız bölge sorumluluğu verilecekse `manager` yapmayın; aktif `staff` üyeliğine açık bölge/şube sipariş izni verin.
- Stok bulunurluğu ve sipariş izinleri birbirinden bağımsızdır. İki izin aynı personele ayrı ayrı verilebilir.
- Şube müdürüne rapor, vardiya, personel, masa, iade ve şube düzenleme gibi başka modüllerde kapsamlı yetki **henüz verilmemiştir**. Bu alanların eskiden var olan personel erişimleri ayrıca sıkılaştırılacaktır.
- Kısıtlı personelde Business canlı soket yerine olay sorgulaması kullanılır. Gerçek zamanlı, şube bazlı soket dağıtımı sonraki aşamadır.

## Test ve kabul

Kaynak kuralları ve TypeScript sözdizimi kontrolü ile SQL parçacığı oluşturma kontrolü yapıldı. Tam `tsc`, Vitest, PostgreSQL migrasyonu/RLS, Docker, gerçek telefon ve tüm modül yetki testleri **henüz çalıştırılıp doğrulanmadı**. `npm ci`, migrasyonlar ve tam testler geçmeden üretime alınmamalıdır.
