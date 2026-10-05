# Türkiye'de mevzuat

Bu belge hukuki görüş değildir. VADO gibi bir uygulamayı Türkiye'de yayınlarken hangi kuralların
gündeme geldiğini, kodun bunlardan hangisini hazır karşıladığını ve hangisinin sizde kaldığını
gösteren bir başlangıç listesidir. 4 Ekim 2026 tarihinde, sonda listelenen kaynaklara bakılarak
yazıldı; mevzuat sık değişiyor. **Yayından önce bu listeyi bilişim hukuku bilen bir avukatla
gözden geçirin.**

## Özet

| Konu                              | Neden ilgilendirir                            | Kodda hazır olan                      | Sizde kalan                                |
| --------------------------------- | --------------------------------------------- | ------------------------------------- | ------------------------------------------ |
| KVKK (6698)                       | Telefon, mesaj, fotoğraf işliyorsunuz         | Onay kaydı, hesap silme, veri azaltma | Metinler, VERBİS, süreçler, sözleşmeler    |
| BTK: şebekeler üstü hizmet (5809) | Kişiler arası mesajlaşma sunuyorsunuz         | —                                     | Şirket, yetkilendirme değerlendirmesi      |
| 5651: yer sağlayıcı, sosyal ağ    | Kullanıcı içeriği barındırıyorsunuz ("Anlar") | Şikayet, engelleme, panel             | Bildirim, kayıt saklama, yaş doğrulama     |
| Ödeme hizmetleri (6493)           | Mini uygulamalar ödeme başlatıyor             | Yalnızca deneme ödemesi               | Lisanslı kuruluşla sözleşme ve entegrasyon |
| Ticari ileti, mesafeli satış      | İleride kampanya iletisi ve satış olursa      | —                                     | İYS, satıcı sözleşmeleri                   |

## 1. Kişisel verilerin korunması (KVKK)

Uygulamayı işleten şirket veri sorumlusudur.

### İşlenen veriler

| Veri                                                          | Neden                                          | Ne zaman silinir                                      |
| ------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| Telefon numarası                                              | Hesap ve giriş                                 | Hesap silinince                                       |
| Ad, VADO kimliği, hakkında, fotoğraf                          | Profil                                         | Hesap silinince                                       |
| Kişiler, istekler, engellenenler                              | Kişi listesi                                   | Hesap silinince                                       |
| Mesajlar ve gönderilen fotoğraflar                            | Sohbet                                         | Silinmez; karşı tarafta "Silinmiş Hesap" adıyla kalır |
| Paylaşımlar, beğeniler, yorumlar                              | Anlar                                          | Hesap silinince                                       |
| Oturum kayıtları (cihaz adı, cihaz kimliği, IP adresi, zaman) | Güvenlik, oturum yönetimi                      | Kapanan oturum 30 gün sonra                           |
| Doğrulama kodu kayıtları (numara, IP)                         | Kötüye kullanımı sınırlama                     | 1 gün sonra                                           |
| Ödeme kayıtları                                               | İşlem geçmişi                                  | Silinmez                                              |
| İşletme başvurusu (ad, vergi numarası)                        | İşletme hesabı                                 | Silinmez; hesap silinince işletme askıya alınır       |
| Şikayetler, denetim kaydı                                     | Kötüye kullanımla mücadele, hesap verebilirlik | Silinmez                                              |
| Sunucu günlükleri (IP adresi, zaman)                          | Güvenlik ve hata ayıklama                      | Sunucuda sizin belirlediğiniz sürede                  |

Uygulama telefon rehberini okumaz ve sunucuya yüklemez. Konum sunucuya gönderilmez; yalnızca
kullanıcının izin verdiği mini uygulamaya, yaklaşık (100 metre) olarak iletilir. Mini uygulama
izinleri ve mini uygulamaların cihazda sakladığı veriler yalnızca telefonda durur.

"Silinmez" yazan satırlar için saklama süresini hukukçunuzla belirleyin ve süre dolunca silen bir
görev ekleyin; kodda bu kayıtlar için otomatik silme yoktur (bkz. [YOL_HARITASI.md](YOL_HARITASI.md)).

### Kodun sağladıkları

- **Aydınlatma ve onay kaydı.** Kayıt ekranında Kullanım Koşulları ve KVKK Aydınlatma Metni
  okunabilir; onay kutusu işaretlenmeden hesap açılmaz. Onaylanan metnin sürümü ve onay zamanı
  hesapla birlikte saklanır (`terms_version`, `terms_accepted_at`).
- **Veri azaltma.** Telefon numarası başka kullanıcılara ve mini uygulamalara gösterilmez. Mini
  uygulama kullanıcının gerçek kimliğini değil, yalnızca kendisine özel bir takma kimlik görür.
- **Kullanıcının denetimi.** Numarayla bulunmayı kapatma, engelleme, açık oturumları görme ve
  kapatma, mini uygulama izinlerini geri alma, hesabı silme.
- **Biyometrik veri işlenmez.** Parmak izi ve yüz doğrulamasını telefonun işletim sistemi yapar;
  uygulama ve sunucu yalnızca sonucu öğrenir, biyometrik veri görmez ve saklamaz.
- **Güvenlik.** Doğrulama kodları ve oturum belirteçleri veritabanında düz metin olarak durmaz.
  Sunucu günlüğüne istek gövdeleri ve adreslerin sorgu bölümü yazılmaz.
- **Hesap verebilirlik.** Panelden yapılan her işlem denetim kaydına yazılır.

### Sizde kalanlar

- **Metinler.** Uygulamadaki Kullanım Koşulları ve Aydınlatma Metni yer tutucudur
  (`apps/mobile/src/features/legal/documents.ts`). Aydınlatma metninde veri sorumlusunun kimliği,
  işleme amaçları, hukuki sebepler, aktarımlar ve başvuru yolu yer almalıdır. Açık rıza gerektiren
  bir işleme varsa rıza aydınlatmadan ayrı alınmalıdır; şu anki ekranda tek onay kutusu vardır.
  Metin değiştiğinde `TERMS_VERSION` değerini artırın.
- **VERBİS.** Yıllık çalışan sayısı 50'den az ve yıllık mali bilanço toplamı 100 milyon TL'den az
  olan, ana faaliyeti özel nitelikli veri işlemek olmayan veri sorumluları kayıt yükümlülüğünden
  istisnadır (Ekim 2025'te güncellenen Kurul kararı). Eşiği aştığınızda kayıt gerekir.
- **Başvurular.** Kullanıcıların verilerine ilişkin başvurularını alacak bir kanal (e-posta, form)
  kurun; başvurular en geç 30 gün içinde yanıtlanmalıdır. Uygulamada "verilerimi indir" özelliği
  yoktur; başvuru üzerine veritabanından elle çıkarılır.
- **Veri ihlali.** İhlali öğrendiğinizde Kişisel Verileri Koruma Kurulu'na 72 saat içinde bildirim
  yapılmalıdır. Kimin karar vereceğini ve bildireceğini önceden belirleyin.
- **Yurt dışına aktarım.** Sunucunuz, SMS firmanız ya da başka bir hizmet sağlayıcınız yurt
  dışındaysa kişisel veri yurt dışına aktarılmış olur. 2024'te değişen kurallara göre yeterlilik
  kararı yoksa uygun güvence (ör. Kurul'un yayımladığı standart sözleşme; imzadan sonra 5 iş günü
  içinde Kurum'a bildirilir) gerekir. En sade yol sunucuyu Türkiye'de tutmaktır.
  Dikkat: görüntülü görüşme düğmesi varsayılan olarak `meet.jit.si` adresindeki yurt dışı bir
  hizmeti açar. Yayından önce kendi Jitsi sunucunuzu kurup `EXPO_PUBLIC_JITSI_URL` ile bağlayın ya
  da bu durumu aydınlatma metnine yazın.
- **Teknik tedbirler.** Mesajlar sunucuda düz metin saklanır (uçtan uca şifreleme yoktur). Disk
  şifreleme, veritabanına erişimin kısıtlanması, yedeklerin şifrelenmesi ve panel erişiminin
  sınırlandırılması sizin sorumluluğunuzdadır.
- **Mini uygulama geliştiricileri ve işletmeler.** Bir mini uygulamada iki taraf olabilir: paketi
  yazan geliştirici ve onu kendi uygulama kaydında kullanan işletme. Kullanıcıdan toplanan veriler
  (izinle alınan ad ve takma kimlik dahil) yalnızca paketin bildirim dosyasında yazan adreslere
  gidebilir; inceleme ekranı bu adresleri ve sürümden sürüme değişimini gösterir. Bu veriler için
  veri sorumlusunun kim olduğunu (işletme, geliştirici ya da ikisi birlikte) sözleşmenizde
  belirleyin. Paketi onaylamadan ve kaydı doğrulamadan önce aydınlatma metni ve taahhüt isteyin;
  yurt dışındaki bir adrese veri gönderen paketi, yurt dışına aktarım kuralları açısından ayrıca
  değerlendirin.

## 2. Elektronik haberleşme: şebekeler üstü hizmet

5809 sayılı Elektronik Haberleşme Kanunu'na 2022'de eklenen tanıma göre, internet üzerinden sunulan
kişiler arası sesli, yazılı ve görüntülü iletişim hizmetleri "şebekeler üstü hizmet"tir; VADO'nun
mesajlaşması bu tanıma girer. Kanun, bu hizmeti sunanların faaliyetlerini Türkiye'de kurulu anonim
ya da limited şirket üzerinden ve BTK'nın yapacağı yetkilendirme çerçevesinde yürütmesini öngörür.
Yetkilendirmesiz hizmet için 1 milyon ile 30 milyon TL arasında idari para cezası ve bant genişliği
daraltma yaptırımları vardır.

Yetkilendirmenin ayrıntılarını belirleyecek ikincil düzenleme için BTK Mart 2025'te taslak
yayımladı; taslakta bildirim usulüyle yetkilendirme ve aylık 1 milyon tekil kullanıcı eşiği yer
alıyordu. Bu belge yazılırken taslağın kesinleşip kesinleşmediği doğrulanamadı.

**Yapılacak:** Türkiye'de bir şirket kurun ve yayından önce güncel durumu BTK'dan ya da
hukukçunuzdan öğrenin. Küçük ölçekte yükümlülük doğmayabilir, ama bunu varsaymayın.

## 3. İnternet yayınları (5651)

### Yer sağlayıcı

Kullanıcıların mesajlarını, fotoğraflarını ve paylaşımlarını barındıran hizmet yer sağlayıcıdır.
Yer sağlayıcının başlıca yükümlülükleri: BTK'ya faaliyet bildiriminde bulunmak, trafik bilgilerini
(kim, ne zaman, hangi IP adresinden) yönetmelikte belirlenen süreyle (bir yıldan az, iki yıldan çok
olmamak üzere) doğruluğu ve bütünlüğü korunarak saklamak ve hukuka aykırı içerikten haberdar
edildiğinde içeriği yayından çıkarmak.

- Kodda olan: kullanıcılar içerik ve hesap şikayet edebilir; şikayetler panelde listelenir;
  yönetici hesabı askıya alabilir.
- Kodda olmayan: panelden tek bir mesajı ya da paylaşımı kaldırma ve trafik kayıtlarını yasal
  biçimde (değiştirilemez, zaman damgalı) saklayan bir düzen. Şimdilik içerik veritabanından elle
  kaldırılır; sunucu günlüklerinin saklanmasını ayrıca düzenlemeniz gerekir.

### Sosyal ağ sağlayıcı ve 15 yaş kuralı

5651, kullanıcıların sosyal etkileşim amacıyla içerik oluşturup paylaşmasına imkân veren hizmetleri
"sosyal ağ sağlayıcı" sayar. Yalnızca birebir mesajlaşma bu tanımın dışında değerlendirilse de
VADO'nun "Anlar" bölümü kişilerle paylaşım, beğeni ve yorum içerir; hizmetin bu tanıma girip
girmediğini hukukçunuz değerlendirmelidir.

- Türkiye'den günlük erişimi 1 milyonu aşan sosyal ağ sağlayıcılar için ek yükümlülükler vardır:
  temsilci, başvurulara 48 saat içinde yanıt, kullanıcı verilerinin Türkiye'de tutulması, düzenli
  raporlama.
- **Yeni:** 1 Mayıs 2026'da Resmî Gazete'de yayımlanan 7578 sayılı Kanun, sosyal ağ sağlayıcıların
  15 yaşını doldurmamış çocuklara hizmet sunmasını yasaklıyor; yaş doğrulama ve ebeveyn denetim
  araçları yükümlülüğü getiriyor. Yayımlanan değerlendirmelere göre hükümler **1 Kasım 2026'da**
  uygulanmaya başlıyor.

**Uygulamada yaş doğrulama yoktur.** Hizmetiniz sosyal ağ sağlayıcı sayılacaksa yayından önce yaş
doğrulama eklenmelidir (bkz. YOL_HARITASI.md). Sayılmayacaksa bile kayıt ekranına yaş beyanı
eklemeyi ve Kullanım Koşulları'na yaş sınırı yazmayı hukukçunuzla konuşun.

## 4. Ödeme hizmetleri (6493)

Başkası adına ödeme almak, para aktarmak ya da bakiye tutmak ödeme hizmetidir ve Türkiye Cumhuriyet
Merkez Bankası'ndan faaliyet izni gerektirir; izinsiz sunmak suçtur. VADO'nun böyle bir izni yoktur
ve kod buna göre yazıldı:

- VADO kart bilgisi istemez, saklamaz ve para tutmaz; cüzdan ya da bakiye yoktur.
- Bu sürümde yalnızca **deneme ödemesi** vardır: onay ekranı çalışır ama gerçek para hareketi
  olmaz. Ekranda "Deneme ödemesi" etiketi görünür.
- `VADO_PAYMENT_MODE=provider` yapıldığında ödeme uç noktaları kapanır; gerçek tahsilat kodu yoktur.

Gerçek ödeme almak için:

1. TCMB'den izinli bir ödeme kuruluşuyla ya da bankayla sözleşme yapın. Para, VADO'nun hesabına
   uğramadan kuruluşun altyapısı üzerinden satıcıya ulaşmalıdır.
2. Kuruluşun ödeme sayfasını bağlayın: API kuruluşta ödeme oturumu açar, kullanıcı kartını
   kuruluşun sayfasında girer, sonucu kuruluşun sunucudan sunucuya bildirimi belirler.
   Mimari bunun için hazırdır (bkz. [MIMARI.md](MIMARI.md), "Ödeme").
3. Kurduğunuz modelin (satıcılar adına tahsilat, komisyon, iade) kendi başına izin gerektirip
   gerektirmediğini kuruluşla ve hukukçunuzla netleştirin.

O zamana kadar deneme ödemesine dayanarak mal ya da hizmet teslim edilmemelidir.

## 5. Satış ve ileti

- **Mini uygulamalardan satış.** Satıcı, mini uygulamanın sahibidir. Tüketiciye uzaktan satışta ön
  bilgilendirme, cayma hakkı ve iade kuralları (6502 sayılı Kanun ve Mesafeli Sözleşmeler
  Yönetmeliği) satıcıyı bağlar. Satışa aracılık eden platformların da yükümlülükleri vardır
  (6563 sayılı Kanun); VADO'nun bu kapsama girip girmediğini hukukçunuza sorun ve satıcılarla
  sözleşmenizde sorumlulukları yazın.
- **İletiler.** Doğrulama kodu SMS'i ticari ileti değildir, onay gerektirmez. Kampanya ya da
  tanıtım içerikli SMS, e-posta ya da bildirim gönderecekseniz önceden onay almanız ve onayları
  İleti Yönetim Sistemi'ne (İYS) kaydetmeniz gerekir. Uygulama şu an tanıtım iletisi göndermez.
- **İşletme hesapları.** İşletme başvurusunda vergi numarası isteğe bağlıdır ve doğrulanmaz;
  panelde "doğrulanmış" işareti koymadan önce işletmeyi kendi yönteminizle doğrulayın.

## Yayından önce hukukçuya götürülecekler

- [ ] Kullanım Koşulları, KVKK Aydınlatma Metni ve gerekiyorsa açık rıza metni
- [ ] Veri envanteri, saklama ve imha süreleri (yukarıdaki tablo başlangıç noktasıdır)
- [ ] VERBİS kaydının gerekip gerekmediği
- [ ] Sunucunun ve hizmet sağlayıcıların konumu; yurt dışı aktarım varsa güvenceler
- [ ] BTK: şebekeler üstü hizmet yetkilendirmesinin güncel durumu
- [ ] 5651: yer sağlayıcı bildirimi, trafik kaydı saklama, içerik kaldırma süreci
- [ ] Sosyal ağ sağlayıcı sayılıp sayılmadığınız ve 15 yaş kuralı
- [ ] Ödeme modeli ve lisanslı kuruluşla sözleşme
- [ ] Mini uygulama geliştiricileri ve işletmelerle yapılacak sözleşmeler

## Kaynaklar

Kanun metinleri için [mevzuat.gov.tr](https://www.mevzuat.gov.tr) adresinde kanun numarasıyla
arayın (6698, 5809, 5651, 6493, 6563, 6502). Güncel duyurular ve rehberler kurumların kendi
sitelerindedir: [kvkk.gov.tr](https://www.kvkk.gov.tr), [btk.gov.tr](https://www.btk.gov.tr),
[tcmb.gov.tr](https://www.tcmb.gov.tr) (izinli ödeme kuruluşlarının listesi burada yayımlanır).

2025 ve 2026'daki değişiklikler için bu belge yazılırken okunan değerlendirmeler:

- [Şebeke Üstü Hizmetler (OTT Hizmetleri), M. Bedii Kaya](https://mbkaya.com/sebeke-ustu-hizmet-ott/)
- [OTT Haberleşme Hizmetleri İçin Yeni Dönem: BTK Taslakları Görüşe Açtı](https://www.rekabetregulasyon.com/ott-haberlesme-hizmetleri-icin-yeni-donem-btk-taslaklari-goruse-acti/)
- [Türkiye'de 15 Yaş Altı Çocuklar İçin Sosyal Medya Yasağı: 7578 sayılı Kanun](https://www.yilmaztatlihukuk.com/post/turkiyede-cocuklar-icin-sosyal-medya-yasagi-7578-sayili-kanun)
- [Sosyal Medyada 15 Yaş Sınırı ve Yaş Doğrulama Dönemi](https://www.ozgureralp.com/sosyal-medyada-15-yas-siniri-ve-yas-dogrulama-donemi-5651-sayili-kanunda-dijital-cocuk-haklari/)
- [15 Yaş Altı Sosyal Medya Yasağı (2026): Hukuki Değerlendirme](https://www.hakanmert.av.tr/15-yas-alti-sosyal-medya-yasagi/)
- [Yeni Sosyal Medya Yasası 2026: Değişiklikler ve Yükümlülükler](https://oner.av.tr/yeni-sosyal-medya-uygulamalari/)
- [VERBİS'e Kayıt Zorunluluğu İstisnalarında Değişiklik](https://cottgroup.com/tr/blog/kvkk-gdpr/item/verbise-kayit-zorunlulugu-istisnalarinda-degisiklik)
