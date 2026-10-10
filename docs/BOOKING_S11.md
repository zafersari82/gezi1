# VADO S11 — Ortak Rezervasyon Çekirdeği (geliştirme adayı)

## Kaynak ve sınırlar

S10 `VADO_2.8_A1_S10_Shops_Tam_Kaynak.zip` bütün dosyaları korundu. Yeni rezervasyon motoru mevcut **Claude A1 tenant/RLS mimarisine** bağlandı; restoran sipariş motoru klonlanmadı. S11 kişisel hizmet, koltuk, oda veya uzman bazında randevuya yöneliktir. **Personel vardiyası/görev takip sistemi değildir.** Rezervasyon bedeli sadece gösterilir; **bu aşamada ödeme alınmaz**.

### Müşteri akışı

- Beauty ve education kategorisi işletme profilinde **Randevu al** butonu.
- Aktif işletme/şube, aktif hizmet ve kaynak seçenekleri, şubenin saat diliminde 30 günlük plan, 15 dakikalık artışlarla saat seçimi.
- Hizmetin süre ve fiyatı müşteri tarafından görüldüğü değerle kıyaslanır; farklıysa `record_version_conflict`.
- Rezervasyonlar sunucuda saklanır; son kayıtları **Randevularım** bölümünde görüntüleme, gelecekteki onaylı rezervasyonu iptal edebilme.
- `requestKey` aynı rezervasyon isteğini tekrarlayan bağlantı/çift dokunuşta ikinci kayıt oluşmasını önler. Aynı anahtar farklı talep için kullanılırsa `idempotency_conflict`.
- Müsaitlik 30 dakika öncesine kadar gösterilmez; son kontrol onay sırasında yeniden yapılır.

### İşletme akışı

- Business → **Randevular**: sahip ve yöneticiler hizmet adı, 15–240 dk süre, fiyat, etkinlik; şubeye bağlı kaynak ve haftalık uygun saat girer.
- Gelen randevuların durumu ve fiyatı görünür; iptal ve zamanı gelen randevunun tamamlanması işlenebilir.
- İşletme üyeliği her istekte mevcut `authorise` ve `withTenant` kontrolünden geçer.
- Çalışan vardiya veya görev çizelgesi oluşturulmaz.

### Veritabanı

`apps/api/migrations/0030_booking.sql`:

- `booking_services`, `booking_resources`, `booking_resource_hours`: şube/kaynak/haftalık uygunluk.
- `booking_reservations`: müşteri kimliği ve fiyat/hizmet adı anlık görüntüsü, durum, sürüm ve isteğe özgü anahtar; kullanıcı verileri RLS ile korunur.
- `booking_resource_busy`: **müşteri kimliği, telefon veya ad içermeyen** doluluk yansıtması. Herkes diğer müşterilerin rezervasyon detaylarına erişemez; ancak aynı kaynağın dolu saati hesaba katılır.
- Transaction-scoped `pg_advisory_xact_lock` ile rezervasyon/iptal yarışlarında aynı kaynak işlem sırasına alınır. İşletmenin hizmet fiyatı ve kaynak saat güncellemesi de aynı kilit uzayını kullanır.
- İkinci rezervasyon, SQL tetikleyicisinde de çakışma kontrolünden geçer. Silinen rezervasyon yerine durum değişikliği yapılır; iptal, yerin yeniden boşalmasını sağlar.
- Müşterinin salt okuyabildiği hizmet/kaynak üzerinde `FOR SHARE`/`FOR UPDATE` kullanılmaz: PostgreSQL bunlar için UPDATE yetkisi ve UPDATE RLS şartı uygular.

### API

**Müşteri (oturum gerekir):**

- `GET /v1/businesses/:businessId/booking/catalog`
- `GET /v1/businesses/:businessId/booking/slots?branchId=&serviceId=&resourceId=&day=YYYY-MM-DD`
- `POST /v1/businesses/:businessId/bookings`
- `GET /v1/businesses/:businessId/bookings/mine`
- `PUT /v1/businesses/:businessId/bookings/:id/status` (yalnız kendine ait gelecekteki rezervasyonu iptal)

**Business (sahip/yönetici):**

- `GET /v1/business/:businessId/bookings/setup`, `GET /v1/business/:businessId/bookings`
- `POST /v1/business/:businessId/bookings/services|resources`
- `PUT /v1/business/:businessId/bookings/services/:id`, `PUT .../resources/:id`
- `PUT /v1/business/:businessId/bookings/resources/:resourceId/hours`
- `PUT /v1/business/:businessId/bookings/:id/status`

Business Next proxy için istek izin listesi `apps/business/lib/request-policy.ts` içinde sınırlandırılmıştır.

### Eski örnek mini uygulama

`miniapps/appointment` daha önce sabit saatlerle **cihaz içi sahte rezervasyon onayı** yazıyordu. Bu kaldırıldı. Paket önizleme olarak açıkça etiketlendi, gereksiz ödeme/depolama izinleri manifestten çıkarıldı; gerçek rezervasyon **mobil işletme profili üzerinden** oluşturulur. Mini uygulamanın aynı rezervasyon motoruna bağlanacak güvenli kabuk köprüsü **sonraki iş**. Bu ara sürümde mini uygulamada ödeme/rezervasyon varmış gibi gösterilemez.

### Denenen ve denenmeyen

- Denendi (2.8.0-alpha.5, PostgreSQL 16, `vado_app`/`vado_platform` rolleriyle RLS altında): `apps/api/test/booking.test.ts` — hizmet/kaynak oluşturma, kamuya açık katalog, saat seçimi, yeni rezervasyonda ve aynı istek anahtarıyla tekrarda 201, anahtar çakışması, başka müşterinin rezervasyonunun gizlenmesi, başka kullanıcının durum değiştirememesi, iptalle saatin yeniden açılması, eşzamanlı iki HTTP isteğinden yalnız birinin başarılı olması, değişen fiyatın reddi, geçersiz hizmet sözleşmesi. `0030_booking.sql` temiz kurulumda ve 2.7.0 şemasından yükseltmede uygulanır.
- Denenmedi: telefonda rezervasyon, Business rezervasyon ekranının tarayıcıda kullanımı, yaz saati geçişi (Türkiye 2016'dan beri yaz saati uygulamıyor; şube başka saat diliminde açılırsa önem kazanır).

### Eksikler / kabul öncesi zorunlular

1. Android/iOS + küçük ekran Business arayüzü; saat dilimleri, yaz saati geçişleri, yeniden deneme ve ağ kopması senaryoları.
2. Gerçek randevu mini uygulaması: işletme kapsamında güvenli mini-app SDK köprüsü ve yetkili sunucu randevusu; kabuğu atlayan kişisel bilgi erişimi olmamalı.
3. İşletme başına rezervasyon politikaları (iptal süresi, ara süreler, tatil/özel gün, no-show), bildirim/outbox ve işletme müşterisi listesinde düzgün kimlik gösterimi.
4. İşletme kategorisi/farklı sektör açılışı için yayımlama akışını tamamlamak. Bu ilk sürüm özellikle `beauty` ve `education` profil butonuna bağlıdır.

**Sonuç:** S11, 2.8.0-alpha.5 ara sürümüne girdi; telefonda denenmeden kabul edilmiş sayılmaz.
