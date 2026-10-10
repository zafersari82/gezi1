# 2.8 planı — Restoran 2. parça ve süper uygulama temeli

**Durum (10.10.2026):** Sürüm sahibi işi bütünüyle Claude'a devretti. Bu belge, teslim alınan
`2.8.0-alpha.3` kaynağının gerçek ortamda denenmesine ve satır satır okunmasına dayanır. 7.10.2026'da
onaylanan kapsam (eve teslim, kendi kurye, teşvik, değerlendirme ve favoriler, tekrar sipariş,
işletme sohbeti, iptal ve iade, kapıda ödeme, mevzuat) geçerlidir. Pilot kapısı kaldırılmıştır:
sektör başına pilot yoktur (bkz. [PLATFORM_MIMARISI.md](PLATFORM_MIMARISI.md)).

## 1. Teslim alınan kaynak gerçekte ne durumda

Önceki çalışma ortamında npm ve PostgreSQL çalışmadığı için kaynak hiç derlenmemiş ve sınanmamıştı.
Boş klasörde ilk kez çalıştırıldı:

| Adım               | Sonuç                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `npm ci`           | geçti (kilit dosyası tutarlı, `sharp` dahil)                                                            |
| Biçim (`prettier`) | 105 dosya biçimsiz                                                                                      |
| ESLint             | 159 hata (97'si otomatik düzelir)                                                                       |
| Tip denetimi       | 6 hata (sözleşmeler, API, Business)                                                                     |
| Testler            | 976/982 geçti: sözleşmeler 168/168, SDK 17/17, API 671/675, Business 15/17, mobil 101/101, restoran 4/4 |
| Derleme            | Business derlenmiyor (1 tip hatası); diğerleri derleniyor                                               |

Sonuç: kod büyük ölçüde çalışıyor; eksikler mekanik. Asıl sorunlar aşağıdaki mimari bulgulardır.

### Korunacak iyi kararlar

Davet belirtecinin yalnız özetinin saklanması ve adresin `#` kısmında taşınması; `sharp` ile
EXIF/GPS temizliği, boyut sınırı ve WebP'ye yeniden yazma; işletme başına medya kotası ve satır
kilidi; silinecek dosyalar için kalıcı kuyruk; filtreye bağlı imleçli sunucu araması ve Türkçe harf
sadeleştirmesi; RLS'yi açmadan keşif için tek yönlü okuma izdüşümü; belirsiz uygulama örneğinde 404;
taslak ile yayının ayrı tutulması.

## 2. Mimari bulgular

1. **Sipariş çekirdeği restorana bağlı (devir notundaki mimari denetim geçmiyor).** `carts` ve
   `orders` tablolarında `table_session_id`; sipariş sözleşmesinde `tableSessionId`, `tableLabel`;
   sipariş servisinde `kitchen` rolü dalları; köprüde `ordering.getRestaurant`, `getTable`,
   `joinTable`, `requestService`; SQL'de durum grafiği işlevi bütün paket adlarını biliyor ve beş
   kez üst üste yeniden tanımlanmış. Bu hâliyle Market ve Mağaza çatallanmadan taşınamaz.
2. **Yetki dağınık.** Beş ayrı izin tablosu (şube stok, bölge stok, şube sipariş, bölge sipariş,
   davet bayrakları), her biri kendi SQL'iyle. Her yeni modül (rezervasyon, iade, kampanya) iki tablo
   daha ekleyecek. Ayrıca **geçişte sessiz kırılma** var: 2.7'de personel siparişleri görüp
   işleyebiliyordu; yeni kodda hiçbir izin taşınmadığı için 2.8'e geçen restoranın garsonu siparişleri
   göremez.
3. **Şemada yamalar.** Ad değiştirip sarmalama (`ordering_legacy_graph_allowed`,
   `ordering_pre_returns_graph_allowed`, `restaurant_legacy_fulfilment_allowed`); Studio tablosu beş
   ardışık ALTER ile kurulmuş; şablon kimlikleri veritabanı CHECK listesinde (her yeni şablon bir
   şema dosyası); değerlendirme ve iade kuralları `incentive_*` ve `location_*` adlı yardımcıları
   kullanıyor (modüller birbirinin adına bağımlı); tek satıra sıkıştırılmış okunmaz SQL.
4. **Konum iki yerde yarım.** Şubede serbest metin adres ve sonradan eklenen yalnız il/ilçe; teslimat
   ise mahalle bazlı hizmet alanı kullanıyor. Şubenin tek, yapılandırılmış bir adresi yok.
5. **Yarım özellik varmış gibi görünüyor.** Rezervasyon motoru yokken güzellik şablonları kayıtta
   seçilebiliyor.
6. **Ekranı olmayan servisler.** Teslimat bölgeleri ve ücretleri, kampanya/kupon/sadakat, kurye
   atama: API var, Business'ta ekran yok. Kuryenin hiç ekranı yok. Müşteri tarafında adres, teslimat
   ücreti, kupon ve puan ekranı yok. Bu hâliyle eve teslimi gerçek bir kişi kullanamaz.
7. **Eksik kapsam.** İşletme sohbet kanalı, mesafeli satış ön bilgilendirmesi ve onay kanıtı, ticari
   ileti izinleri ve İYS, satıcının yasal kimlik bilgileri.
8. **Belge dağınıklığı.** Kökte 16 `STUDIO_*.md`, `DEVAM_NOTU.md`, `KONTROL_VE_TESLIM.md`;
   CHANGELOG'da on dört ayrı "alpha.3" girdisi. Zip'teki mimari belge, pilotun kaldırıldığı ve
   sektörlerin motorlara bire bir bağlı olmadığı kararlarından önceki sürüm.

## 3. Kararlar

**K1. Şema.** `0001–0017` (2.7.0) ve `0018–0021` (doğrulanmış alpha.3) değişmez. `0022–0035` hiçbir
veritabanında çalışmadı; silinir ve alanlara göre temiz, okunur dosyalar olarak `0022`'den yeniden
yazılır. Üst üste sarmalanmış işlevler yeni dosyada tek gövdeye indirilir, eski sarmalayıcılar
kaldırılır. Her dosya tek bir konuyu anlatır; SQL okunur biçimde yazılır.

**K2. Tarafsız Sipariş çekirdeği.** Çekirdek yalnız şunları bilir: işletme, şube, uygulama örneği,
`businessCustomerId`, sepet, satır, seçenek, fiyat görüntüsü, teslim biçimi kodu, istenen zaman,
durum grafiği, tutar/KDV/indirim, ödeme kaydı, karar gerekçesi, tahmini hazır olma.

- Masa oturumu bağı çekirdek tablolardan masa servisi paketinin kendi tablolarına taşınır (veri
  geçişiyle).
- `kitchen` rolü genel **operasyon cihazı** rolüne dönüşür; restoranda "Mutfak ekranı" adıyla
  görünür. Aynı cihaz modeli markette toplama ekranı, otelde resepsiyon ekranı olur.
- Teslim biçimleri (gel-al, eve teslim, masaya servis) paket kaydıdır. Çekirdek bir biçimin adını
  bilmez; doğrulama, ücret ve görüntü paketin politikasındadır.
- Durum grafikleri sahibi `vado_owner` olan değişmez bir katalog tablosundan gelir. Her paket kendi
  satırını kendi şema dosyasıyla ekler. Veritabanı koruması sürer, ama çekirdek SQL hiçbir paket adı
  içermez.
- Köprü: `ordering.getRestaurant` yerine genel `ordering.getStore`; masa çağrıları `tableService.*`
  ad alanına geçer. Dışarıda mini uygulama yok (yayın öncesi); geçiş CHANGELOG'da yazılır.
- **Kalıcı denetim:** proje kuralları betiği, çekirdek dosyalarda masa, mutfak, garson, kurye, restoran
  kavramı görürse hata verir. Devir notundaki "gösterin" şartı böylece her derlemede sınanır.
- **Kanıt:** restoran paketleri kapalı bir mağaza örneği gel-al ve eve teslim, kupon, sadakat,
  değerlendirme ve iadeyi gerçek HTTP ve SQL üzerinden baştan sona kullanır.

**K3. Tek yetki modeli.** Roller: sahip, yönetici (işletme geneli), personel (yalnız verilen izinler),
kurye (ayrı üyelik).

- İzinler sözleşmelerde tek katalogdur. Her platform servisi ve paket kendi izinlerini Türkçe adıyla
  ve geçerli kapsamlarıyla bildirir. İlk izinler: `orders.view`, `orders.manage`,
  `catalog.availability`, `delivery.dispatch`, `reviews.reply`, `chat.reply`, `reports.view`.
- Tek tablo: üye + izin + kapsam (işletme geneli, bölge ya da şube). Bölgeler ve şube–bölge bağı ayrı
  kalır.
- Tek karar noktası: TypeScript'te `authorize(scope, izin, şube)`, SQL'de aynı kuralı uygulayan tek
  işlev. Liste filtreleri ve RLS bunu kullanır.
- Davet, verilecek izinlerin listesini taşır.
- **Geçiş:** 2.7'deki her etkin personele işletme genelinde `orders.view` ve `orders.manage` verilir.
  Böylece hiçbir restoran yükseltmede iş kaybetmez; sahip sonra daraltır.
- Bölge müdürü = bölge kapsamlı izinleri olan personel. Kurumsal hiyerarşi böylece yeni tablo
  açmadan bütün modüllere uzanır.

**K4. Konumda tek kaynak.** Şubenin yapılandırılmış adresi: il, ilçe, mahalle (Türkiye kataloğundan),
açık adres. Eski serbest metin, sahip doldurana kadar yalnız gösterim için kalır; tahmin yapılmaz.
Keşif izdüşümü bu adresten türetilir. Teslimat uygunluğu müşterinin seçtiği adresin mahallesi ile
şubenin teslimat bölgelerinden hesaplanır:

- Keşfette "Adresime teslim edenler" süzgeci.
- Mini uygulamada sepetten önce uygunluk denetimi.
- Müşteri için doğru şubenin seçimi; fiyat ve katalog o şubenin bağlamından gelir.

**K5. Studio.** Şablonlar sözleşmelerdeki kayıttan gelir ve sektör deneyimine bağlıdır. Motoru
yayında olmayan sektörün şablonu sunulmaz (güzellik 2.9 ile açılır). Veritabanı şablon kimliğini
yalnız biçim olarak denetler. Vitrin tasarımı tek tabloda taslak + yayın görüntüsü olarak, şemayla
doğrulanmış sürümlü bir belgedir. Medya, kota ve silme kuyruğu tasarımı korunur.

**K6. Değerlendirme, favori, iade.**

- Değerlendirme yalnız tamamlanmış ve müşteriye ait siparişe, sipariş başına bir kez yapılır.
  İşletme yanıt verir; moderasyon şikâyet altyapısından geçer.
- İşletme profilinde ve keşifte puan ortalaması ile değerlendirme sayısı görünür.
- Favoriler sayfalı; satıştan kalkan ürün "şu an satışta değil" diye görünür.
- Kural yardımcıları platform adlarıyla tanımlanır (`tenant_customer_actor`, `tenant_member_can`).

**K7. İşletme sohbet kanalı.** Var olan sohbete yeni bir tür eklenir: müşteri ↔ işletme.

- Müşteri işletmenin adını ve logosunu görür.
- İşletme müşterinin yalnız kısaltılmış adını (ör. "Ayşe K.") ve sipariş bağlantılarını görür;
  telefon ve kullanıcı kimliği asla görünmez.
- `chat.reply` izni olan üyeler işletme adına yazar; yazan kişi denetim kaydında tutulur.
- İşletme sohbeti yalnız bir sipariş üzerinden başlatabilir (işlemsel). Ticari ileti sohbetten
  gönderilmez.

**K8. Mevzuat (Türkiye).**

- **Satıcının yasal profili:** ticari unvan ya da ad soyad, VKN/TCKN (maskeli gösterim), vergi
  dairesi, MERSİS (şirketlerde), açık adres, telefon, e-posta, isteğe bağlı KEP. Bu profil
  tamamlanmadan uzaktan sipariş açılmaz.
- **Ön bilgilendirme formu ve mesafeli satış sözleşmesi:** sunucuda, sürümlü şablondan üretilir;
  satıcı bilgisi, ürünler, KDV dahil toplam, teslimat ücreti, kapıda ödeme ve teslim koşullarını
  içerir. Cayma hakkı metni pakete göre seçilir: çabuk bozulan yiyecekte istisna, mağaza ürününde
  14 gün.
- **Onay kanıtı:** müşteri ödemeden önce onaylar. Sipariş metnin özetini, sürümünü ve kendisini
  değişmez saklar; müşteri sipariş ayrıntısında her zaman görür. Metin değişmişse `cart_changed`
  döner.
- **Ticari ileti izni:** işletme ve kanal (push, SMS, e-posta) bazında, değişmez kayıt defteri
  olarak tutulur. İşlemsel bildirim izin gerektirmez ve reklam içeremez.
- **İYS:** SMS, e-posta ve arama izinleri İYS sağlayıcı arayüzü üzerinden eşlenir. Sağlayıcı
  yapılandırılmamışsa bu kanallardan ticari ileti gönderilmez. Push için İYS kaydı gerekmez, ama
  ayrı onay gerekir; push onayı SMS onayı sayılmaz.
- **Kapsam dışı (açıkça yazılır):** e-Arşiv/e-Fatura. Ödeme kapıda yapılır; belgeyi işletme kendi
  düzenler.

**K9. Ekranlar.** Eve teslimi gerçek bir kişi baştan sona kullanabilmelidir.

- **Business:**
  - teslimat bölgeleri (mahalle seçimi, ücret, en az tutar, süre);
  - kampanya, kupon ve sadakat;
  - kurye kuyruğu ve atama, kuryenin "Teslimatlarım" ekranı;
  - mesajlar;
  - yasal bilgiler;
  - tek yetki ekranı (Ekibim + Bölgeler).
- **Müşteri:**
  - adres seç ve ekle (il, ilçe, mahalle, açık adres, bina/kat/daire, tarif);
  - teslim biçimi; ücret, en az tutar, süre;
  - kupon ve puan;
  - ön bilgilendirme onayı;
  - canlı teslimat durumu;
  - "İşletmeye yaz";
  - değerlendirme, favori, iade, tekrar sipariş.
- **VADO uygulaması:**
  - konumlu Keşfet;
  - puanlı işletme profili;
  - Sohbetler'de işletme sohbetleri;
  - Ayarlar'da işletme bazında ileti izinleri.

**K10. Belgeler.** Kökteki `STUDIO_*`, `DEVAM_NOTU`, `KONTROL_VE_TESLIM` belgeleri `docs/`
altında konu başına birleşir: `STUDIO.md`, `YETKI.md`, `KESIF.md`, `MEVZUAT.md`. CHANGELOG'daki
alpha.3 girdileri tek "2.8.0" girdisinde toplanır. Mimari belgeye pilot ve sektör bileşimi kararları
geri konur.

## 4. Türkiye ayrıntıları (kabul listesi)

**Adres ve konum**

- Adres: il / ilçe / mahalle kataloğu (81 il, 973 ilçe, 73.496 mahalle; MIT, sabit sürüm), cadde ve
  sokak, bina no, kat, daire, adres tarifi.
- Konum için GPS istenmez.

**Saat ve takvim**

- Saat dilimi `Europe/Istanbul`; şube saat dilimi açıkça yazılır.
- Bayram ve özel gün saatleri (var olan istisna tablosu).

**İletişim ve arama**

- Telefon `+90 5xx` biçiminde.
- Türkçe arama: İ/ı/I/i, ç/ğ/ö/ş/ü sadeleştirmesi.

**Para ve vergi**

- Tutarlar kuruş tamsayısıdır; "₺1.234,50" biçiminde gösterilir.
- KDV oranları %0 / %1 / %10 / %20.
- İndirim satırlara kuruş kuruş dağıtılır; KDV indirimli tutardan hesaplanır.

**Ödeme**

- Ödeme kapıda nakit ya da POS ile alınır; tahsil eden kişi ve referans kaydedilir.
- Online ödeme yoktur.

**Mevzuat**

- Mesafeli Sözleşmeler Yönetmeliği: ön bilgilendirme, sözleşme, cayma istisnası, kalıcı kopya.
- 6563 sayılı Kanun ve İYS: ticari ileti izni, ret hakkı, işlemsel ileti ayrımı.
- KVKK: işletme müşterinin telefonunu görmez. Kurye adresi ve telefonu yalnız atanmışken ve teslimden
  önce görür.

## 5. Ara sürümler

Her ara sürüm boş klasörde `npm ci` + `npm run check` geçmeden verilmez. Her birinde gerçek sayılar ve
"denenmedi" listesi yazılır.

| #   | İçerik                                                                                                              | Kabul                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A1  | K1 şema yeniden yazımı, K3 tek yetki modeli, K4 şube adresi, K5 Studio şeması, K10 belgeler; bütün kontroller yeşil | 2.7.0 veritabanından geçiş: personel siparişleri görmeye devam eder; RLS doğrudan SQL ile |
| A2  | K2 tarafsız Sipariş çekirdeği, köprü/SDK ad alanları, kalıcı denetim, mağaza kanıtı                                 | Denetim betiği çekirdekte restoran kavramı bulmaz; mağaza yolculuğu geçer                 |
| A3  | Eve teslim ve teşvik ekranları (Business, kurye, müşteri), konumlu keşif, şube seçimi                               | Tarayıcıda sipariş → atama → yola çıktı → teslim → tahsilat                               |
| A4  | Değerlendirme, favori, iade, tekrar sipariş ekranları; K7 işletme sohbeti                                           | Yetkisiz üye yazamaz; işletme telefon/kimlik göremez (API, soket, SQL)                    |
| A5  | K8 mevzuat: yasal profil, ön bilgilendirme ve sözleşme, onay kanıtı, ileti izinleri, İYS arayüzü                    | Değişen metinde `cart_changed`; izinsiz ticari ileti gönderilemez                         |
| A6  | Kapanış                                                                                                             | Aşağıda                                                                                   |

**Mağazam:** telefondan kod yazmadan dükkân kurma adımları (M1–M9) ve A2'den sonraki sıra
[PLAN_MAGAZAM.md](PLAN_MAGAZAM.md)'dedir. A3'ün teslimat bölgesi ekranı M4'te, A5'in mevzuat
çekirdeği M3'te yapılır.

**Kapanış (A6):**

- Bozma denemesi 164'ün üstüne çıkar; yeni korumaların her biri için gerçek bozma kanıtı.
- Müşteri, restoran ve kurye yolculukları 390×844, 768×1024 ve 1440×900'de tarayıcıda.
- Yavaş 3G, bağlantı kopması, çift dokunma; eş zamanlı kupon, puan, iade ve atama.
- 2.7.0 → 2.8.0 geçişi ve yedekten geri dönüş, üç veritabanı rolüyle.
- Docker imajları (`sharp` dahil) ve Compose.
- Sürüm `2.8.0`, ardından `npm install --package-lock-only`.
- **Ara cihaz denemesi listesi:** sürüm sahibinin telefonu ve bir tablet; ses, uyku, push, kamera,
  QR.

## 6. 2.8'de olmayanlar

- Online ödeme, GPS ve canlı kurye konumu, dış kurye ağı.
- Vardiya ve görev yönetimi.
- e-Arşiv/e-Fatura.
- ERP/CSV toplu aktarım.
- Yapay zekâ ile ürün listesi önerisi, sürüm sahibinin sağlayıcı kararına kadar
  ([PLAN_MAGAZAM.md](PLAN_MAGAZAM.md), MK7).
- Ücretli sıralama.
