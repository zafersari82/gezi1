# VADO Business Chat — S2 (Claude A1 + S1 tabanlı geliştirme adayı)

## Amaç

Müşteri işletme profilinden **İşletmeye mesaj gönder** seçeneğiyle VADO'nun mevcut sohbet ekranını açar; işletme sahibi/yönetici ise telefon tarayıcısından VADO Business > Mesajlar'da konuşmayı okur ve yanıtlar. Müşterinin çalışanları rehberine eklemesi gerekmez. Bir işletme ve müşteri çifti için yalnızca bir konuşma vardır.

## Mimari

- Mevcut `conversations`, `conversation_members`, `messages`, `realtime` ve bildirim altyapısı korunur. Yeni ikinci bir mesaj deposu bulunmaz.
- `conversations.kind = business` eklenmiştir. İşletme/müşteri ilişkisi `business_chat_threads` ile tanımlanır. Müşteri tek kişisel sohbet üyesidir; işletme çalışanı üye yapılmaz.
- Açılış API'si: `POST /v1/businesses/:businessId/chat`. Sadece etkin/doğrulanmış işletme kabul edilir. İşletme ve müşteri çifti işlem bazlı kilitle tekleştirilir.
- İşletme API'leri: `GET /v1/business/:businessId/chats`, `GET/POST /v1/business/:businessId/chats/:conversationId/messages`, `POST /v1/business/:businessId/chats/:conversationId/read`.
- İşletme verilerine erişim sunucuda `businessManagement.authorise` ve `withTenant` ile her istekte denetlenir. Gelen kutusu **yalnız owner/manager** rolüne açıktır. Genel `staff` izinleri şube kapsamlı olduğundan müşterinin özel mesajları personele açık değildir.
- Yeni tablo zorunlu RLS, müşteri ve işletme bazlı ayrı SELECT, INSERT ve UPDATE politikaları kullanır. Kaynak sohbet konuşmasıyla müşteri kimliğinin eşleşmesi DB tetikleyicisinde doğrulanır.
- Yanıt idempotenttir; aynı `clientId` / aynı metin aynı mesajı döndürür; farklı konuşma veya metin çakışması reddedilir. Müşterinin gönderimi için mevcut çekirdek aynı güvenlik kontrolünü kullanır.
- Müşterinin görünür yanıtında çalışanın özel hesap kimliği gizlenir. İşletme cevabının push başlığı çalışan adı değil işletme adıdır.
- İşletme cevabı müşterinin açık uygulamasına gerçek zamanlı iletilir. İşletme tarafındaki gelen kutusu ilk sürümde **manuel yenileme** kullanır.

## Bilerek eklenmeyenler

Otomatik yanıt, toplu reklam mesajları, fotoğraf/dosya ve işletme sohbeti için medya, şube personeline özel `business_chat.read/reply` yetkisi, işletme tarafı canlı push/Socket, müşteri engelleme ve ticari ileti onayı yönetimi S2 içinde **tamamlanmış sayılmaz**. İşletme sohbetinde fotoğraf düğmesi bilinçli olarak kapalıdır. Kişisel sohbetin resim özelliği değişmemiştir.

## Kabul kriterleri ve test gereksinimleri

1. Aynı müşteri aynı işletmede ikinci sohbet oluşturamamalı; kişi olma şartı bulunmamalı.
2. Müşteri mesajı işletmenin gelen kutusunda görünmeli; işletme yanıtı müşterinin VADO sohbetinde görünmeli.
3. İşletme yöneticisinin mesajı müşteriye kişisel hesap bilgisi olarak görünmemeli.
4. Başka işletmenin sahibi, yabancı kullanıcı ve genel personel aynı konuşmayı görememeli.
5. Aynı `clientId` tekrarında mesaj çoğalmamalı; farklı içerik veya konuşma reddedilmeli.
6. Müşteri işletme sohbetinde resim gönderememeli; kişisel sohbet resim göndermeye devam etmeli.
7. Pasif işletmenin yeni sohbet açılışı ve yanıtı engellenmeli; işletme üyeliği iptal edilmiş kişi erişememeli.
8. Eski birebir/grup sohbet testleri değişmeden geçmeli; yeni migrasyon eski A1 `0022–0028` geçmişini yeniden yazmamalı.
9. Business web telefon ekranında küçük genişlikte yatay kaydırma olmadan kullanılabilmeli.

## Doğrulama durumu

- Denendi (2.8.0-alpha.5, PostgreSQL 16, `vado_app`/`vado_platform` rolleriyle RLS altında): `npm run check` (biçim, lint, kurallar, tip denetimi, bütün testler, derleme); `apps/api/test/business-chat.test.ts`; eski birebir ve grup sohbet testleri değişmeden geçiyor; `0029_business_chat.sql` temiz kurulumda ve 2.7.0 şemasından yükseltmede uygulanır.
- Denenmedi: telefonda işletme sohbeti, Business gelen kutusunun küçük ekranda kullanımı.

### Uygun ortamda sırasıyla

```bash
npm ci
npm run check
# Aşağıdaki PostgreSQL adımı için ayrı test veritabanı ve uygun roller gereklidir.
npm run test -w @vado/api -- --run business-chat.test.ts
```

Mevcut üretim veritabanına migrasyon uygulamadan önce yedek ve geri alma planı hazırlayın. `0029_business_chat.sql` yalnız S1'in `0028_business_channels.sql` migrasyonu da uygulandıktan sonra çalıştırılmalıdır.
