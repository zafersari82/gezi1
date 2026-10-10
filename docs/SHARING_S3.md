# VADO S3 — Sohbet, Mağaza, Mini Uygulama ve QR Bağlantıları

## Kaynak

Bu geliştirme **VADO_2.8_A1_S2_Business_Chat_tam_kaynak.zip** paketinden türetilmiştir. Eski 2.8 alpha.3 ZIP'lerinden kod taşınmamıştır. Mevcut sohbet motoru, QR imzalama sistemi, VADO Search ve mini uygulama kabuğu yeniden yazılmamıştır.

## Bu aşamada hazırlanan akışlar

1. Sohbette, mesaj yazma alanındaki **Paylaş** düğmesinden işletme veya mini uygulama aranır. Arama `/v1/discovery/search` üzerinden, 20'şer sayfalık sunucu yanıtlarıyla çalışır. Kullanıcının seçtiği konum işletme aramasına uygulanır. Seçilen hedef sohbetin mevcut metin mesajı kuyruğuna eklenir.
2. Sohbet balonu VADO bağlantısını bulur ve **uygulama içinde** ilgili herkese açık profil/mini uygulama ekranına yönlendirir. Normal HTTP/HTTPS bağlantılarının mevcut davranışı korunur.
3. İşletme profilinin başlık alanında mağaza paylaşımı/QR ekranı açılır. Mini uygulama üst çubuğuna aynı işlem eklenmiştir.
4. Paylaşım ekranı hedefi sunucudan yeniden okur; QR üretmeden önce gerçekten erişilebilir olduğundan emin olur. QR kodu, kopyalama ve sistemin yerel paylaşım menüsü kullanılabilir.
5. QR okutma ekranı VADO'nun herkese açık bağlantılarını da okuyabilir. Eski `vado://q/` **imzalı** QR akışı aynen devam eder.

## Paylaşım biçimi

- İşletme: `vado:///businesses/<uuid>`
- Mini uygulama: `vado:///miniapps/<slug>`

Bu bağlantılar **yalnızca herkese açık navigasyon kimliği taşır**. İşletme adına işlem, ödeme, mini uygulama izni, imzalı QR parametresi, şube seçimi veya yönetici oturumu taşımaz. Hedef ekranlar kayıt durumunu mevcut API üzerinden yeniden kontrol eder.

Mini uygulama kimliği UUID **değildir**; `miniAppIdSchema` ile uyumlu kısa ad kullanır. Özel işletmeye bağlı mini uygulama örneğinin (tenant/app-instance) bağlamı **paylaşılan mini uygulama URL'sinden türetilmez**. Böyle bir bağlantı gerektiğinde hedef işletme profiline yönlendirilip mevcut `/launch` akışından yeni doğrulanmış bağlam alınmalıdır.

## Eklenen/değişen yerler

- `apps/mobile/src/features/sharing/`: doğrulanan URL biçimi ve merkezi yönlendirme.
- `apps/mobile/src/app/(app)/chat/[id]/share.tsx`: sohbet içinde sunucu aramasıyla seçim.
- `apps/mobile/src/app/(app)/share-target.tsx`: QR, kopyala ve sistem paylaşımı.
- `apps/mobile/src/features/chat/composer.tsx`: Paylaş düğmesi.
- `apps/mobile/src/features/chat/message-bubble.tsx`: uygulama içi VADO bağlantıları.
- `apps/mobile/src/app/(app)/scan.tsx`: salt navigasyon QR URL'leri.
- `apps/mobile/src/app/(app)/businesses/[id].tsx`: işletme QR ekranı.
- `apps/mobile/src/features/miniapps/mini-app-host.tsx`: mini uygulama paylaşımı.
- `apps/mobile/src/app/(app)/_layout.tsx`: yeni ekran kayıtları.
- `apps/mobile/test/shared-target.test.ts`: hedef şeması ve güvenli bağlantı testleri.

## Güvenlik sınırı

Bir mesaj içinde yazılan VADO bağlantısına güvenilip herhangi bir özel API işlemi yapılmaz. Desteklenmeyen şemalar (`javascript:`, özel admin URL'leri ve imzalı QR gibi) paylaşım bağlantısı olarak işlenmez. Kullanıcı etkileşimiyle yalnızca var olan herkese açık ekranlar açılır. İmzalı QR içerikleri sunucuda doğrulanmaya devam eder.

## Bilerek tamamlanmamış işler

- Ürün/sipariş/randevu için özel zengin kart, önizleme resmi ve sunucu imzalı bağlam;
- İşletmeye özel mini uygulama oturumunun mesaj yoluyla paylaşılması;
- Uygulama yüklenmemiş cihaz için HTTPS universal/app link ve web fallback;
- Gerçek cihazda Android/iOS QR ve dış paylaşım denemeleri;
- S3 için tam lint, TypeScript workspace tip kontrolü, Vitest ve Docker/PostgreSQL kabul testleri.

### Kabul senaryoları

1. İki kişi arasındaki sohbette işletme seçilip gönderilir; alan kişi dokununca doğru işletme açılır.
2. Mini uygulama _slug_ kimliğiyle paylaşılır; doğru uygulama açılır.
3. İşletme/mini uygulama QR'ı okutulunca doğru ekran açılır; eski imzalı QR akışları bozulmaz.
4. Kaldırılmış işletme/mini uygulama doğrudan gizli bir işleme erişim vermez; ekran sunucudan yüklenemediğini belirtir.
5. Diğer işletmenin özel şube/app-instance bilgisi linkten erişilemez.
6. Çok sayfalı arama ve konum seçimi çalışır.
7. Kişisel sohbet, iş sohbeti, resim gönderme ve mini uygulama kabuğunun mevcut testleri geçer.
8. Temiz `npm ci && npm run check` ve gerçek cihaz testleri son kabulde başarılıdır.
