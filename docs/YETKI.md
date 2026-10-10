# İşletme içi yetki

VADO Business'ta kimin neyi, hangi şubede yapabileceği tek bir modelle belirlenir. Yeni bir modül
(rezervasyon, iş talebi, kampanya) ayrı izin tablosu açmaz; izin kataloğuna yeni bir ad ekler.

## Roller

| Rol              | Kapsam                     | Not                                                                              |
| ---------------- | -------------------------- | -------------------------------------------------------------------------------- |
| İşletme sahibi   | Her şey, bütün şubeler     | Ekip, bölge ve izinleri yalnız sahip değiştirir.                                 |
| Yönetici         | Her izin, bütün şubeler    | Ekibi ve izinleri görür, değiştiremez. Bölge müdürü için kullanılmaz.            |
| Personel         | Yalnız verilen izinler     | İzin yoksa hiçbir sipariş, rapor ya da şube bilgisi görmez.                      |
| Kurye            | Yalnız kendisine atanan iş | Ayrı üyelik türü; işletme ekranlarına giremez (bkz. [TESLIMAT.md](TESLIMAT.md)). |
| Operasyon cihazı | Eşleştiği şube ve örnek    | Kişi değildir; restoranda "Mutfak ekranı" olarak görünür.                        |

## İzin kataloğu

Katalog `packages/contracts/src/business-access.ts` dosyasındadır (`BUSINESS_PERMISSIONS`).

| İzin                   | Ne açar                                                             | İçerdiği izin |
| ---------------------- | ------------------------------------------------------------------- | ------------- |
| `orders.view`          | Sipariş listesi, ayrıntısı, canlı sipariş olayları                  |               |
| `orders.manage`        | Kabul, ret, durum ilerletme, kapıda tahsilat kaydı                  | `orders.view` |
| `tables.serve`         | Masa oturumları, garson çağrısı, hesap (masa servisi paketi açıksa) |               |
| `catalog.availability` | Şubede ürünü satışa açma ya da tükendi işaretleme (fiyat değil)     |               |
| `reviews.reply`        | Değerlendirmeleri görme ve işletme adına yanıtlama                  |               |
| `reports.view`         | Şube sipariş sayıları ve tamamlanan sipariş tutarları               |               |

Devredilmeyen işler sahip ve yöneticidedir: katalog ve fiyat, kampanya ve kupon, teslimat bölgesi,
Studio, operasyon cihazı, iptal ve iade kararı. Ekip, bölge ve davet yalnız sahiptedir.

Bir izin, anlamlı olduğu yetenek paketine bağlanabilir (`tables.serve` → masa servisi). VADO
Business, uygulama örneğinde açık olmayan paketin iznini ekip ekranında göstermez.

## Kapsam

Her izin üç kapsamdan biriyle verilir:

- **İşletme geneli:** bütün şubeler, sonradan açılanlar dahil.
- **Bölge:** bölgenin o anki şubeleri. Şube başka bölgeye taşınınca erişim kendiliğinden değişir;
  izinlerin kopyası tutulmaz.
- **Şube:** yalnız o şube.

Bölge şubeleri gruplar (Marmara, Ege); kendi başına yetki vermez. Bölge müdürü, bölge kapsamlı
izinleri olan personeldir.

## Davet

İşletme sahibi Ekibim ekranından telefon numarası ve izinleri seçerek bağlantı üretir.

- Bağlantı 72 saat geçerlidir, bir kez kullanılır. Belirteç 256 bit rastgeledir; veritabanında
  yalnız SHA-256 özeti tutulur. Bağlantı yalnız oluşturma yanıtında görünür.
- Belirteç adresin `#` parçasındadır; sunucu günlüklerine ve tarayıcı geçmişine gitmez.
- Davet yalnız davetteki telefon numarasıyla giriş yapılmış VADO hesabında açılır ve yalnız
  personel üyeliği verir. Etkin üyeye davet açılmaz; pasif personel davetle yeniden açılır,
  eski izinleri geri gelmez.
- SMS ya da WhatsApp gönderilmez; bağlantıyı sahip kendisi iletir.

## Veritabanı

- Şema dosyası: `apps/api/migrations/0022_business_access.sql`.
- Tablolar: `business_regions`, `business_region_branches`, `business_member_grants`,
  `business_staff_invitations`, `business_staff_invitation_grants`. Hepsinde bileşik yabancı
  anahtarlar, RLS açık ve zorlanmış, kurye üyeliği için kısıtlayıcı politika vardır.
- Kural tek yerdedir: `business_member_can(işletme, kullanıcı, izin, şube)`.
  `tenant_member_can(işletme, izin, şube)` aynı kuralı oturumdaki kişi için uygular. API'de
  `authorize` ve `permittedBranch` (`apps/api/src/core/business-access.ts`) bu işlevi kullanır;
  kuralın ikinci bir kopyası yazılmaz.
- İzin yalnız etkin personele verilebilir (tetikleyici). İzin satırı değiştirilemez; silinip
  yeniden verilir. Üyelik kapanınca ya da rol değişince izinler silinir.
- Canlı sipariş ve masa olaylarının alıcıları da aynı kuralla seçilir: garson yalnız izinli
  şubesinin olayını alır.

## 2.7'den geçiş

2.7'de personel bütün şubelerin siparişlerini görüp işleyebiliyor ve masa servisini
yürütebiliyordu. 0022 uygulanırken her etkin personele işletme genelinde `orders.view`,
`orders.manage` ve `tables.serve` verilir; hiçbir restoran yükseltmede iş kaybetmez. Sahip sonra
Ekibim ekranından daraltır. Pasif personele izin verilmez.

## Denenen ve denenmeyen

- Denendi: `apps/api/test/business-access.test.ts` (bölge, şube ve işletme kapsamı, sürüm
  çakışması, davet, doğrudan SQL), `apps/api/test/upgrade-2.7.test.ts` (2.7.0 şemasından geçiş),
  `apps/business/test/business-input.test.ts` (vekil yolları).
- Denenmedi: Ekibim ve Bölgeler ekranlarının tarayıcıda ve telefonda kullanımı (2.8 kapanışında).
