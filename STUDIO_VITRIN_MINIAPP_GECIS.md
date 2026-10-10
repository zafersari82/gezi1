# VADO — Vitrinden mini uygulamaya geçiş

## Müşterinin yolu

1. VADO Keşfet veya Arama ekranından işletme profiline ulaşır.
2. İşletmenin yayındaki mini uygulamasına dokunur.
3. Mobil uygulama `GET /v1/businesses/:businessId/miniapps/:miniAppId/launch` isteğiyle doğrulanmış etkin mağaza–uygulama örneğini alır.
4. Mini uygulama kabuğu işletme/örnek ID'lerini yerel açılış belleğinden alır. Mevcut kabuk SDK çağrıları `POST /v1/shell/business-context` ile tekrar denetlenir.
5. Mini uygulama kapatıldığında gezinme yığını mağaza profilini korur ve müşteri kaldığı yere döner.

## Güvenlik ve sınırlar

- Sunucu sorgusu işletme, sahibi, mini uygulama yayını, satıcı bağı ve uygulama örneğinin etkinliğini aynı anda kontrol eder.
- Aynı işletme/mini uygulama için **iki veya daha fazla etkin örnek** varsa yanlış satıcıya yönlendirmek yerine 404 döndürür. Kurumsal satıcı seçim ekranı ayrıca geliştirilecektir.
- API yalnız aktif örnek bağlamını döndürür. Müşteri kaydı bu GET sırasında oluşturulmaz. Açılış parametreleri URL'ye yazılmaz.
- QR ile açılan mini uygulamada imzalı masa bağlamı ve ham QR ayrı kalır; standart mini uygulama araması da değişmez.
- Aynı kabuk, aynı katalog ve aynı sipariş motoru korunur. Ayrı ürün/ödeme servisi eklenmedi.

## Kabul testleri

- Aynı mini uygulamayı kullanan iki farklı işletme arasında doğru bağlamın seçilmesi.
- İşletmenin askıya alınması, satıcı bağının devre dışı bırakılması, sürümün kaldırılması ve örneğin kapatılmasında açılışın reddi.
- Aynı işletmeye ait iki farklı örneğin otomatik seçilmemesi.
- QR ile masa açılması ve mini uygulamadan çıkıldığında önceki ekrana dönülmesi.
- Gerçek Android/iOS cihazlarında arka plana alma, cihaz kilidi, bağlantı kopması ve tekrar açma akışları.

**Not:** Bu testlerin kaynakları eklenmiştir; PostgreSQL ve gerçek cihaz üzerinde henüz kabul edilmemiştir.
