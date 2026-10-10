# S4 — Sohbet içinde doğrulanmış zengin paylaşım kartları

## Temel ve mimari

S3'ün tam kaynak ZIP'i esas alınmıştır. Claude'un alpha.4 A1 mimarisi ve S1–S3 modülleri korunur. Yeni tablo, migration, mesaj türü, sohbet motoru ya da taklit API oluşturulmadı. Mesajlaşmanın mevcut `text` türü ve S3'ün `vado:///businesses/<uuid>` ile `vado:///miniapps/<slug>` bağlantıları kullanılmaya devam eder.

## Kullanıcı deneyimi

- Bir işletme veya mini uygulama S3 paylaşım seçicisinden gönderildiğinde mesaj kart olarak gösterilir.
- İşletme kartı, müşteri tarafından erişilebilir kayıt üzerinden **yayınlanan mağaza adı**, **logo**, **kısa tanıtım**, şehir ve doğrulama bilgisini alır.
- Mini uygulama kartı güncel ad, simge, açıklama ve doğrulama bilgisini alır.
- `Mağazayı aç` veya `Mini uygulamayı aç` mevcut uygulama içi yönlendirmeyi kullanır; işletmeye özel mini uygulama kimliği veya oturum belirteci paylaşılmaz.
- Kart yalnızca tek bir geçerli VADO paylaşımı içeren bir veya iki satırlı S3 mesajlarında gösterilir. Diğer sohbet mesajları, normal bağlantılar ve resimler değişmeden kalır.
- Gönderilmemiş veya yeniden gönderilmesi gereken mesajlar kart yerine mevcut mesaj balonu ve tekrar dene akışını kullanır.
- Kart verileri sunucudan okunamadığında devre dışı bir uyarı gösterilir; kalıcı/askıya alınmış hedeflere yetkiliymiş gibi yönlendirilmez.
- Gelen mesajların basılı tutma/şikayet akışı kartın yüklenme ve hata hallerinde de korunur.

## Güvenlik

- Mesajın içine yazılmış işletme adı **güvenilir değildir**, kart başlığı olarak kullanılmaz.
- Sunucu kaydının türü ve kimliği, mesajdaki doğrulanmış hedef ile eşleşmezse kart üretilmez.
- Önizleme sadece gösterim verilerini içerir. Özel mini uygulama `entryUrl`, kapsama ilişkin `scope`, işletme yönetim verileri, taslak medya kimlikleri ve oturum anahtarları karta aktarılmaz.
- Yalnızca var olan halka açık profil API'leri çağrılır: `GET /v1/businesses/:id` ve `GET /v1/miniapps/:id`. Erişilebilirlik ve yetki bu API'lerde tekrar doğrulanır.
- Tanınmayan uygulama içi URL, VADO imzalı işlem QR'ı veya ek parametre taşıyan bağlantı zengin karta dönüşmez.
- Başarılı kartın uygulama içinde açılması hedefin durumunu açılış akışında yeniden kontrol eder; kart önbelleği kalıcı yetki sağlamaz.

## Değişen dosyalar

- `apps/mobile/src/features/chat/message-bubble.tsx` — tek hedefli mesajların kart biçiminde görünümü.
- `apps/mobile/src/features/sharing/shared-target.ts` — saf paylaşım kartı hedefi ayrıştırıcısı.
- `apps/mobile/src/features/sharing/shared-preview-data.ts` — sunucu verisinden yalnızca açık kart alanlarını üreten güvenli dönüştürücüler.
- `apps/mobile/src/features/sharing/shared-preview.ts` — mevcut public API üzerinden kayıt okuma.
- `apps/mobile/src/features/sharing/shared-preview-card.tsx` — React Query önbelleği ve erişilebilir mobil kart.
- `apps/mobile/test/shared-preview.test.ts`, `apps/mobile/test/shared-preview-data.test.ts` — geçerli/geçersiz hedef, veri kaynağı ve hassas alan dışlama regresyonları.

## Denetim ve sınırlamalar

- Kaynak sözdizimi taraması, proje konvansiyon denetimi ve saf fonksiyonların bağımsız çalışma kontrolleri uygulanmıştır.
- Bu ortamda `npm ci --offline` eksik `@vitejs/plugin-react` arşivinde duruyor; Vitest, tam tip denetimi, Expo derleme, PostgreSQL, Docker, Android/iOS cihaz testleri **çalıştırılmış kabul edilmemelidir**.
- Ürün bağlantıları, randevu paylaşımı, HTTPS universal/app link ve web fallback henüz S4 kapsamında değildir. Bunlar sonraki aşamalar için ayrı kabul kriterleridir.
- Süper uygulama A2–A6 ana mimari/kabul planı henüz bitmemiştir. Claude'un A1 üzerinde yaptığı temizliği eski ZIP kodlarıyla geri almayın.

## Son kabulde yapılacaklar

1. S3 işletme ve mini uygulama bağlantılarının kart hâline geldiğini iki gerçek VADO hesabıyla sınayın.
2. Mesajın başlığını sahte işletme adıyla değiştirin; sunucu adı görüntülenmeye devam etmeli.
3. İşletmeyi askıya alın veya mini uygulamayı kapatın; kart açılmamalı.
4. Sohbet resmi, normal HTTP bağlantıları, başarısız gönderiyi yeniden deneme, QR ve mini uygulama başlatma akışlarını test edin.
5. `npm ci && npm run check`, iOS/Android ve ağ kesintisi kontrolleri yapın.
