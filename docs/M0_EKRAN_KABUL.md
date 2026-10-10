# M0 — ekran kabul kaydı

**Sürüm:** 2.8.0-alpha.7. **Yöntem:** geliştirme veritabanı sıfırdan kuruldu, `npm run db:seed`
ve örnek bir restoran (Moda Ocakbaşı: menü, seçenekler, masalar, mutfak paketi) ile market (Moda
Şarküteri: iade ve tekrar sipariş paketleri) API servisleri üzerinden eklendi. API, VADO Business,
mobil uygulamanın web önizlemesi ve üç mini uygulama çalıştırıldı; ekranlar Playwright ile gerçek
Chromium'da 390×844 (ayrıca 360×780) boyutunda gezildi ve çekildi.

| #   | Kusur                                         | Sonuç                                                                                                                                                                                                              |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Restoran mini uygulaması sağdan taşıyor       | 360 ve 390 px'te `scrollWidth` = ekran genişliği; kaydırılan kategori şeridi dışında taşan öğe yok. Market de aynı.                                                                                                |
| 2   | Ham "Europe/Istanbul", uzun sipariş numarası  | Business siparişleri, mutfak ve restoran teslim zamanı listesinde dilim adı yok; numara "#696D".                                                                                                                   |
| 3   | Business alt menüsü                           | Restoran: Siparişler, Mutfak, Masalar, Mesajlar, Diğer. Berber: Randevular, Mesajlar, Şubeler, Ayarlar, Diğer.                                                                                                     |
| 4   | "İptal edildi" düğmesi, erken tahsilat kutusu | Yeni siparişte düğmeler "Kabul et, Reddet, İptal et"; tahsilat kutusu yok. Kabulden sonra tahsilat kutusu görünür.                                                                                                 |
| 5   | Tutar kartı iki satıra bölünüyor              | "₺1.600,00" tek satırda.                                                                                                                                                                                           |
| 6   | Randevu ekranı başlıkları                     | Uygulamanın başlık ölçeği. Küçük pürüz: "Randevu al" üst çubukta ve sayfa başlığında iki kez yazıyor.                                                                                                              |
| 7   | Açılış hatası kayboluyor; berber açılmıyordu  | Berber mini uygulaması açılıyor. Uygulama örneği kapatılınca hata ("İşletme bulunamadı") satırın altında kalıcı ve yeniden denenebilir. Örnek veri ikinci kez çalıştırılınca berberde tek uygulama örneği kalıyor. |

**Denenmedi:** gerçek telefon (WebView, iOS/Android), ekran okuyucu, büyük yazı ölçeği.
