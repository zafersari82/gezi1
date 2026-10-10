# VADO 2.8 — Mobil personel daveti (geliştirme adayı)

## Kullanıcı deneyimi

1. İşletme sahibi Business → **Ekibim** ekranından çalışanın telefon numarasını, en fazla 20 aktif şubeyi ve gerekli en dar izinleri seçer.
2. **Davet bağlantısı oluştur** düğmesi 72 saat geçerli, tek kullanımlık bir bağlantı üretir. Bağlantı yalnızca oluşturma yanıtında görülür; sonra tekrar gösterilmez. Sistem otomatik SMS veya WhatsApp mesajı göndermez. Sahip bağlantıyı kendisi güvenli bir kanaldan iletir.
3. Çalışan bağlantıyı telefonunda açar. VADO'ya telefon numarasıyla giriş yapar; hesapta doğrulanmış telefonun davetteki numarayla birebir eşleşmesi gerekir.
4. Çalışan işletmenin adını, izin verilen şubeleri ve yetki kapsamını görür; **Daveti kabul et** düğmesine basınca üyelik etkinleşir. Kabul öncesinde işletme verileri için herhangi bir erişim verilmez.
5. İşletme sahibi bekleyen daveti iptal edebilir. Davet süresi dolarsa veya kullanılırsa bağlantı tekrar kullanılamaz. Yetki kaldırma mevcut Ekibim ekranından yapılır.

## Güvenlik ve veri modeli

- Davet belirteci 256-bit rastgele üretilir. Veritabanında yalnız SHA-256 özeti saklanır; istemcide adresin **fragment** (`/join#token`) kısmındadır, HTTP sorgu parametresinde değildir.
- Daveti yalnız işletme sahibi oluşturur/iptal eder. **Davet yalnız `staff` üyeliği verir**; merkezi yönetici/işletme sahibi/kurye yetkisi vermez.
- Şube kimlikleri işletme kapsamıyla ve aktif şube kontrolüyle doğrulanır; her davet ilgili işletmeye bağlıdır. Bölge izinleri, fiyat değiştirme ve başka şube yetkileri verilmez.
- Üyelik, izinler ve davetin tüketilmesi **tek PostgreSQL transaction** içinde tamamlanır. `FOR UPDATE` kilidi aynı davetin çift kabulünü ve iptal/kabul yarışını engeller.
- Daha önce aktif üyeliği bulunan kullanıcıya davet verilmez. Etkin olmayan eski `staff` üye kabul ederse eski delegasyonlar silinerek yalnız yeni seçilen izinler verilir. `owner`/`manager` üyelikleri davet yoluyla değiştirilmez.
- HTTP üyelik güncelleme yolu artık mevcut olmayan kullanıcıyı işletmeye yeni üye olarak ekleyemez; yeni kişi katılımında onay gerekir.
- `0032_business_staff_invitations.sql`: işletme kapsamlı davet tablosu, şube eşleme tablosu, RLS ve erişim kısıtları.
- `0031_business_order_access.sql`: önceden bozuk olan iki RLS `current_setting` ifadesinin kaynak SQL'i onarıldı. Bu düzeltme önceki sürümün başarıyla uygulandığı varsayılmadan yapılmıştır.

## Kod konumları

- Sözleşme: `packages/contracts/src/business-management.ts`
- Ortak işletme servisine bağlı davet işlemleri: `apps/api/src/modules/business-management/staff-invitations.ts`
- Rotalar: `apps/api/src/modules/business-management/business-management.routes.ts`
- Ekibim ekranı: `apps/business/components/team-view.tsx`
- Kabul ekranı: `apps/business/app/join/page.tsx`, `apps/business/components/join-invitation.tsx`
- Üyelik gerektirmeyen fakat **oturum gerektiren** kabul vekili: `apps/business/app/api/invitations/route.ts`
- Test kaynakları: `apps/api/test/staff-invitations.test.ts`, `apps/business/test/business-input.test.ts`

## Bilinen sınırlar

- Davet için otomatik SMS/e-posta teslimi yoktur. Personel davetinin aynı VADO telefon hesabına bağlanması gerekir.
- Kurumsal SSO, toplu davet, personel e-posta daveti ve daha ayrıntılı rol hiyerarşisi bu aşamanın dışında kalır. **Vardiya ve görev planlama geliştirme kapsamından çıkarıldı.**
- PostgreSQL, Docker, gerçek cihaz, Vitest ve tam tip/derleme kabulü bu paket için henüz tamamlanmamıştır.
