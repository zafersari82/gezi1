# VADO 2.8 — Konuma göre keşif kaynak kontrolü

- Temel kaynak: `VADO_2.8_vitrinden_mini_uygulamaya_tam_kaynak.zip` (744 dosya).
- Yeni migrasyon: `0035_branch_discovery_location.sql`. Mevcut coğrafya kataloğunu içe aktarmak gerekir.
- Yeni müşteri deneyimi: isteğe bağlı ve cihazda tutulan il/ilçe seçimi, yerel işletme araması.
- Yeni işletme deneyimi: Şubeler ekranında doğrulanabilir il/ilçe kaydı.
- Yeni API filtreleri: `provinceId`, `districtId`; imleç bölgeye bağlanmıştır.
- RLS: `branches` üzerindeki tenant yalıtımı korunur, genel arama için tek yönlü read model vardır.
- Statik proje kuralları: çalıştırıldı, başarılı (636 dosya).
- TypeScript kaynakları: sözdizimi ayrıştırıldı, hata yok (636 dosya).
- `discovery-search.test.ts` içine ilçe izolasyonu, imleç ve geçersiz ilçe testleri eklendi; PostgreSQL üzerinde **henüz çalıştırılmadı**.
- npm format/lint/typecheck/build, tam Vitest, PostgreSQL, Docker ve gerçek cihaz: **henüz tamamlanmadı**.
- Kullanılmayan görseller ve paketleme dışı dosyalar dışında önceki kaynaklar korunmuştur.
