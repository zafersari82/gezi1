# VADO 2.8 — Konuma göre keşif (geliştirme adayı)

## Kullanıcı akışı

- Keşfet > Konum seç: Türkiye il/ilçe kataloğundan seçim yapılır. GPS izni verilmesi zorunlu değildir.
- Yalnız il seçilirse o ildeki işletmeler; ilçe de seçilirse yalnız o ilçede **konumu doğrulanmış, etkin şubesi bulunan** işletmeler listelenir.
- Konum seçimi cihazda saklanır; tam konum veya kullanıcı koordinatı arama API'sine gönderilmez.
- Mini uygulamalar ayrı "Türkiye geneli" alanında kalır; fiziksel yakınlık veya teslimat uygunluğu iddiası taşımaz.
- Konum seçilmezse Türkiye geneli arama yapılabilir. Konum değişince sunucu imleci yenilenir.

## İşletme yönetimi

- Business > Şubeler ekranında şube için il ve ilçe seçilir; eski serbest adres alanı korunur.
- Eski şubelerin adres metinlerinden konum **tahmin edilmez**. Yeni alanları işletme sahibi doldurur.
- `0035_branch_discovery_location.sql` zorunludur. Türkiye coğrafya kataloğu henüz aktarılmadıysa proje `db:location` işlemiyle hazırlanır.
- Kapsam alanları `branches` üzerinde saklanır (RLS); genel keşifte yalnız il/ilçe kimliklerini içeren, trigger ile güncellenen sınırlı `branch_discovery_locations` okuma izdüşümü kullanılır. Uygulama rollerinin doğrudan değiştirme yetkisi yoktur.
- `branches` ana kaynaktır; aktiflik/konum değişikliği kamusal izdüşümü otomatik günceller.

## Bu aşamanın sınırları

- İlçede şubenin bulunması, o adrese yemek teslimatı yapılacağı anlamına gelmez.
- Restoran teslimat uygunluğunu mevcut `location_service_areas` ve mahalle bazlı dağıtım bölgeleri belirler; bu modül henüz keşif sonuçları üzerinde teslimat rozeti göstermiyor.
- Kargo ile ülke geneline satış, mobil hizmet yarıçapı, trafik süresi ve GPS ile otomatik ilçe çözümlemesi bu aşamada yoktur.
- Kurumsal işletmeler için ülke çapı uygunluk beyanı doğrulanmadan otomatik yerel sonuç olarak gösterilmez.
- Tam PostgreSQL, RLS, mobil cihaz ve uygulama kabul testleri **henüz çalıştırılmadı**.
