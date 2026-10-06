# 2.7 kabul kanıtları

Kabul edilen 2.6.0 tabanı 763 test ve 133 bozma maddesidir. Bu teslimin gerçek
sonuçları `VADO_2.7.0_dogrulama.zip` içindeki JSON sonuçları ve tam günlüklerle
birlikte değerlendirilir.

- Tam `npm run check`: **813 test**: 144 sözleşme, 13 SDK, 571 API, 6 Business,
  78 mobil ve 1 Restoran; biçim/lint/kurallar/tip ve üretim derlemeleri geçti.
- Bozma: **164/164** gerçek başarısız testle yakalandı; eski 133 madde korunur.
  Kaynak geri yükleme ve ana kaynakla SHA256 eşitliği doğrulandı.
- Tarayıcı: **31 kontrol** (8 müşteri/işletme, 16 ortak mutfak, 7 son inceleme regresyonu); üç boyut,
  gerçek yavaş ağ, çift dokunma, kopma, kayıp yanıt, ters yanıt ve 103 iş geçti.
- Gerçek 2.6→2.7 geçiş/yedekten geri dönüş: **11 kontrol** geçti.
- Gerçek Compose CLI modeli: **8 kontrol** geçti; Docker motoru çalıştırılmadı.

## Tekrarlanabilir doğrulama

- Kaynak ZIP boş klasöre açılır; `npm ci`, ardından gerçek PostgreSQL ve ayrı
  `vado_app`, `vado_platform`, `vado_owner` rolleriyle tam `npm run check` çalışır.
  Biçim, lint, proje kuralları, tip, bütün testler ve üretim derlemeleri kapsanır.
- Bozma kataloğu eski 133 maddeyi korur. Yeni 14 işletme tablosunda FORCE RLS,
  kapalı şube, karar gerekçesi, aktif masa kapanışı, ortak cihaz/işletme askısı,
  müşteri replay yalıtımı, seçenek sınırı, sipariş/ödeme sürümü, QR, gerçek FIFO ve
  yabancı bağlam, sepet bırakma/CAS/checkout korunması, ücretsiz hesap ve masa
  etiketi korumaları eklenir. Her madde gerçek başarısız testle yakalanır;
  yalnız import veya koşum hatası başarı sayılmaz. Dosya baytları her deneme sonunda
  geri alınır, SHA256 kaydı tutulur.
- Chromium'da 390×844, 768×1024, 1440×900: imzalı QR → ürün seçeneği/not → sunucu
  sepeti → kabul/ETA → hazırlık → çağrı/hesap → fiziksel ödeme → masa kapanışı.
  Gerçek paket yükleme/ayrı onay, gerçek SDK ve mobil sipariş köprüsü, yalıtılmış
  paket çerçevesi ve Next Business kullanılır. API/ödeme/menü yanıtı taklit edilmez.
- Zayıf ağda 400 ms gecikme, 500/100 kbit indirme/yükleme; çift dokunma, müşteri ve
  mutfak bağlantı kopması, sunucuda tamamlanıp yanıtı kaybolan checkout, aynı
  anahtar/gövdeyle yenilemede kurtarma ve `cart_changed` açık onayı sınanır.
- Ortak tablet beş dakikalık kodla gerçek yönetici onayı alır; kişisel oturumsuz
  dar yetki, HttpOnly/Secure/Strict çerez, uzaktan kapatma, 103 işin sayfalaması,
  çevrimdışında gelen yeni iş, geç gelen eski HTTP yanıtı ve ret gerekçesi sınanır.
- Son incelemedeki yedi üretim hatası beş yeni API testi ve yedi gerçek tarayıcı
  senaryosuyla korunur: canlı açıklık/tükenme, geçersiz saatli sepeti bırakma,
  şube yükleme/kayıt yarışı, ücretsiz sipariş, bildirim hedefi, ilk bağlantı
  hatasından toparlanma ve mutfakta doğru masa etiketi.
- Gerçek 2.6 API'de eski hesap/oturum/işletme/şube/yetenek ve sipariş oluşturulur;
  rol kurulumu, 0014–0017 geçişi, ikinci migrate, FORCE RLS ve olay geri doldurma
  denetlenir. `pg_dump` yedeği ayrı veritabanına yüklenir; özgün 2.6 API aynı hesabı,
  oturumu ve siparişi kabul eder. İki dosya deposunun içeriği korunur.

## Ortam ve açık denemeler

Bu ortamda Docker motoru yok. Compose modeli gerçek Compose CLI ile doğrulanır;
**2.7 imaj derleme/çalıştırma ve Compose servis denemesi kullanıcı talimatıyla
Claude'a bırakılmıştır.** API, Business ve Portal Dockerfile'ları yeni Restoran
çalışma alanının paket tanımını da içerir. Üç veritabanı bağlantısı ayrıdır.

Ses ilk dokunuşta gerçek AudioContext ile açılır. Başsız Chromium'da gerçek Wake
Lock isteği reddedildi; görünür hata/destek durumu denetlenir. Hedef fiziksel
tablette hoparlör sesi, ekranın uyumaması ve görünürlük dönüşü ayrıca denenmelidir.
Tarayıcı kabuk denemesi önceden yetkilendirilmiş test hesabı/izin kullanır; gerçek
telefon kamerası, native izin ekranları ve APNs/FCM teslimi bu ortamda denenmedi.

Testler gerçek PostgreSQL 16 üzerinde çalışır. Ortamın süreç uyarısı boş stderr
bekleyen eski CLI testlerini etkilediğinden `NODE_NO_WARNINGS=1` kullanılır; ürün
testi, lint veya tip kuralı susturulmaz. Overlay dosya sistemindeki PostgreSQL
genişletme hatası nedeniyle geçici test kümesi tmpfs üzerindedir; aynı SQL/roller ve
paralel testler kullanılır. Kaynakta geçici test kimlikleri veya gerçek anahtar yoktur.

Sürüm değişimi yalnız VADO'nun dokuz paketinin `version` alanında, API/mobil ürün
sürümünde yapılır; kilit dosyası npm ile üretilir. İki Vite uygulamasında
`@vitejs/plugin-react` 6.1.1'e sabittir. Eski üçüncü taraf paket sürümleri korunur;
yeni QR tip paketi `@types/qrcode` 1.5.5'tir. İlk Restoran paket manifesti 1.0.0'dır.

Son incelemede iki küçük bulgu ertelendi: ileri saat görüntüsünde şubenin saat
dilimi açık yazmıyor; staff rolü yetkisi olmayan Masa QR düğmesini görebiliyor.
Bütün inceleme kararları ve maliyetleri doğrulama ZIP’inin `INCELEME.md` dosyasındadır.
