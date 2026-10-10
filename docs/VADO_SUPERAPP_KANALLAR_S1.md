# VADO Süper Uygulama — S1: İşletme kanalları

## Kaynak ve kapsam

Bu geliştirme **yalnızca `VADO_2.8.0-alpha.4_A1.zip`** üzerinde yapılmıştır. Daha eski ZIP'lerden
kod veya migrasyon kopyalanmamıştır. A1'in `0022–0027` migrasyonları korunmuştur; yeni
`0028_business_channels.sql` ayrı ve temiz konulu bir değişikliktir. A1/A2 numaralarını
karıştırmamak için çalışma adı **S1**'dir; sürümün üretim kabulünü ifade etmez.

## Kullanıcı deneyimi

- Müşteri işletmenin profiline girer, **Takip et** düğmesiyle gönüllü takip başlatır.
- Keşfet → **Takip ettiklerim** üzerinden işletme duyurularını görür ve işletmeye geri döner.
- İşletme sahibi/yönetici VADO Business → **Duyurular** üzerinden 1–500 karakterlik duyuru yazar.
- Hatalı duyuru geçmişini silmeden yayından geri çeker; müşteri akışından kaybolur.
- Takipten çıkmak duyuruları kişisel akıştan hemen kaldırır.
- Takip etme **SMS, WhatsApp, e-posta, otomatik push veya ticari ileti onayı değildir**.

## API

| Yöntem         | Yol                                                   | Erişim                                     |
| -------------- | ----------------------------------------------------- | ------------------------------------------ |
| GET            | `/v1/channels/feed?limit=20&cursor=...`               | oturum sahibi, yalnız takip ettikleri      |
| GET            | `/v1/channels/following`                              | oturum sahibi                              |
| GET/PUT/DELETE | `/v1/businesses/:businessId/channel/follow`           | oturum sahibi                              |
| GET            | `/v1/businesses/:businessId/channel/posts`            | oturum açmış kullanıcı, yayımlanmış        |
| GET/POST       | `/v1/business/:businessId/channel/posts`              | işletme üyesi / POST yalnız sahip-yönetici |
| POST           | `/v1/business/:businessId/channel/posts/:id/withdraw` | yalnız sahip-yönetici                      |

İşletme panelindeki API vekili sadece açıkça izin verilen `channel/posts` yollarını iletir.
Müşteri takipleri SQL işlemindeki `vado.user_id` ile ayrılır. Duyurular RLS ile yalnız
aktif, doğrulanmış işletme adına yayımlanmışsa okunur. Yeni hiçbir `platformDb`
istisnası açılmamıştır. İmleç, Postgres `bigint` sıra numarasını **metin** taşıyarak
JavaScript hassasiyet kaybını önler.

## Şimdiye kadar yapılmayanlar

- Takipçi bildirimleri, kampanya hedeflemesi, toplu mesaj veya ticari ileti gönderimi.
- Zamanlanmış duyuru, resimli duyuru, moderasyon arayüzü ve resmi hesap doğrulama rozeti.
- Ücretli/öne çıkarılan duyuru ve öneri algoritması.
- `following` listesinin 200 kayıt üzeri sayfalaması.
- Çalışan gerçek PostgreSQL/Expo testi ve üretim onayı.

Bu eksikler çalışıyormuş gibi gösterilmemelidir. S1, kurumsal ölçek kabulünden önce
kullanıcı deneyimi ve güvenlik açısından test edilmelidir.

## Sonraki geliştirme sırası

1. **A1/S1 kalite kapısı:** npm temiz kurulumu, TypeScript, lint, bütün otomatik testler,
   yeni RLS ve migrasyon testleri. Bu aşamadaki kaynak teslimi final değildir.
2. **S2 — İşletmeye mesaj:** işletme sohbet kanalı, çalışan yanıtlama izni,
   müşteri ve işletme bağlamı, engelleme ve şikâyet süreçleri.
3. **S3 — Mini uygulama bağlantıları:** sohbetten işletme, ürün, randevu ve QR açılışı;
   güvenli mağaza/şube bağlamı ve kullanıcıya dönüş.
4. **S4 — Günlük yerel yaşam:** konum, teslimat bölgesi ve doğrulanmış hizmet uygunluğu;
   işletmenin telefonundan kolay yönetimi.
5. **S5 — Sektör motorları:** önce A2 sipariş çekirdeğinin sektör tarafsızlaştırılması;
   ardından 2.9 rezervasyon motoru ve mini uygulama şablonları.
6. **S6 — Kurumsal ekosistem:** onaylı geliştirici uygulamaları, işletme SDK'sı,
   çok şube yönetimi ve entegrasyon sözleşmeleri.

**Sınır:** WeChat benzeri hedef, telifli arayüz veya kod kopyası anlamına gelmez.
Kendi ürün dili, Türkiye'ye uygun mevzuat ve gönüllü kullanıcı izinleri esastır.
