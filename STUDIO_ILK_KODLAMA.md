# VADO Business Studio — ilk çalışan bağlantı (geliştirme adayı)

Bu paket VADO 2.8.0-alpha.3 kaynaklarının üzerine kurulmuştur; **tam Studio veya
üretime hazır sürüm değildir**. Tek işletme kaynağı ve tek mini uygulama motoru yaklaşımı korunur.

## Bu pakette gerçekten kodlananlar

1. Ortak katalogda 3 yemek/restoran ve 3 berber/salon **başlangıç taslağı** tanımı.
   Bunlar henüz tam işlevli altı ayrı mağaza tasarımı değildir.
2. VADO mobil işletme başvurusunda sektör → şablon → işletme bilgileri adımları.
3. `createBusinessBodySchema` ile sektör/şablon uyumluluğu doğrulaması.
4. `POST /v1/businesses` işleminde işletme ve şablon taslağının atomik kaydı.
5. `0024_business_studio.sql` ile işletmeden ayrılmış, RLS korumalı taslak tablosu.
6. Üyelikten yetkilendirilmiş `GET /v1/business/:businessId/studio` okuması.
7. VADO Business Ayarlar ekranında kayıtlı taslağın adı ve durumu.
8. Sözleşme birim testi ve API kapsam/kalıcılık regresyon testleri (kaynağa eklendi).

## Dürüst doğrulama sınırları

- Kod kuralları ve TypeScript sözdizimi kontrol edilebilir.
- `npm run check`, derleme, Vitest ve PostgreSQL tabanlı testler bu ortamda eksik npm
  bağımlılıkları nedeniyle çalıştırılmamıştır.
- Yeni migration henüz gerçek PostgreSQL üzerinde denenmedi.
- Başlangıç taslağı **otomatik yayınlama yapmaz**; onay/paket süreci değiştirilmedi.
- Tasarım editörü, ürün fotoğrafından menü okuma, sürükle-bırak sayfa düzenleme,
  kurumsal organizasyon ağacı, çok şubeli toplu işlemler ve yapay zekâ asistanı
  henüz geliştirilmedi.
- Beauty başlangıç taslaklarının canlı randevu rezervasyon motoru 2.9 kapsamındadır.

## Son kabulde izlenecek gerçek kullanım

1. Migration 0024 dahil veritabanını kur.
2. Mobil uygulamada Yemek → Hızlı Servis seç, işletme adı/şehir gir, başvur.
3. İşletme sahibinin VADO Business panelinde işletmesini seçtiğini kontrol et.
4. Ayarlar'da `Hızlı Servis · Taslak` bilgisini doğrula.
5. Bir başka hesapla GET studio erişiminin 403 olduğunu, doğrudan SQL'de RLS'nin
   yabancı mağazayı gizlediğini sınayarak testleri çalıştır.
6. Beauty şablonuyla food kaydı yapılmasının reddedildiğini doğrula.

## Sonraki gerçek geliştirme dilimi

Sıradaki aşama seçilen taslağın işletmenin mini uygulama görünümüne uygulanması,
telefondan ürün/kapak/renk düzenleme, gerçek önizleme ve güvenli yayın akışıdır.
Bu aşamaya kadar seçim yalnızca kalıcı, yalıtılmış bir **taslaktır**.
