# M0 — ekran kabul kaydı

**Kaynak:** `VADO_2.8.0-alpha.6.zip` içindeki doğrulanmış A2-3 kodu.
**Durum:** M0 kaynak düzeyinde düzenlendi; tam kabul yapılmadı. Sürüm `2.8.0-alpha.6` olarak kaldı.

## Düzenlemeler

1. **Dar ekran mini uygulamalar:** restoran menüsünün taşan sütunları daraltıldı; 560 px altında tek sütun kullanılıyor. Mağaza filtreleri de en çok ekran genişliğine sığıyor.
2. **Operasyon tarihleri ve numaraları:** Business sipariş, mutfak, iade, değerlendirme ve masa görünümleri kısa numara kullanıyor; varsayılan saat dilimi aynıysa `Europe/Istanbul` gösterilmiyor; farklıysa şehir adı çıkıyor. Tam sipariş kimliği API ve veritabanında değişmedi.
3. **Telefon menüsü:** en çok 4 günlük iş ve bir `Diğer` menüsü gösteriliyor. İşletmenin kategorisi üyelik yanıtından alınıyor; randevu sektörlerinde alakasız sipariş sekmesi gizleniyor, mutfak/masa gibi işlevler etkin bloklardan geliyor.
4. **Sipariş eylemleri:** iptal düğmesinin eylem dili düzeltildi; tahsilat kabulden sonra gösteriliyor; iade özelliği açık sipariş doğrudan iptal yerine talep akışına yönlendiriliyor.
5. **Tutarlar:** Business telefon kartlarında tutarın bölünmesi engellendi.
6. **Randevu ekranı:** ortak uygulama tipografi düzeyleri kullanılıyor.
7. **Açılış hatası ve örnek veri:** mobil ve web mini uygulama çerçevesinde kalıcı hata görünümü ve açık yeniden deneme var; örnek berber için tekrar çalıştırılabilir uygulama örneği kaydı ekleniyor.

## Bu ortamda gerçekten çalıştırılanlar

- `npm run conventions`: proje taraması ve üç negatif mimari test başarılı.
- TypeScript/TSX kaynaklarının bağımlılıksız sözdizimi kontrolü: sözdizimi hatası yok.
- Chromium üzerinde **stil fikstürü**: restoran ve mağaza CSS'i 360/390 px'de (4 durum) ve Business tutar/alt menü CSS'i 360/390 px'de (2 durum) yatay taşma olmadan ölçüldü. Business tutarları tek satırda ve alt menü 5 öğeyle sınırlıydı. Bu **gerçek uygulama oturumu veya gerçek menü yükleme testi değildir**.
- Mobil menü saf işlevi bağımsız Node.js denetiminde 5 koşulu karşıladı.

## Yazıldı fakat çalıştırılamadı

- Business: `m0-presentation`, `m0-order-actions`, `m0-mobile-style` testleri.
- Mobile: `m0-booking-and-frame` kaynak koruma testi.
- API: `m0-seed` kaynak koruma testi; gerçek PostgreSQL örnek veri testi henüz yok.
- Mini uygulamalar: restoran/mağaza `m0-responsive` CSS regresyon testleri.
- `npm ci --offline`: `zxing-wasm@3.1.3` önbellekte olmadığı için başarısız. Çevrimiçi kurulum tamamlanmadı.
- `npm run check`: Prettier bulunamadığından ilk aşamada durdu. Tam lint, tip denetimi, testler ve üretim derlemesi yapılmadı.
- Gerçek API + PostgreSQL örnek veri, 360/390 px çalışan mini uygulama, telefon WebView, ekran okuyucu ve dağıtıma yönelik testler yapılmadı.

## M0 kabul kapısı

1. Son ZIP'i boş klasörde açıp **yalnız kendi** `package-lock.json` dosyasıyla `npm ci` kur.
2. `npm run check` baştan sona geçir. Hata çıkarsa kodu doğrudan kaynakta düzelt; geçici yama uygulama.
3. 360 ve 390 px gerçek restoran/mağaza ekranlarında `document.documentElement.scrollWidth <= innerWidth` ve sağ kenarlar <= ekran genişliği olsun; menü yüklendikten sonra kontrol et.
4. PostgreSQL'e `npm run db:seed` ile veri yükle: Kadıköy Berber mini uygulama örneği oluşturulmuş ve müşteri açılışına uygun olmalı; komutu ikinci kez çalıştırınca tek örnek kalmalı.
5. 390 px Business sipariş, mutfak, randevu, ödeme ve iade akışlarını gerçek tarayıcıyla gez; MiniAppFrame başarısız açılışını mobil cihazda gözle.
6. Ancak bütün kapılar geçince sürümleri birlikte `2.8.0-alpha.7` yap ve kilit dosyasını `npm install --package-lock-only` ile yenile.
