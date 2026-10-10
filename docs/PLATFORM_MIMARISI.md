# VADO uygulama platformu mimarisi

Bu belge VADO'nun sektör uygulamalarını (restoran, güzellik, otel, mağaza…) nasıl ürettiğini ve
hangi kuralla büyüyeceğini anlatır. 2.6'dan itibaren yazılan her motor, yetenek paketi ve sektör
deneyimi bu belgeye uyar. Belge bir hedef mimaridir: uygulanan katmanların sürüm durumu belgenin sonunda belirtilir;
neyin var olduğu "Bugünkü durum" bölümündedir.

## Temel kural

**Ortak mimari, birinci sınıf sektör ürünleri.** Kod tekrarını azaltırız; özelliği ve kullanıcı
deneyimini azaltmayız.

1. Her sektör için ayrı motor yazılmaz. Yeni bir sektör ya da uygulama düşünülürken ilk soru
   şudur: **"Bu ihtiyaç mevcut hangi motorun varyasyonu?"** Yeni motor son çaredir.
2. Bir sektörü motora uydurmak için özelliği budanmaz. Gerekli karmaşıklık yetenek paketiyle
   eklenir; motor çatallanmaz (fork edilmez).
3. Kod ortak olabilir; ürün deneyimi ortak olmak zorunda değildir. Aynı motoru kullanan iki
   sektör ürünü, son kullanıcıya iki ayrı şirketin ürünü kadar farklı görünebilir ve davranabilir.
4. Bir yetenek birden fazla motorda gerekiyorsa motorun içine değil, platform servisleri
   katmanına yazılır.
5. Ortak motor kullanmanın amacı uygulamaları basitleştirmek değildir. VADO'daki sektör ürünleri
   birkaç formdan oluşan mini uygulamalar değil; kendi sektöründe bağımsız bir yazılım şirketinin
   çıkardığı ticari ürün kalitesinde olacaktır (aşağıda, "PRO kalite şartı").

**Yön.** VADO, Türkiye'ye uyarlanmış WeChat tipi bir süper uygulamadır. Restoran PRO ilk büyük
sektör ürünü ve platformun ilk büyük stres testidir; VADO'nun yönü değildir. Restoran katalog, fiyat,
QR, gerçek zamanlı sipariş, şube, mutfak, bildirim, teslimat ve işletme operasyonunu aynı anda
zorladığı için önce gelir; ardından diğer sektörlere geçilir.

## Katmanlar

```
VADO Platform Servisleri      kimlik, işletme, müşteri, bildirim, ödeme, QR, sohbet, konum…
        ↓
Motor çekirdeği (3 motor)     Rezervasyon · Sipariş · İş talebi
        ↓
Yetenek paketleri             masa servisi, mutfak, teslimat bölgeleri, bekleme listesi, iade…
        ↓
Sektör deneyimi               Restoran PRO, Güzellik PRO, Otel PRO, Mağaza PRO…
        ↓
İşletme uygulaması            "Kadıköy Berber", "Moda Kahve" (bir işletmenin kurulu örneği)
```

Bağımlılık yalnızca aşağı doğrudur: sektör deneyimi paketleri ve motoru, paketler motoru ve
platformu, motor platformu kullanır. **Motorlar birbirini doğrudan çağırmaz.** Motorlar arası iş
olaylarla yürür ("rezervasyon tamamlandı" → değerlendirme isteği; "sipariş hazır" → teslimat).
Bir yetenek paketi başka bir paketi ancak bildirdiği bağımlılık olarak kullanabilir.

## Platform servisleri

Birden fazla motorun ya da VADO'nun kendisinin kullandığı her şey buradadır. Motorlar bunların
kendi kopyasını yazmaz: Rezervasyon kendi bildirim sistemini, Sipariş kendi müşteri modelini,
Mağaza kendi kupon altyapısını yazmaz.

| Servis           | Ne taşır                                                            | Durum  |
| ---------------- | ------------------------------------------------------------------- | ------ |
| Kimlik           | Kullanıcı, oturum, cihaz, kayda özel kimlik, kimlik belirteci       | Var    |
| İşletme ve şube  | İşletme, şube, çalışma saatleri, işletme hesapları ve kapsamı       | Kısmen |
| Müşteri          | İşletmeye özel müşteri kimliği, geçmiş, notlar, izinler             | Yok    |
| İzinler          | Panel rolleri, işletme kapsamı, kullanıcı izinleri                  | Var    |
| Katalog ve fiyat | Ürün/hizmet, kategori, varyant, seçenek grubu, fiyat listesi, KDV   | Yok    |
| Teşvik           | Kampanya, kupon, sadakat, kişiye özel teklif                        | Yok    |
| Bildirim         | Anlık bildirim, SMS, hatırlatma zamanlayıcı; işlemsel/ticari ayrımı | Kısmen |
| Sohbet           | Kullanıcılar arası ve müşteri–işletme mesajlaşması                  | Kısmen |
| QR               | İmzalı ve parametreli kodlar                                        | Var    |
| Medya ve dosya   | Görsel, belge, paket deposu                                         | Var    |
| Konum            | Adres (il/ilçe/mahalle), geokod, hizmet ve teslimat bölgeleri       | Yok    |
| Ödeme            | Lisanslı kuruluş üzerinden tahsilat, iade, kapıda ödeme kaydı       | Deneme |
| Fatura           | e-Arşiv / e-Fatura entegratörü                                      | Yok    |
| Değerlendirme    | Puan, yorum, yanıt, moderasyon                                      | Yok    |
| Favoriler        | Kullanıcının işletme, ürün ve hizmet favorileri                     | Yok    |
| Arama ve keşif   | İşletme, ürün, hizmet araması; filtre, yakınlık                     | Yok    |
| Analitik         | İşletme paneli göstergeleri, olay kaydı                             | Yok    |
| Olay yolu        | Motorlar ve paketler arası olaylar, webhook'lar                     | Yok    |

**Servisler önceden değil, ihtiyaç doğunca yazılır.** Bir yetenek ikinci kez gerektiği anda
platforma çıkarılır; tek bir motor için tahminle servis yazılmaz. Tabloda "Yok" yazanlar, onları
ilk isteyen sürümde yazılır.

## Motorlar

Yalnızca üç motor vardır: Sipariş (Ordering), Rezervasyon (Reservation) ve İş talebi (Work
Request). Motor çekirdeği yalnızca gerçekten ortak olan alan mantığını taşır.

| Motor           | Temel soru                                | Çekirdek                                                                                                    | Kapsadığı sektörler (örnek)                                                                           |
| --------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Sipariş**     | Hangi ürünler, hangi sepet, nasıl teslim? | Katalog ilişkisi, sepet, sipariş, fiyat hesabı, teslim biçimi (fulfillment), sipariş durum makinesi         | Restoran, kafe, pastane, dark kitchen, market, mağaza, butik, petshop, yedek parça                    |
| **Rezervasyon** | Hangi zaman ve kapasite kime ayrıldı?     | Kaynak (personel, oda, koltuk), takvim, müsaitlik, kapasite, rezervasyon, iptal, rezervasyon durum makinesi | Kuaför, berber, güzellik, klinik, veteriner, spor, özel ders, danışmanlık, etkinlik bileti, otel, tur |
| **İş talebi**   | Talep → teklif → atama → iş → tamamlandı  | Talep, adres, teklif, atama, görev, iş durum makinesi                                                       | Tamirci, tesisatçı, elektrikçi, temizlik, çekici, oto servis, ev hizmetleri                           |

- **Bilet ve seyahat ayrı motor değildir.** İkisi de zamana bağlı, sınırlı kapasitedir: koltuk bir
  kapasite birimi, otel gecesi bir zaman birimi, oda bir kaynaktır. Koltuk planı, gece bazlı fiyat,
  konaklama kuralları Rezervasyon'un yetenek paketleridir.
- **Teslimat ayrı motor değildir.** Sipariş motorunun teslim biçimlerinden biridir; kurye ve kargo
  bağlantıları platformdaki teslimat sağlayıcıları ve yetenek paketleridir.
- Market ile restoran aynı motordadır: fark stok, SKU ve kargo (Mağaza paketleri) ile mutfak, masa
  ve hazırlık (Restoran paketleri) arasındadır.

**Yeni motor önerisi** ancak şu sorular yazılı olarak yanıtlanırsa yapılır: hangi temel soruyu
yanıtlıyor; neden üç motorun hiçbirinin durum makinesi, kaynak modeli ve fiyat hesabı yetenek
paketleriyle bunu taşıyamıyor; hangi en az üç sektörü kapsayacak.

**Bir motor, en az üç farklı sektör deneyimini çatallanmadan çalıştıramıyorsa bitmiş sayılmaz.**

### Sektörler motorlara bire bir bağlı değildir

Bir sektör deneyiminin bir **ana motoru** olabilir, ama gerektiğinde diğer motorların yeteneklerini
de kullanır. Gerçek süper uygulama mimarisi burada ortaya çıkar:

| Sektör deneyimi | Ana motor                     | Ayrıca kullandığı motorlar                                |
| --------------- | ----------------------------- | --------------------------------------------------------- |
| Otel            | Rezervasyon (konaklama)       | Sipariş (oda servisi), İş talebi (bakım, temizlik talebi) |
| Oto servis      | Rezervasyon (bakım randevusu) | İş talebi (arıza, çekici), Sipariş (yedek parça)          |
| Güzellik salonu | Rezervasyon (randevu)         | Sipariş (kozmetik ürün satışı)                            |
| Restoran        | Sipariş                       | Rezervasyon (masa rezervasyonu)                           |

Kurallar:

- **Motorlar yine birbirini doğrudan çağırmaz.** Bileşimi sektör deneyimi kurar ve VADO platformu
  üzerinden yapar: aynı işletme, aynı uygulama örneği, aynı `businessCustomerId`.
- **Kayıtlar arası bağ platformdadır.** Bir motorun kaydı başka bir motorun kaydına "bağlam" olarak
  bağlanabilir (oda servisi siparişi → konaklama rezervasyonu; çekici talebi → servis randevusu).
  Bağ platformun ortak bir bağlam alanıyla (tür + kimlik, aynı işletme içinde, RLS altında) kurulur;
  motor öteki motorun tablolarını tanımaz.
- **Motorlar arası tepki olaylarla olur:** "konaklama bitti" olayı açık oda servisi siparişlerini
  kapatmayı tetikler; bunu motor değil, deneyimin bağladığı yetenek paketi yapar.
- **VADO Business modülleri sektöre değil açık yeteneklere göre açılır.** Otelde Rezervasyonlar,
  Odalar, Oda servisi siparişleri ve Talepler aynı uygulamada yan yana durur.
- **Müşteri tek bir yolculuk görür.** "Konaklamam" ekranında oda servisi siparişleri ve
  talepler birlikte görünür; arkada üç motor olduğu müşteriye yansımaz.
- Yeni bir sektör planlanırken soru "hangi motor?" değil, **"hangi motorların hangi yetenekleri?"**
  olur.

## Yetenek paketleri

Sektörün ciddi özellikleri bağımsız, yeniden kullanılabilir paketler olarak eklenir. Bir paket şu
parçalardan oluşur ve bunları açıkça bildirir:

- **Veri:** kendi tabloları (kendi önekiyle) ve motor kayıtlarına bağlanan ek alanları; kendi şema
  dosyaları.
- **Davranış:** motorun durum makinesine eklediği durumlar ve geçişler, geçişlerdeki kurallar
  (örnek: "Mutfak" paketi `kabul edildi → hazırlanıyor → hazır` adımlarını ekler).
- **Ayar:** işletmenin panelden yaptığı ayarların şeması (bugünkü `configFields` yapısının büyümüşü).
- **Uçlar ve olaylar:** API uçları, yayımladığı ve dinlediği olaylar.
- **Yetki:** gerektirdiği panel izinleri; işletme kapsamına uyması zorunludur.
- **Arayüz parçaları:** müşteri tarafı ve işletme tarafı için bileşenler; sektör deneyimi bunları
  kendi tasarımıyla yerleştirir.
- **Bağımlılıklar:** kullandığı motor, platform servisleri ve diğer paketler; uyumlu sürümleri.

Paketler işletme uygulaması başına açılır, kapatılır ve ayarlanır.

### Paket kataloğu (Sipariş motoru, 2.8)

Paketin manifesti (`apps/api/src/modules/capabilities/capabilities.registry.ts`) API'deki
kaynaktır; veritabanındaki karşılığı `capability_catalog` tablosudur (`0031`, satırlar `0032`).
Çekirdek SQL paket adı bilmez: paket kümesinin geçerliliği (`ordering_capabilities_valid`) ve
siparişin durum akışı (`ordering_compile_graph`) bu katalogdan hesaplanır.

- **Gereksinim:** gruplar hâlinde; her grup içindeki seçeneklerden biriyle karşılanır (eve teslim,
  hazırlık ya da operasyon cihazı ister).
- **Akış eklemesi:** bir ekleme, ekleme noktası akışta açıldığında uygulanır; başka bir eklemenin
  açtığı nokta da sayılır. Aynı noktaya iki ekleme derlenemez. Paket adına göre sıra yoktur.
- **Rol:** `workflow` paketi akışa ya da teslim biçimine katılır; `data` paketi (tekrar sipariş,
  iade) yalnız veri ekler.
- **Kapatma:** etkin sipariş varken yalnız durum ekleyen paket (hazırlık) kapatılabilir.
- **Ayar:** katalogdaki varsayılan yazılır ve paketin doğrulayıcı işleviyle denetlenir.
- **Alış beyanı:** `explicitModes` açıkken teslim biçimleri yalnız paketlerle açılır (çekirdeğin
  varsayılan gel-al'ı kapanır); `openingHours` açıkken sipariş yalnız şube açıkken verilir.
- **Teslim biçimi kaydı** (`ordering_fulfilment_modes`, `0033`/`0034`): biçimi açan paket, istediği
  bağlam türü, adres gerekip gerekmediği, tahsilat yerleri ve paketin ek kural işlevi. Geçerliliği
  tek işlev söyler (`ordering_fulfilment_status`); sepet ve sipariş tetikleyicileri de onu kullanır.
- **Sipariş bağlamı:** sepet ve sipariş `context_kind` + `context_id` taşır (bugün tek tür: masa
  servisinin `table_session`'ı). Bağlamın varlığını ve adını onu kaydeden paket denetler ve üretir.
- **Canlı olay türleri** (`live_event_types`): sipariş olayları çekirdekte; paket olayları kaynağını
  paketin çözücü işleviyle bulur (masa çağrısı → masa oturumu).
- Katalog yalnız şema dosyalarıyla değişir; uygulama rolleri okur. Manifest ile katalog eşitliği
  ve 256 paket bileşiminin her teslim biçimindeki akışı `capability-catalog.test.ts` ile her
  derlemede karşılaştırılır.

### Hangi yetenek hangi katmanda

Karar kuralı: **iki ya da daha fazla motor kullanıyorsa platform servisi; bir motorun alanını
genişletiyorsa o motorun paketi; tek bir sektörün görünüşüyse sektör deneyimi.**

| Yetenek                                          | Katman                              | Gerekçe                                                          |
| ------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------- |
| Kampanya, kupon, sadakat                         | Platform (Teşvik)                   | Üç motor da kullanır                                             |
| Değerlendirme, favoriler                         | Platform                            | Üç motor da kullanır                                             |
| Müşteri mesajlaşması                             | Platform (Sohbet)                   | Var olan sohbetin işletme kanalı                                 |
| Hatırlatma                                       | Platform (Bildirim)                 | Rezervasyon, sipariş ve iş talebi kullanır                       |
| Teslimat bölgeleri (çizim, mesafe)               | Platform (Konum)                    | Sipariş ve iş talebi kullanır; bölge ücret kuralı Sipariş paketi |
| Şube operasyonları (saat, tatil, yoğunluk)       | Platform (İşletme ve şube)          | Bütün motorlar                                                   |
| Ödeme kancaları, depozito                        | Platform (Ödeme)                    | Bütün motorlar                                                   |
| Ürün seçenekleri ve ekstra grupları (modifier)   | Platform (Katalog)                  | Restoran ve mağaza aynı yapıyı kullanır                          |
| Stok, SKU, varyant                               | Platform (Katalog) + Sipariş paketi | Stok sayımı katalogda; rezerve etme ve düşme Sipariş paketinde   |
| Masa servisi, masadan QR sipariş, garson çağırma | Sipariş paketi                      | Sipariş alanını genişletir                                       |
| Mutfak operasyonları, hazırlık ekranı            | Sipariş paketi                      | Sipariş durum makinesine adım ekler                              |
| İleri saate sipariş, gel-al, eve teslim, kargo   | Sipariş paketleri                   | Teslim biçimleri                                                 |
| Kurye ataması                                    | Sipariş paketi                      | Teslimat sağlayıcısı arayüzüyle dış ağa da bağlanır              |
| İade ve değişim                                  | Sipariş paketi                      | Sipariş ve ödemeye bağlı                                         |
| Yeniden sipariş                                  | Sipariş paketi                      | Sipariş geçmişinden sepet kurar                                  |
| Personel, vardiya, oda, kapasite                 | Rezervasyon çekirdeği               | Motorun temel kaynak modeli                                      |
| Bekleme listesi, tekrarlayan rezervasyon         | Rezervasyon paketleri               |                                                                  |
| Üyelik, paket seans                              | Rezervasyon paketi                  | Ödemeyle ilişkisi platformda                                     |
| İptal kuralları                                  | Rezervasyon paketi                  | Ücret kesintisi ödeme kancasıyla                                 |
| Koltuk planı, gece bazlı fiyat                   | Rezervasyon paketleri               | Bilet ve konaklama                                               |
| Teklif, atama, saha görevi                       | İş talebi çekirdeği                 |                                                                  |

## Sektör deneyimi

Aynı motoru kullanan sektörlerin deneyimi aynı olmak zorunda değildir ve olmamalıdır. Restoran
PRO restoran gibi, Güzellik PRO salon gibi, Otel PRO konaklama ürünü gibi görünür ve davranır.
Yalnızca renk ve logo değiştirilmiş ortak bir şablon kabul edilmez.

Her sektör deneyimi kendisi için tasarlanır: bilgi mimarisi, gezinme, keşif, filtreler, ayrıntı
sayfaları, temel akışlar, boş/yükleniyor/hata durumları, müşteri yolculuğu ve işletme tarafında
günlük iş akışları ile göstergeler.

Bir sektör deneyimi iki yüzlüdür:

- **Müşteri deneyimi:** VADO uygulamasının içinde açılan, VADO'nun kendisinin yazdığı ve incelediği
  bir paket. Mini uygulama altyapısını (yalıtım, köprü, kimlik, QR parametreleri, bildirim)
  kullanır.
- **İşletme deneyimi:** bütün sektörlerin kullandığı **tek** uygulama olan **VADO Business**
  içinde açılan modüller. Sektör başına ayrı işletme uygulaması yazılmaz. VADO Business zamanla
  Siparişler, Rezervasyonlar, Müşteriler, Ürünler ve Hizmetler, Şubeler, Personel, Kampanyalar,
  Mesajlar, Raporlar ve Ayarlar modüllerini taşır; işletme hangi motor ve paketleri kullanıyorsa o
  modüller açılır. Bugün restoran sipariş, menü, mutfak ve şube modüllerini; yarın kuaför
  rezervasyon, personel ve takvim modüllerini kullanır. İlk sürüm duyarlı web uygulaması (PWA)
  olarak telefon, tablet ve masaüstünde aynı üründür; **tablet birinci sınıf senaryodur** (mutfak
  ve kasa). Yazıcı, arka plan süreçleri ya da donanım gerektiğinde yerel bir kabuk eklenir.

Basit örnek mini uygulama (bugünkü "Randevu" örneği) ile üretim seviyesindeki sektör ürünü ayrı
kavramlardır. Örnekler geliştiriciler için öğreticidir; PRO ürünü değildir.

## Değişmez teknik kurallar

İlk motor yazılmadan önce kesinleşen ve sonradan gevşetilmeyecek kurallar. Bunlar sonradan
eklenirse motorların kalbini değiştirmek gerekir; bu yüzden baştan uygulanır.

### İşletme verisinin yalıtımı

Yirmi bin işletme aynı motoru kullanırken bir işletme hiçbir koşulda başka bir işletmenin
müşterisine, siparişine, ürününe ya da şubesine ulaşamaz. Bu yalnızca uç noktada bir süzgeç
değildir:

- İşletmeye ait her kayıt bağlamını açıkça taşır: `business_id`, gereken yerde `branch_id` ve
  `app_instance_id`.
- Kayıtlar arası bağlar bağlamı da içerir (bileşik yabancı anahtar): bir siparişin satırı yalnızca
  **aynı işletmenin** ürününe bağlanabilir; veritabanı başka işletmenin kaydına bağı reddeder.
- Veri erişimi ortak bir katmandan geçer ve **işletme kapsamı olmadan sorgu yazılamaz**: kapsam
  zorunlu bir parametredir; kapsamsız erişim yalnızca açıkça adlandırılmış platform işlerinde
  (yedek, VADO ekibinin paneli) vardır.
- Veritabanı da aynı kuralı uygular (satır düzeyinde güvenlik); uygulamadaki bir hata tek başına
  sızıntıya yol açmaz.
- Her yeni motor tablosu, başka işletmenin kaydına erişimi doğrudan SQL ile deneyen testlerle
  gelir.

### İşletmeye özel müşteri kimliği

- Mini uygulamanın gördüğü `openId` uygulama kaydına özel kalır.
- Ayrıca işletme genelinde kararlı bir `businessCustomerId` vardır; işletmenin bütün uygulama
  kayıtlarında ve VADO Business'ta müşteri bu kimlikle görünür.
- İşletme VADO'nun iç kullanıcı kimliğini hiçbir zaman görmez; telefon numarasını yalnızca
  kullanıcının o işlem için verdiği izinle (ör. teslimat) görür.

### Sipariş güvenilirliği

Sipariş motoru baştan ciddi bir ticari sistem gibi kurulur:

- **Tekrar koruması (idempotency):** her oluşturma isteği istemcinin ürettiği bir anahtar taşır.
  Ağ kesilip "Sipariş ver" iki kez basılsa da tek sipariş oluşur; ikinci istek ilkinin yanıtını
  alır. Aynı anahtarla farklı içerik gönderilirse reddedilir.
- **Eş zamanlılık:** her siparişin bir sürüm numarası vardır; değişiklik beklenen sürümle yapılır,
  araya giren değişiklik varsa reddedilir (iyimser kilitleme).
- **Durum geçişi denetimi:** yalnızca durum makinesinin izin verdiği geçişler yapılır; bitmiş
  sipariş yeniden açılamaz. Kural serviste ve veritabanında uygulanır; durum geçmişi yalnızca
  eklenir.
- **Fiyat anlık görüntüsü:** sipariş, oluştuğu andaki ürün adını, seçenekleri, birim fiyatı, KDV
  oranını ve toplamı kendi içinde saklar; katalog sonradan değişse de sipariş değişmez. Toplam
  yalnızca sunucuda hesaplanır.
- **Olay kaybolmaz (transactional outbox):** "sipariş oluştu" olayı siparişle **aynı işlemde**
  veritabanına yazılır; ayrı bir dağıtıcı onu tüketicilere (bildirim, mutfak ekranı, analitik)
  iletir. Sunucu kayıttan sonra çökerse olay yeniden başlangıçta iletilir; tüketiciler aynı olayı
  iki kez almaya dayanıklıdır. Kafka ya da ayrı servis gerekmez; modüler monolitin içinde çalışır
  ve ileride ayrılabilir.

### Studio'ya hazır sözleşmeler

VADO Studio (kod yazmadan kurma aracı) 3.x'te gelir; motorlar o gün yeniden yazılmaz. Bu yüzden her
motor ve yetenek paketi bugünden **makine tarafından okunabilir** bir sözleşme yayımlar: kimlik ve
sürüm, ayar şeması ve varsayılanlar, bağımlılıklar, izinler, olaylar, durum makinesine eklemeler,
API yetenekleri, müşteri arayüzü blokları, işletme arayüzü blokları ve doğrulama kuralları. Studio
bu sözleşmeleri okuyarak arayüz kurar; sözleşmede olmayan bir davranış Studio'dan ayarlanamaz.

## PRO kalite şartı

Bir sektör deneyimi "PRO" adını ancak şunların hepsini sağlıyorsa alır:

1. Gerçek bir işletmenin günlük operasyonunu baştan sona taşıyor.
2. Müşterinin temel işlemi VADO dışına çıkmadan tamamlanıyor.
3. İşletme tarafında gerçek bir yönetim ve operasyon paneli var.
4. VADO'nun bildirim, QR, sohbet ve kimlik servisleriyle (ödeme açıldığında ödemeyle) bütünleşik.
5. Mobil deneyimi sektördeki olgun ticari uygulamalarla karşılaştırılabilir.
6. Örnek veriyle değil, gerçek çoklu işletme ve çoklu şube kullanımıyla çalışıyor.

Ayrıca ölçülebilir olarak:

7. Müşteri ve işletme yolculuklarının tamamı tarayıcı senaryolarıyla uçtan uca sınanıyor; her
   koruma kuralı bozma denemesinden geçiyor.
8. Zayıf ağda (yavaş 3G, bağlantı kopması) temel akış bozulmuyor; kaybolan işlem çoğalmıyor.
9. Erişilebilirlik (ekran okuyucu etiketleri, dokunma alanları, kontrast) denetlendi.
10. Türkiye'ye özgü zorunluluklar (aşağıda) karşılanıyor.
11. Yayın öncesi toplu denemede (bütün sektörler bittikten sonra, gerçek işletmeler, gerçek
    telefonlar ve gerçek push ile) en az iki hafta kullanıldı ve bulunan sorunlar kapatıldı.
    Sektör başına ayrı pilot yapılmaz; bunun yerine birkaç sürümde bir sürüm sahibinin telefonu ve
    bir tabletle kısa bir **ara cihaz denemesi** yapılır (ses, uyku, push, kamera, QR).

Bir sürümde kapsam daraltılabilir; **kalite daraltılmaz.** Bir sürümde yayınlanan her yetenek
eksiksizdir; yarım bir yeteneği yayınlamak yerine bir sonraki sürüme bırakılır. Online ödemenin
henüz kapalı olması ürünün geri kalanının basit yapılması anlamına gelmez.

## Restoran PRO hedefi

Restoran PRO "menü + sepet" değildir. Hedef, olgun yemek sipariş ürünlerindeki müşteri
yolculuğunun VADO'ya uygun karşılığıdır:

```
keşfet → restoran → menü → ürün özelleştirme → sepet → masa / gel-al / eve teslim → sipariş
→ restoranın kabulü → hazırlık → kurye ve teslimat takibi → tamamlanma → değerlendirme → tekrar sipariş
```

ve bunun karşısında restoranın operasyon paneli: gelen siparişler (sesli uyarı, kabul/ret, tahmini
süre), mutfak ekranı, ürün bulunurluğu ve saat bazlı menü, şube ayarları, teslimat bölgeleri,
kuryeler, kampanyalar, değerlendirmeler ve göstergeler.

Türkiye'de kapıda nakit ve kapıda kart ödemesi yaygındır; bunlar ödeme kuruluşu olmadan da
sunulabilir. Online ödeme lisanslı kuruluş bağlandığında açılır.

## Türkiye'ye özgü zorunluluklar

Motorlar ve platform şunları baştan taşır ([TURKIYE_UYUM.md](TURKIYE_UYUM.md) ayrıntısıdır):

- **Ödeme (6493):** VADO para tutmaz; online tahsilat, alt üye işyeri modeli sunan lisanslı bir
  kuruluş üzerinden yapılır.
- **Fatura:** e-Arşiv / e-Fatura entegratörüne bağlanacak bir fatura servisi.
- **Mesafeli satış:** ön bilgilendirme, sözleşme, cayma hakkı ve istisnaları (hemen tüketilen
  yiyecekte cayma yoktur) Sipariş akışına gömülüdür.
- **Ticari ileti ve İYS:** bildirim servisi işlemsel iletiyi (sipariş durumu) ticari iletiden
  (kampanya) ayırır; ticari ileti İYS izni olmadan gönderilmez.
- **KVKK:** sağlık verisi (klinik, diyetisyen) özel nitelikli veridir; Rezervasyon'da "hassas
  sektör" ayarı açık rıza ve ayrı saklama gerektirir.
- **Adres:** il, ilçe, mahalle yapısı; **KDV:** ürün bazında oran; **fiyat:** sık güncellemeye
  uygun fiyat listeleri.

## Bugünkü durum ve VADO'nun var olan parçaları

- Mini uygulama altyapısı (paket, inceleme, yalıtım, köprü, izin), müşteri deneyimlerinin
  çalışacağı yerdir.
- Paket ve uygulama kaydı ayrımı, "sektör deneyimi" ile "işletme uygulaması" ayrımının
  karşılığıdır; işletme ayarları (`configFields`) yetenek paketi ayarlarının başlangıcıdır.
- İşletme hesabı ve kapsamı (2.5) işletme deneyiminin yetki temelidir.
- Parametreli QR (2.5) masadan sipariş ve şubede randevunun, kimlik belirteci (2.5) dış
  sistemlerle bağlantının, anlık bildirim (2.5) hatırlatma ve sipariş durumunun temelidir.
- Mini uygulamanın gördüğü `openId` uygulama kaydına özeldir. 2.6'da kurulan müşteri
  servisi aynı işletmenin kayıtları arasında ortak, **işletmeye özel** kimlik sağlar.

2.6'da Sipariş çekirdeği, yetenek paketleri ve VADO Business; 2.7'de Restoranın iç
operasyonu uygulanmıştır. Restoran'ın eve teslim kapsamı 2.8'dedir; PRO etiketleri yayın öncesi toplu denemeden sonra konur. Sıra ve kapsam
[YOL_HARITASI.md](YOL_HARITASI.md) içindedir; her sürüm başlamadan önce tek sayfalık planı onaylanır.
