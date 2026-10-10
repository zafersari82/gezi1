# S7 — İşletme sohbetinde özel sipariş kartı (geliştirme adayı)

## Ne yapıldı?

- Müşteri mevcut Business Chat içinde **son 20 kendi siparişini** seçip mesaj bağlantısıyla paylaşabilir. Sipariş paylaşımına kendi isteğiyle başlar; otomatik reklam ve otomatik durum mesajı gönderilmez.
- Mesaj biçimi `Siparişim\nvado:///orders/{conversationId}/{orderId}`. Bağlantıda tutar, müşteri telefon numarası, erişim token'ı veya ödeme bilgisi yer almaz. Yeni mesaj türü ya da ayrı sipariş/messaging motoru yoktur.
- Mobil kart yalnız **mevcut konuşmanın müşterisi** için yetkili API'den okunur. Açık kart ve detay ekranı 30 saniyede bir durumu yeniden sorgular; ayrıca elle yenileme mümkündür. Bu sürekli bağlantı veya garanti anlık bildirim değildir.
- Business gelen kutusunda işletme **sahibi/yöneticisi** müşteri kartının güncel durumunu görüntüleyebilir. Personel erişimi genişletilmedi.
- Gösterilen sınırlı veri: sipariş ID, işletme/şube ID, şube adı, durum, toplam tutar, para birimi ve zamanlar. Başka müşterinin telefon/adres/ödeme verileri dönmez.
- Yeni SQL migrasyonu yoktur; var olan `business_chat_threads`, `orders`, `business_customers`, `branches` tabloları ve onların RLS kapsamı kullanılır.

## API

- `GET /v1/conversations/:conversationId/orders` — sohbet müşterisinin ilgili işletmedeki **son 20 siparişi**.
- `GET /v1/conversations/:conversationId/orders/:orderId` — sohbet müşterisinin seçili siparişi.
- `GET /v1/business/:businessId/chats/:conversationId/orders/:orderId` — işletme sahibi/yöneticisinin, o konuşmanın müşterisine ait siparişi.

Yetki anahtarı olarak mesaj metni veya gönderilen bağlantı kullanılmaz. Sunucu aktif oturumu, konuşmanın müşteri/işletme ilişkisini ve sipariş sahibini sorgular. Başka kullanıcı, başka konuşma veya başka işletmeden erişim reddedilmelidir.

## Kabul testleri — Claude'un son denetiminde

1. Uygun PostgreSQL'de boş tabandan `0029_business_chat.sql` dahil A1 + S1–S6 migrasyonlarını uygulayın; S7 yeni migrasyon gerektirmez.
2. `apps/api/test/business-chat-orders.test.ts` koşmalı: sahiplik, işletme yöneticisi, durum değişikliği, yanlış müşteri ve yanlış işletme.
3. `apps/mobile/test/shared-order-target.test.ts` koşmalı: geçerli/geçersiz bağlantılar, tek kart tanıma, token içeren URL reddi.
4. Müşteri A'nın sohbetindeki siparişini B müşterisi veya B işletmesinin yöneticisi açamamalı. Müşteri A'nın diğer işletmedeki siparişi de mevcut konuşmada açılamamalı.
5. İşletmenin `accepted` / `preparing` / `completed` durumları aynı kartta yenileme sonrası doğru görünmeli. Uygulama arka planda kaldığında bildirim gecikmesi garanti edilmez.
6. Mobil uygulama, Business PWA ve önceki S1–S6 mesaj/ürün bağlantıları uçtan uca sınanmalı. Otomatik bildirim ve kurye durum entegrasyonu bu aşamanın kapsamında değildir.

## Doğrulama sınırı

- Denendi (2.8.0-alpha.5, PostgreSQL 16, `vado_app`/`vado_platform` rolleriyle RLS altında): `apps/api/test/business-chat-orders.test.ts`, `apps/mobile/test/shared-order-target.test.ts` ve `npm run check`.
- Denenmedi: telefonda sipariş kartı paylaşımı, Business panelinde kart görüntüleme.
