# 2.6 kaynak teslimi ve deneme kaydı

Tarih: 2026-10-06. Temel, Claude'un düzelttiği
`VADO_2.6.0-alpha.4_duzeltilmis.zip`; düzeltmeler CHANGELOG'da korundu.
Node.js 22.23.3, PostgreSQL 16.14, Next.js 16.3.8, Chromium 153 kullanıldı.

| Deneme                                               | Kayıt                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Düzeltilmiş alpha.4 ZIP, boş klasörde npm ci + check | Geçti; 724 test                                                           |
| Alpha.5 ZIP, boş klasörde npm ci + check             | Geçti; 739 test                                                           |
| Son kaynak ZIP, boş klasörde kurulum                 | Teslim kapısı; gerçek kayıtlar ayrı doğrulama ZIP'inde                    |
| Business tarayıcı senaryoları                        | Geçti; 31 kontrol, üç ekran boyutu                                        |
| Gerçek 2.5 → 2.6 geçiş ve yedekten geri dönüş        | Geçti; 25 kontrol                                                         |
| Bozma denemeleri                                     | 110 eski + 23 yeni; tam koşum ve tekrar kayıtları ayrı doğrulama ZIP'inde |
| Docker Compose yapılandırması                        | Geçti; 8 kontrol, Compose 2.39.4                                          |
| Docker imajı ve Compose servis başlangıcı            | Bu ortamda çalıştırılamadı                                                |

Tarayıcı boyutları **390×844, 768×1024, 1440×900**. Her boyutta mevcut VADO hesabıyla
giriş, etkin üyelik seçimi, HttpOnly/Secure/Strict çerez, tek kullanımlık soket bileti,
canlı sipariş ve durum geçişi, ürün/fiyat kaydı, şube kaydı, paket formu ve menü,
yabancı işletmenin reddi, CSRF, PWA simgeleri, çevrimdışı ekran ve çıkış denendi.
Geciktirilen ilk şube yanıtının yeni şubenin saatlerine yazılması ayrıca denendi; hata düzeltilip aynı senaryo yeniden geçti. Ekranlarda yatay taşma ve uygulama hatası yoktu; ekran görüntüleri görsel olarak
incelendi. Next.js üretim sunucusu, API'nin demo/test yapılandırmasıyla çalıştı.

Son inceleme sonrası dokuz senaryo daha eklendi: ürünler arasında kirli seçenek
seçiminin taşınmaması; ikinci grup kaydında seçenek kimliği ve açık sepetin
korunması; iki fiyat formunda ardışık kayıt; geciken sipariş listesi, ayrıntısı ve
durum yanıtı; 101 yeni kapanmış kaydın gerisindeki aktif ve hazırlık işi; canlı
yenilemede eski sayfaların korunması. Beş önemli bulgu tek turda düzeltildi.
Her davranış gerçek tarayıcıda önce başarısız, sonra başarılı senaryoyla doğrulandı.

Temiz arşiv kurulumu ve bozma sonuçları kaynak arşivinden ayrı
`VADO_2.6.0_dogrulama.zip` içindedir. `sonuclar/temiz-kurulum` klasöründe gerçek
`npm ci` ve tam `npm run check` kayıtları ile çıkış kodları; `sonuclar/bozma`
klasöründe her denemenin kaydı ve birleştirilmiş sonuç; `sonuclar/ozet.json`
dosyasında sayılar ve kaynak ZIP'inin SHA-256 değeri bulunur. Önceki geliştirme
klasörünün başarılı olması son arşivin denetimi yerine kullanılmaz. Test paketleri
137 sözleşme, 12 SDK, 535 API, 5 Business ve 74 mobil testten oluşur; toplam 763.

Geçiş ayrı, boş PostgreSQL kümesinde yapıldı: üç VADO rolü başlangıçta yoktu. Özgün
2.5 kaynağı yedi geçişi uyguladı; kullanıcı, oturum, işletme, mini uygulama ve satıcı
bağı oluşturuldu. API durdurulup gerçek `pg_dump` ve iki dosya deposu yedeği alındı.
Roller sıfırdan kuruldu, eski şema sahipliği taşındı, 0008–0013 uygulandı. 2.6 API
aynı hesabı ve oturumu kullandı; sahip üyeliği kuruldu, RLS ve yeni işlemler çalıştı.
Yedek başka veritabanına `pg_restore` ile döndü; gerçek 2.5 API aynı hesabı ve
oturumu yeniden açtı. Yeni 2.6 tabloları geri dönüş veritabanında bulunmadı.

Docker için gereken kernel yetkileri bu ortamda yok: etkili ve bağlı yetkiler sıfır,
mount ve kullanıcı namespace denemeleri `Operation not permitted` verdi. Docker
imajları ve Compose'un gerçek servis başlangıcı **başarılı sayılmadı**. Bu adım,
[YAYIN.md](YAYIN.md) komutlarıyla Docker çalıştırabilen sınama sunucusunda tamamlanmalıdır.
Bu kayıt Docker üzerinden üretim kabulünün tamamlandığı anlamına gelmez.

Yayımlanmış 0001–0012 dosyaları değiştirilmedi. Sürüm yükseltmesi yalnız VADO paket
tanımlarındaki `version` alanlarında yapılır; kilit dosyası
`npm install --package-lock-only` ile üretilir. Üçüncü taraf
`@vitejs/plugin-react` sürümü 6.1.1 olarak korundu. Dağıtım arşivleri boş klasöre
açılarak doğrulanır; geliştirme klasörünün denetimi tek başına arşiv kanıtı sayılmaz.

Kilit dosyasındaki 1077 üçüncü taraf paket sürümü değişmedi. 0001–0012, özgün 2.5
git ağacı ve her ilgili teslim ZIP'iyle; 0001–0011 ayrıca Claude'un düzelttiği
alpha.4 ZIP'iyle bayt düzeyinde karşılaştırıldı. On iki dosya aynı bulundu.

İnceleyenin değerlendirmediği konularda 2.7 kapsamı korundu; gerçek iOS/cihaz
arka planı ve canlı üretim sağlayıcıları doğrulanmış sayılmadı. Ayrı doğrulama
arşivinin `INCELEME.md` belgesi beş bulguyu, kırmızı/yeşil kanıtları ve bütün
kararların yanlış olması halinde yapılması gereken işi kaydeder. Ertelenen küçük
inceleme bulgusu yoktur.
