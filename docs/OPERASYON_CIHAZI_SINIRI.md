# Operasyon cihazı — sipariş görünürlüğü (A2-2c)

**Durum (10.10.2026):** Kaynağa işlendi, PostgreSQL ve uygulama testleri henüz çalıştırılamadı.

## İlke

Bir operasyon cihazı, yalnız yetkilendirildiği işletme, şube ve mini uygulama örneğine bağlı
siparişlere erişir. Ayrıca siparişin oluşturulduğu anda sabitlenmiş `orders.capabilities`
listesinde, katalogdaki `device_statuses` alanı boş olmayan etkin bir operasyon paketinin
sürümü bulunmalıdır. Bugün desteklenmeyen bir paketin siparişi, aynı şubede olsa bile cihazın
görebileceği sipariş değildir. Sonradan paket açılması eski siparişlere cihaz yetkisi vermez.

Bu koşul bir sektör adından veya paket kimliğinden türetilmez. Tek SQL yardımcı işlevi:
`apps/api/src/core/operation-device-order.ts` içindeki `supportsOperationDevice`.

## Yetkinin uygulandığı yollar

- Sipariş listesi, kuyruk, ayrıntı ve durum değiştirme:
  `apps/api/src/modules/ordering/ordering.service.ts`.
- Geçmiş canlı olaylar: `apps/api/src/core/live-replay.ts`.
- Socket.IO operasyon cihazı bildirimi: `apps/api/src/core/restaurant-live.ts`
  içindeki teslimat süzgeci. İşletme personeli ve müşteriye giden bildirimler etkilenmez.
- Cihaz belirteci, işletme/şube/örnek etkinliği ve cihazın iptal/süre denetimi
  `operation-devices.service.ts` ile `tenant-scope.ts` içinde ayrıca sürer.
- `tenant-scope.ts`, `vado.user_id` ve işlem-yerel `vado.tenant_device_id` ile
  kişisel aktörün cihazla, iki farklı cihazın birbiriyle iç içe işlem paylaşmasını reddeder.

## Regresyon senaryosu

`apps/api/test/kitchen-devices.test.ts`, aynı şube ve aynı uygulama örneğinde paket açılmadan
önce verilmiş bir sipariş ile paket açıldıktan sonra verilmiş başka siparişi kurar. Eski
siparişin cihaz ayrıntısı, listesi, canlı olay tekrarı ve durum değiştirme uçlarında
engellenmesini; yeni siparişin listede ve canlı olaylarda görünmesini denetler.

**Sınırlar:** Otomatik senaryo ve SQL koşulu yazılmıştır, fakat `npm ci` bu ortamda
sonuçlanmadığından test **geçmiş olarak kabul edilmez**. `npm run check` ve gerçek
PostgreSQL yükseltmesi başarılı olana kadar A2-2c tamamlanmış sayılamaz.

## SQL işlemindeki cihaz kimliği

Bir sipariş değişikliğinin `device` aktörüyle işlenebilmesi için `vado.order_actor_id`
ile `withTenant` tarafından kurulmuş `vado.tenant_device_id` aynı olmalı ve
`vado.user_id` boş kalmalıdır. `append_order_change` ve `incentive_lifecycle`
bu sınırı birbirinden bağımsız uygular. Cihazın etkinliği, şube/uygulama
örneği ve siparişin paket görüntüsü ayrıca doğrulanır.

## Soket bileti sınırı

`operation_device_tickets` ekleme tetikleyicisi, `vado.tenant_device_id` değerinin
hedef cihazla ve `vado.business_id` değerinin işletmeyle eşleşmesini; `vado.user_id`
değerinin boş olmasını zorunlu tutar. Bu işlem için doğrulanmış cihaz kapsamı
`withTenant` tarafından oluşturulur. Biletin tüketilmesi ayrı platform işlemiyle
yapılır. Tek kullanımlık hak `UPDATE ... RETURNING` ile atomik alınır;
eşzamanlı tüketimde yalnız bir bağlantı başarılı olabilir. Cihaz doğrulaması
başarısız olursa bütün işlem geri alınır ve bilet tüketilmiş sayılmaz. Süre
sınırı `clock_timestamp()` ile gerçek saat üzerinden değerlendirilir.
Aynı işletmenin iki cihazı ve işletme üyesi için negatif, doğru cihaz ve
iki eşzamanlı bilet isteği için regresyon testleri eklendi; çalıştırma
PostgreSQL test ortamını gerektirir.
