# VADO 2.8 — Mobil performans ve personel erişimi (geliştirme adayı)

## İşletme sahibi ve bölge/şube sorumlusu

- **Business → Performans:** Son 7 veya 30 günde yalnızca yetkili şubelerin sipariş sayısı, tamamlanan sipariş sayısı, iptal/ret ve diğer durumları; tamamlanan siparişlerin kayıtlı tutarı gösterilir.
- Toplam tutarlar kuruş düzeyinde metin olarak API'den gelir, arayüzde `BigInt` ile toplanır; JavaScript büyük sayı hassasiyeti nedeniyle değer kaybetmez.
- **Önemli:** Tamamlanan siparişlerin toplamı tahsil edilmiş ciro, ödeme, gelir ya da kâr göstergesi değildir. İadeler ve tahsilatlar bu raporda hesaplanmaz.
- Personel `staff` rolündeyse aynı `orderAccess` SQL kuralı sipariş listesine ve rapora uygulanır. Bölge taşıma ve yetki iptali anında görünürlük değişir. `manager` rolü hâlâ tüm işletme geneline erişir; bölge müdürüne verilemez.
- **Business → Ekibim (yalnız sahip):** Var olan işletme üyelerinin adını, rolünü ve durumunu görür; staff/manager üyelerinin işletme erişimini onayla-kapat/aç düğmesiyle değiştirir. Bu işlem yeni personel daveti değildir. Erişim kapatılırken eski şube/bölge izinleri kaldırılır. Kurye üyelikleri bu ekranda değiştirilmez.
- Üyelik değişiklikleri aynı işlemin içinde `business.member_changed` denetim kaydına yazılır.

## Mimari

- Ortak sözleşme `packages/contracts/src/ordering.ts`: `branchPerformanceQuerySchema`, `branchPerformanceSchema`.
- İşletmeye ait sipariş motoru `apps/api/src/modules/ordering/ordering.service.ts`: `branchPerformance` işlevi. Yeni rapor motoru, veri tablosu veya gereksiz servis yok.
- `apps/api/src/modules/ordering/ordering.routes.ts`: GET `/v1/business/:businessId/orders/performance?days=7|30`.
- `apps/api/src/modules/business-management/business-management.service.ts`: mevcut üyelik okuma ve güncelleme servisinin ad gösterimi ile denetim izi.
- `apps/business/components/performance-view.tsx`, `team-view.tsx` ve `/performance`, `/team` sayfaları.
- Web API vekili yalnız açık izin listesinde `orders/performance` (GET, days=...), `members` (GET/PUT) yollarını kabul eder. Sunucuda işletme üyeliği ve rol her istekte yeniden doğrulanır.

## Testler / sınırlar

- `apps/api/test/business-performance.test.ts`: izin verilmemiş personel; direkt ve bölge izni; yetki iptali; şube bölge değişimi; başka işletme; geçersiz gün; takımda yetkisiz güncelleme ve üyelik iptali.
- `apps/business/test/business-input.test.ts`: izin listesi, HTTP yöntemi ve başka işletme parametresi engeli.
- **Çalıştırılan:** proje konvansiyon taraması, TypeScript sözdizimi taraması ve ZIP bütünlüğü. **Çalıştırılmayan:** Vitest / npm tam tip denetimi, gerçek PostgreSQL, uygulama derlemesi, Docker ve cihaz testleri.
- `npm run typecheck -w @vado/api` TS2688 (`@types/node` bulunamadı) ile durdu. Bu, kodun derlendiği veya regresyon testlerinin geçtiği anlamına gelmez.
- Sonraki aşamalar: personel daveti ve davet onayı; vardiya; raporlarda tahsilat/iade hesaplama; bölge raporları ve şube bazlı sipariş dışı operasyon yetkileri.
