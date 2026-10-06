# VADO Business

`apps/business`, Next.js ile çalışan işletme uygulamasıdır. Yerelde adresi
`http://localhost:3001`; `npm run dev` API ve VADO Control ile birlikte başlatır.
Telefon alt menüsü, tablet çalışma alanı ve masaüstü menüsü kurulu manifestlere göre modülleri sunar.

## Giriş ve yetki

Telefonuna gelen kodla **mevcut VADO hesabınla** giriş yap. İşletme sahibi, yönetici
ve personel üyeliklerin listelenir; çalışacağın işletmeyi seç. Üyeliğin yoksa işletme
sahibinden hesabını eklemesini iste. Control panelindeki yönetici hesabı bu girişte
kullanılmaz. Örnek veride Mehmet (`0555 000 00 02`, demo kodu `000000`) Kadıköy Berber'in
sahibidir. İşletmeye bağlı uygulama örneği, ürün ve şube başlangıçta boş olabilir.

| Modül      | İşler                                                                   | Yazma yetkisi             |
| ---------- | ----------------------------------------------------------------------- | ------------------------- |
| Siparişler | Canlı liste, ürün ve tutar görüntüsü, geçmiş, izinli durum geçişleri    | Sahip, yönetici, personel |
| Ürünler    | Ürün, kategori, seçenek grubu, seçenek bağlantısı, genel ve şube fiyatı | Sahip, yönetici           |
| Şubeler    | Adres, saat dilimi, etkinlik, haftalık ve geceye uzayan saatler         | Sahip, yönetici           |
| Ayarlar    | Kurulu uygulama seçimi, paket açma/kapama ve ayarlar                    | Sahip, yönetici           |

Personel ürün, şube ve paket ayarlarını okuyabilir; form kontrolleri ve API yazma
yetkisi ayrıca sınırlandırılır. Fiyatlar tam sayı kuruş olarak kaydedilir. Siparişin
durumu başka cihazda değişirse güncel kayıt yüklenir ve yeni geçişi tekrar seçersin.
Bağlantı tekrar kurulduğunda liste yenilenir.

Aktif ve hazırlık kuyrukları sunucuda, sayfalama öncesinde süzülür; yüz yeni kapanmış
siparişin gerisindeki bekleyen iş kaybolmaz. Daha eski sayfaları açtıysan canlı
yenileme onları da yeniden okur. Sayaçlar listelenen kayıtları sayar. Gecikmiş yanıt
yeni sipariş sürümünü veya seçimini geriye alamaz. Ürün değiştirdiğinde seçenek
seçimleri o üründen yüklenir; kayıttan sonra fiyat formları ve kalıcı seçenek
kimlikleri güncellenir.

## Paket ve sipariş akışı

Menü, sunucunun çözdüğü manifest bloklarından gelir. `ordering.preparation` açılırsa
ayarındaki adı taşıyan hazırlık kuyruğu eklenir; yeni siparişler hazırlama ve hazır
adımlarını kullanır. Paket kapatılırken bağımlılıklar, sürüm ve ayarlar doğrulanır.
Başlamış sipariş kendi akış görüntüsüyle tamamlanır.

Uygulama örneği mevcut işletme–mini uygulama–satıcı bağına bağlıdır. Örneği kurmak için
`POST /v1/business/:businessId/app-instances` kullanılır; [API](API.md) sözleşmesini
izleyin. Sipariş üreten entegrasyon sunucudaki sepet uçlarını veya SDK'nın sipariş
metotlarını kullanır. Müşteri sipariş ekranı `miniapps/restaurant` paketindedir; mevcut örnek randevu
uygulaması kendi ödeme akışını sürdürür.

## PWA ve yayın

Manifest, 192 ve 512 piksel simgeler ve service worker kurulu uygulama kullanımına
hazırdır. İnternet bağlantısı kesildiğinde bağlantı ekranı açılır. Çevrimdışı sipariş
düzenleme yapılmaz; özel sayfalar, sipariş yanıtları ve oturumlar önbelleğe yazılmaz.

Business sunucusunda `VADO_API_INTERNAL_URL` API'nin iç adresi,
`VADO_BUSINESS_PUBLIC_URL` tarayıcıdaki tam HTTPS adresidir. Business alan adını API'nin
`VADO_CORS_ORIGINS` listesine ekleyin. Üretimde HTTPS ve ters vekil kullanın; sertifika
Business alan adını da kapsamalıdır. Compose ve Nginx örnekleri `infra` klasöründedir.

Oturum sunucuda HttpOnly, Secure ve SameSite=Strict çerezde tutulur. Soket bağlantısı
60 saniye içinde bir kez kullanılabilen biletle açılır; en çok beş dakika veya VADO
oturumunun kalan süresi kadar sürer. Yenilemede üyelik yeniden doğrulanır. Canlı
olay yalnızca sipariş kimliği ve sıra bilgisini taşır; ayrıntı HTTP üzerinden okunur.

## Restoran modülleri

`ordering.kitchen` gerçek tablet mutfağını, `ordering.table_service` masa/çağrı/hesabı
menüye ekler. Sipariş kararında tahmini süre/ret gerekçesi, ayrıntıda seçenek/not ve
tahsilat bilgisi bulunur. Şubelerde hazırlık/ileri saat/tarihli istisna, ürünlerde
şube tükenme ve saatli menü yönetilir. Sahip/yönetici Cihazlar'dan mutfak tabletini
eşleştirip uzaktan kapatır. Hesapsız tablet `/kitchen-pair` ve `/tablet` yolunu
kullanır; dar yetkisi sunucuda her işlemde doğrulanır. Kurulum ve günlük iş için
[RESTORAN_2.7.md](RESTORAN_2.7.md) belgesini izleyin.
