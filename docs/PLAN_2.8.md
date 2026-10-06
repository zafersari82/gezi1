# 2.8 planı — Restoran, 2. parça

**Durum:** Onaylandı (2026-10-06); kodlama bu planla başlar. **Başlangıç:** `zafersari82/gezi1`,
`main`, kabul edilmiş 2.7.0 (813 test, 164 bozma maddesi). Kaynak kurallar:
[DEVIR_2.8.md](DEVIR_2.8.md), [PLATFORM_MIMARISI.md](PLATFORM_MIMARISI.md),
[YOL_HARITASI.md](YOL_HARITASI.md), [PLAN_2.6.md](PLAN_2.6.md), [PLAN_2.7.md](PLAN_2.7.md) ve
[KABUL_2.7.md](KABUL_2.7.md).

## Amaç ve değişmez sınırlar

2.8 restoranın eve teslim ve dış operasyonunu tamamlar; VADO yine Türkiye'ye uyarlanmış WeChat tipi
bir süper uygulamadır. Sipariş motoru restoran motoruna dönüşmez. Her ortak parçada soru şudur: **Bu
yetenek Market ve Mağaza'da da doğal çalışıyor mu?** Çalışmıyorsa çekirdeğe değil, ilgili pakete
veya restoran deneyimine aittir.

Teslimat ayrı motor değildir. Motorlar birbirini doğrudan çağırmaz; bileşim platform üzerinden olur.
`courier` Sipariş çekirdeğinin değil, teslimat sağlayıcısının kavramıdır. Konum platform servisi
adres ve hizmet bölgelerini bilir; Sipariş'e özgü teslimat ücreti ve minimum sepet kuralını bilmez.
**Canlı teslimat durumu GPS konumu değildir:** 2.8 yalnız durum adımlarını taşır; arka plan konumu,
kurye haritası ve sürekli GPS takibi bu sürümde yoktur.

## Beş ara sürüm

Çalışma tek seferde yapılmaz. Her ara sürümde kaynak arşivi üretilmeden önce temiz bir çalışma
alanında `npm ci` ve tam `npm run check` geçer; çalıştırılmayan deneme geçti sayılmaz.

1.  **2.7 bulguları + Konum servisi**

- Masa QR düğmesi yalnız yetkili role görünür; personel hem arayüzde hem API'de kullanamaz.
- Teslim/ileri saat gösteriminde şubenin saat dilimi açıkça yazılır.
- Motor-bağımsız Konum servisi: il → ilçe → mahalle adres modeli, müşteri adresleri, şube bazlı
  hizmet bölgeleri ve bölge eşleştirme sözleşmesi.

2.  **Eve teslim + kendi kurye**

- `ordering.delivery`: eve teslim fulfillment, bölgeye göre ücret, minimum sipariş ve tahmini
  teslim süresi.
- Platformdaki genel teslimat sağlayıcısı arayüzü; ilk uygulama işletmenin kendi kuryesi.
- Kurye hesabı = VADO hesabı + işletme üyeliği/yetkisi; atama, yola çıktı, teslim edildi ve
  müşteri canlı durum adımları.

3.  **Teşvik servisi**

- Platform Teşvik servisi: kampanya, kupon, sadakat.
- Eş zamanlı kullanımda atomik limitler; aynı kupon/ödül limit üstüne çıkamaz.
- Kampanya + kupon birlikte kullanımı işletme ayarıdır; varsayılan **birlikte kullanılamaz**.
- İndirim satırlara deterministik dağıtılır; indirim sonrası KDV görüntüsü ve kuruş yuvarlaması
  sunucuda hesaplanıp test edilir.
- Sadakat puanı yalnız tamamlanan siparişte kazanılır; iptal/iade kazanılan puanı geri alır,
  harcanan puanı iade eder; bütün adımlar atomiktir.

4.  **Ortak servisler + sipariş yaşam döngüsü**

- Değerlendirme, favoriler ve var olan Sohbet servisine müşteri–işletme kanalı.
- Tekrar sipariş güncel katalog/fiyat/bulunurlukla yeni sepet kurar; eski sipariş görüntüsünü
  kör kopyalamaz.
- Duruma/role göre iptal kuralları ve kapıda ödeme iade kayıtları.
- Değerlendirme yalnız tamamlanan siparişe, sipariş başına bir kez yapılır; iptal edilen sipariş
  değerlendirilemez; moderasyon var olan şikayet altyapısına bağlanır.

5.  **Mevzuat + ürün deneyimi + kapanış**

- Kapıda nakit/kart; online ödeme açılmaz.
- Mesafeli satış ön bilgilendirmesi ve restoran deneyiminde hemen tüketilen yiyecek cayma
  istisnası.
- İşlemsel/ticari ileti ayrımı; kampanya bildirimi İYS iznine bağlıdır, işlemsel sipariş
  bildirimi bundan etkilenmez.
- Kapalı şubede ileri sipariş işletme ayarı; varsayılan geriye uyumlu biçimde kapalı.
- Müşteri ve VADO Business ekranları, uçtan uca senaryolar, mimari denetim, belgeler ve sürüm
  2.8.0.

## Konum servisi ve adres verisi

Platform Konum servisi motor bağımsızdır: il, ilçe, mahalle, adres ve hizmet bölgesi. Sipariş paketi
bu servisin verdiği bölgeyi kendi ücret/minimum tutar kuralıyla yorumlar; Konum servisine Sipariş
fiyat mantığı sızmaz.

Türkiye adres veri paketinin sahibi 2026-10-06 tarihinde veri setini kendisinin derlediğini ve VADO
için kullanım, değişiklik ve dağıtım izni verdiğini beyan etti. Veri seti platformun Konum servisine
aktarılabilir; uygulama kodu veri dosyasının biçimine bağımlı olmayacaktır. Veri setinin sahiplik ve
izin kaydı [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) dosyasında açıkça tutulur.

## Eve teslim ve teslimat sağlayıcısı

`ordering.delivery` Sipariş alanını genişleten bir yetenektir. Şube + adres + zaman için uygun
bölgeyi platform Konum servisinden alır; bölge bazlı teslimat ücreti, minimum sepet ve tahmini
süreyi uygular. Teslimat ücreti sipariş anlık görüntüsüne girer.

Platformda genel bir teslimat sağlayıcısı sözleşmesi bulunur. İlk sağlayıcı işletmenin kendi
kuryesidir. Kurye atama/değiştirme ile `atandı → yola çıktı → teslim edildi` akışı sürümlü ve eş
zamanlılık korumalıdır. Müşteri durum adımlarını canlı görür. GPS/harita/arka plan konum izni
yoktur.

Kurye KVKK sınırı: müşteri adresi ve izin verilmiş telefon numarası yalnız sipariş o kuryeye atanmış
ve teslim edilmemişken görülebilir. Atama kaldırılınca veya sipariş teslim edilince erişim sona
erer. Bu kural servis katmanı, RLS/bileşik kapsam ve doğrudan SQL/bozma testleriyle korunur.

## Teşvik, fiyat ve sadakat

Teşvik platform servisidir; Sipariş, Rezervasyon ve İş Talebi aynı sözleşmeyi kullanabilir.
Kampanya/kupon/sadakat rezervasyonu ve tüketimi atomiktir.

- Kampanya + kupon birlikte kullanım kuralı işletme ayarıdır; varsayılan kapalıdır.
- İndirim satırlara deterministik dağıtılır; toplam kuruş kaybı/üretimi olmaz.
- KDV, indirim sonrası satır tutarı üzerinden doğru görüntülenir; siparişte değişmez anlık görüntü
  saklanır.
- Eşit bölüşüm, tek kuruş artığı ve farklı KDV oranları test edilir.
- Sadakat kazanımı yalnız sipariş tamamlandığında kesinleşir.
- İptal/iade kazanılmış puanı geri alır; harcanmış puanı geri verir; tekrar olayları çift etki
  üretmez.

## Değerlendirme, favoriler, sohbet, tekrar sipariş, iptal/iade

Değerlendirme ve Favoriler platform servisidir. Değerlendirme yalnız doğrulanmış tamamlanmış işlem
bağlamıyla açılır; sipariş başına tek kayıt; iptal edilmiş sipariş reddedilir. Şikayet/moderasyon
var olan platform şikayet altyapısını kullanır.

Müşteri–işletme mesajlaşması için yeni restoran sohbeti yazılmaz; var olan Sohbet servisinde işletme
kanalı kullanılır ve `businessCustomerId`/işletme kapsamı korunur.

Tekrar sipariş eski satırları güncel katalog, seçenek, fiyat ve bulunurlukla yeni sepete dönüştürür.
İptal kuralları aktör + sipariş durumu + açık paket durumuna göre açıkça tanımlanır. Kapıda ödemede
iade gerçek banka hareketi değildir; sebep, tutar, aktör ve zamanla denetlenebilir iade kaydıdır.

## Restoran dışı mimari kanıt

Kabul testinde restoran yetenekleri kapalı, mağaza benzeri bir Sipariş uygulama örneği oluşturulur.
Bu örnek:

- Konum servisi üzerinden eve teslim bölgesini,
- `ordering.delivery` üzerinden eve teslimi,
- Teşvik servisi üzerinden kuponu,
- platform Değerlendirme servisini

restoran paketi, masa, mutfak, garson veya restoran SQL işlevi açmadan kullanır. Bu test
Market/Mağaza'nın Sipariş motorunu çatallanmadan kullanabildiğinin somut regresyon kanıtıdır.

## Mimari denetim

2.8 bitmeden Sipariş çekirdeğinde restoran/kuryeye özgü kavram kalmayacak. Özellikle bugünkü
`apps/api/src/modules/ordering/fulfilment.ts` içinde restoran yeteneklerini ve
`restaurant_fulfilment_allowed` işlevini doğrudan tanıyan kontrol ayrıştırılacak. Çekirdek yalnız
genel fulfillment doğrulama sözleşmesini bilir; masa, mutfak, garson, kurye gibi kavramlar
paket/sağlayıcı/deneyimde kalır.

Otomatik mimari kural en az şu kavramların Sipariş çekirdeğine sızmasını yakalar: `restaurant`,
`table`, `waiter`, `kitchen`, `courier`. Yanlış pozitif üretmemesi için izin verilen paket bağlayıcı
dosyaları açıkça sınırlandırılır.

## Güvenilirlik ve kapanış

Bütün yeni işletme tablolarında `business_id`, gereken yerde şube/uygulama bağlamı, bileşik yabancı
anahtarlar, RLS + FORCE RLS ve `vado_app` rolüyle doğrudan SQL testleri zorunludur. Idempotency,
optimistic locking ve transactional outbox mevcut kurallarla sürer.

Kapanışta:

- mevcut 813 test korunur ve sayı artırılır;
- bozma kataloğu 164'ün üstüne çıkar;
- kupon limit yarışı, sadakat çift olayı, kurye atama yarışı, KVKK erişim sınırı, iptal/iade ve RLS
  gerçekten bozularak yakalanır;
- 390×844, 768×1024, 1440×900 tarayıcı senaryoları;
- keşiften tekrar siparişe müşteri E2E ve kabulden teslimata işletme E2E;
- zayıf ağ, kopma, cevap kaybı, çift dokunma, ters sıralı yanıt;
- gerçek 2.7→2.8 geçiş, ikinci migrate ve yedekten 2.7 geri dönüş;
- belgeler: CHANGELOG, SECURITY, API, YAYIN, MIMARI, PLATFORM_MIMARISI, YOL_HARITASI, README,
  restoran işletme belgesi ve THIRD_PARTY_NOTICES;
- sürüm yalnız belirlenmiş VADO sürüm alanlarında 2.8.0 yapılır; kilit dosyası `npm install
  --package-lock-only` ile üretilir.

Docker motoru bu çalışma ortamında yoksa imaj/Compose denemesi **denenmedi** yazılır ve Claude
tarafından ayrıca çalıştırılır.

**Pilot yoktur.** 2.8.0 sonunda yalnız kısa ara cihaz listesi hazırlanır: sürüm sahibinin telefonu
ve bir tablet üzerinde ses, uyku/Wake Lock, push, kamera, QR ve kopma sonrası canlı durum
toparlanması. Sonraki sürüm 2.9 Rezervasyon motorudur; 2.8 içinde başlanmaz.
