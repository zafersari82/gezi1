# VADO Keşfet — Birleşik Mobil Arama

## Kullanıcı deneyimi

Keşfet sekmesinde hızlı arama, sektör kısayolları, işletme listesine ve mini uygulama listesine geçiş bulunur. Keşfet girişindeki arama düğmesi `/search` ekranını açar.

- `Tümü`, `İşletmeler`, `Mini uygulamalar` sonuç türü filtreleri.
- Yayında bulunan sektörler için kategori filtresi. Tek sektör olsa bile bir filtre seçiliyse `Tümü` ile temizlenebilir.
- Türkçe noktalı/noktasız I ve aksanlı harflerden bağımsız sözcük araması. İsim, şehir, açıklama ve uygulama geliştirici bilgisi aranmaktadır.
- İsimde tam eşleşme → isim başlangıcı → diğer eşleşmeler sırasıyla; puanlı, ücretli veya sponsorlu sıralama değildir.
- İşletmeye dokununca mevcut `/businesses/[id]` açılır; onun mini uygulama bağlantıları oradan açılır.
- Mini uygulamaya dokununca mevcut `/miniapps/[id]` ve kabuk/izin kontrolleri çalışır. Arama yeni bir doğrudan URL çalıştırma yolu açmaz.
- İki veri kaynağından biri açılamazsa diğer kaynak gösterilir ve eksiklik bildirilir. İkisi de açılamazsa tekrar deneme görünür.

## Kod konumları

- `apps/mobile/src/app/(app)/(tabs)/discover.tsx`: Keşfet giriş ekranı.
- `apps/mobile/src/app/(app)/search.tsx`: ortak arama ve filtreler.
- `apps/mobile/src/features/discovery/search.ts`: saf, test edilebilir sorgu/sıralama mantığı.
- `apps/mobile/src/ui/category-filter.tsx`: seçilmiş kategorinin temizlenebilmesi.
- `apps/mobile/test/discovery-search.test.ts`: Türkçe, kapsam, filtre ve sıralama regresyon testleri.

## Ölçek ve doğrulama sınırları

Bu ilk sürümde iki **mevcut ve yalnızca kamuya açık** liste istemci tarafında birleştirilmiştir. `/v1/businesses` en fazla 200 işletme döndürür; 201. işletmeyi arama ekranı kendiliğinden bulamaz. Ayrıca sunucu taraflı çapraz kategori skorlaması, coğrafi keşif, konum izni, yapay zekâ önerisi veya kişiselleştirilmiş sıralama bu aşamada **yoktur**. Bunları varmış gibi göstermemek gerekir.

Global ölçek için mevcut API'ye sayfalı sorgu ve sunucuda indekslenebilir arama eklenmeli; güvenlik filtreleri, yayın/askı durumları ve kurumsal hacim o endpoint'te korunmalıdır. Tam tip denetimi, Vitest, Expo/React Native çalıştırma ve gerçek telefon erişilebilirlik kabulü bütün geliştirmeler bitince yapılacaktır.
