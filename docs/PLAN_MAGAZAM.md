# Mağazam planı — telefondan, kod yazmadan dükkân kurma

**Durum (10.10.2026):** Sürüm sahibi bu planı onayladı ve şu şartı koydu: "Sonra geliştiririz" yok.
Her adım bittiğinde eksiksiz bir yetenek teslim eder; yarım özellik yayına girmez. Adımlar küçük
tutulur ve her biri boş klasörde `npm ci` + `npm run check` geçtikten sonra zip olarak verilir.

Bu belge [PLAN_2.8.md](PLAN_2.8.md)'nin parçasıdır; oradaki K1–K10 kararları geçerlidir.

## 1. Hedef

Bir esnaf, Android telefonundan, kimseden yardım almadan, **10 dakikada** sipariş ya da randevu
alan bir mağaza açar. Okuma yazma bilmesi yeter; bilgisayar, kod, tasarım ya da teknik terim bilmesi
gerekmez.

Ölçütler (M8'de gerçek kişilerle ölçülür):

- İlk yayına kadar geçen süre: beş esnafın ortancası 10 dakikanın altında.
- Hiçbir ekranda yabancı ya da teknik sözcük yok (SKU, varyant, checkout, slug, PWA...).
- Her ekran tek bir soru sorar. Her alanda örnek vardır ("Örnek: Yılmaz Fırını").
- Yarıda bırakılan kurulum, telefon değişse bile kaldığı yerden sürer (taslak sunucuda).
- Her değişiklik geri alınabilir; yayındaki mağaza, taslak bitene kadar bozulmaz.

## 2. Kararlar

**MK1. Her işletmeye ayrı uygulama üretilmez.** Apple, şablondan üretilip başkası adına yüklenen
uygulamaları reddediyor (App Store kuralı 4.2.6); Google Play'in spam kurallarında da benzer bir
kısıtlama var. Binlerce ayrı uygulamada bir güvenlik düzeltmesi binlerce kez derlenip onaya gider.
Mağaza **veridir**: işletme + şube + vitrin belgesi + katalog + motor örneği. Tek motor, tek kod;
bir düzeltme bütün mağazalara aynı anda ulaşır.

**MK2. Esnaf için "kendi uygulaması" hissi üç yoldan gelir.**

- Kendi kısa adresi: `vado.app/@yilmazfirini`.
- Android'de müşteri "Ana ekrana ekle" der; mağaza **kendi adı ve logosuyla** telefona yerleşir
  (mağazaya özel web manifesti).
- Bağlantı WhatsApp'ta logolu kart olarak görünür; uygulama yüklüyse doğrudan VADO'da açılır
  (Android App Links), değilse web'de açılır ve sipariş web'den de verilir.

**MK3. İşletme deneyimi tek koddur: VADO Business.** Mimari kural korunur
([PLATFORM_MIMARISI.md](PLATFORM_MIMARISI.md), "Sektör deneyimi"): sektör başına ya da cihaz başına
ikinci bir işletme uygulaması yazılmaz.

- VADO uygulamasında **Dükkânım** girişi, VADO Business'ı uygulamanın içinde açar. İkinci kez SMS
  kodu istenmez: VADO oturumu tek kullanımlık, 60 saniyelik bir devir koduyla Business oturumuna
  çevrilir (kodun yalnız özeti saklanır).
- Dükkânım kabuğu, Business'a dar bir köprü verir: barkod okutma, fotoğraf çekme, paylaşma,
  bildirim izni. Business sayfaları köprü yoksa (tarayıcıda) aynı işi web yoluyla yapar.
- Yeni sipariş, randevu ve mesaj bildirimleri esnafın VADO uygulamasına push olarak gelir; ayrı
  uygulama kurmak gerekmez.
- Business tablet ve bilgisayarda kurulabilir web uygulaması olarak kalır (mutfak, kasa).
- Bugünkü mobil "İşletme kaydı" ekranı kaldırılır; işletme açmanın tek yolu Dükkân Aç sihirbazıdır.

**MK4. Şablon = sektör paketi × düzen × renk; sayfa bloklardan kurulur.** Serbest HTML, CSS ya da
kod alınmaz. Bloklar sabit, şemayla doğrulanan, sürümlü bir listeden seçilir; sıraları değişir,
gizlenir, içerikleri düzenlenir. Aynı blok çizicisi restoran, mağaza ve rezervasyon mini
uygulamalarında ve web vitrininde kullanılır (`@vado/miniapp-shared`).

**MK5. Yazı yerine ses ve kamera.** Ses için telefonun klavyesindeki mikrofon (Türkçe dikte)
kullanılır; VADO kendi ses tanıma servisini kurmaz (ek maliyet ve ses kaydının sunucuya gitmesi
gerekmez). Ürün fotoğrafı kameradan çekilir, kare kırpılır, sunucuda temizlenir (EXIF/GPS) ve
küçültülür. Market ürünleri barkodla eklenir ve bulunur.

**MK6. Türkiye kuralları yayını durdurur, öneri değildir.** Yasal profil, ön bilgilendirme ve
mesafeli satış metni, yasaklı ürün denetimi tamamlanmadan uzaktan satış açılmaz (bkz. §7).

**MK7. Yapay zekâ ile menü ya da raf fotoğrafından ürün listesi önerisi** dış bir görüntü işleme
sağlayıcısı gerektirir. Sağlayıcı, maliyet ve veri işleme sözleşmesi sürüm sahibinin kararıdır.
Karar verilene kadar bu yetenek plana alınmaz; verildiğinde kendi adımıyla (M9) eksiksiz yapılır.

## 3. Esnafın yolculuğu: Dükkân Aç

VADO uygulamasında "Dükkân Aç" düğmesi → sihirbaz (Business içinde, telefon için tasarlanmış).

1. **Ne iş yapıyorsun?** Büyük resimli sektör kartları: Fırın, Manav, Kasap, Market, Çiçekçi,
   Kafe, Berber, Kuaför... Arama kutusu Türkçe harflere duyarsızdır ("cicekci" bulur).
2. **Dükkânının adı.** Kısa adres adından önerilir (`@yilmazfirini`); dolu ya da yasaklıysa
   alternatif önerilir.
3. **Logon.** "Fotoğraf çek" ya da "Galeriden seç"; logo yoksa adın baş harfleriyle renkli bir logo
   üretilir.
4. **Görünüm.** Sektöre uygun üç düzen, telefon çerçevesinde **canlı önizlemeyle**; renk seçimi.
5. **Adres.** İl, ilçe, mahalle listeden; açık adres. GPS istenmez.
6. **Nasıl satıyorsun?** Gel-al, adrese teslim, masaya servis ya da randevu (sektöre göre
   önerilir). Teslimatta mahalleler haritasız, listeden seçilir; ücret, en az tutar, süre.
7. **Çalışma saatleri.** Hazır seçenekler ("Her gün 08–20", "Pazar kapalı") ve tek tek düzenleme.
8. **İlk ürünler.** Sektörün hazır kategorileri gelir. Her ürün: fotoğraf çek, adını söyle, fiyatı
   yaz (`40,50`). Fiyat uydurulmaz; öneri yalnız ad ve kategoridir.
9. **Yasal bilgiler.** Satıcı türü (şirket, şahıs işletmesi, esnaf muaflığı belgeli ev üretimi);
   ad/unvan, vergi kimlik numarası, vergi dairesi, iletişim. Her alanın ne olduğu tek cümleyle
   anlatılır.
10. **Son kontrol ve yayın.** Eksikler madde madde, "Düzelt" düğmesiyle. Yayın düğmesi eksik
    kalmadığında açılır. İlk yayında VADO işletme doğrulaması (bugünkü süreç) beklenir; esnafa ne
    kadar süreceği ve ne olacağı yazılır.

Yayından sonra: **Paylaş** ekranı (WhatsApp, bağlantıyı kopyala, QR), **Afiş** (A4 vitrin afişi,
A5 masa kartı, etiket sayfası; PDF), **Dükkânım** ana ekranı.

## 4. Esnafın günlük işi: Dükkânım

- Bugünün özeti: bekleyen sipariş ve randevular, bugünkü ciro (kapıda tahsil edilen), yeni mesaj.
- Yeni sipariş: push + uygulama açıkken sesli uyarı; tek ekranda kabul/ret, hazırlık süresi.
- Ürünler: tek dokunuşla "Tükendi / Satışta", fiyat güncelle, fotoğraf değiştir, barkodla bul.
- Toplu fiyat: kategori ya da seçilen ürünlerde yüzde ya da tutar artışı, önce önizleme.
- Mesajlar: işletme sohbetine yanıt (K7).
- Mağazam: vitrin bloklarını düzenle, önizle, yayınla.

Bunlar bugünkü Business modüllerinin telefon düzenidir; ikinci bir kopya yazılmaz.

## 5. Müşterinin yolculuğu

```
WhatsApp kartı / QR / Keşfet → mağaza (uygulamada ya da web'de) → ürün → sepet
→ teslim biçimi ve adres → ön bilgilendirme onayı → sipariş → durum takibi → değerlendirme
```

- Web'de müşteri telefon numarası ve SMS koduyla girer; aynı VADO hesabıdır.
- Mini uygulama web'de de aynı köprüyle çalışır (VADO web uygulamasındaki çerçeve). Ayrı bir web
  sipariş kodu yazılmaz.
- Mağaza sayfası 4G'de orta seviye bir Android telefonda 2,5 saniyede okunur hâle gelir.

## 6. Sektör paketleri, düzenler ve bloklar

### Sektör paketi

Sözleşmelerdeki kayıttır (`packages/contracts`); veritabanı yalnız kimliğin biçimini denetler. Bir
paket şunları taşır: ad ve resim, motor (sipariş ya da rezervasyon), önerilen teslim biçimleri,
varsayılan blok dizilişi, hazır kategoriler, birim önerileri (adet, kg...), cayma hakkı kuralı ve
yasaklı ürün sözlüğü.

| Grup      | Paketler                                                                                                                                                                 | Motor       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| Yemek     | Restoran-lokanta, Döner-kebap-pide, Kafe, Fırın-pastane, Tatlıcı-dondurmacı, Kahvaltı salonu                                                                             | Sipariş     |
| Alışveriş | Market-bakkal, Manav, Kasap-şarküteri, Kuruyemiş-baharat, Çiçekçi, Petshop, Butik giyim, Ayakkabı-çanta, Kozmetik, Kırtasiye-kitap, Oyuncak, Telefon-aksesuar, Ev-mutfak | Sipariş     |
| Hizmet    | Berber, Kuaför, Güzellik salonu, Tırnak bakımı, Özel ders-kurs, Oto yıkama, Evcil hayvan bakımı                                                                          | Rezervasyon |

Kapsam dışı ve gerekçesi: sağlık (klinik, diyetisyen; özel nitelikli kişisel veri, ayrı saklama ve
açık rıza altyapısı gerekir), alkol ve tütün (internetten satışı yasak), ilaç, silah, canlı hayvan
(petshop paketi yalnız ürün satar).

KDV önerisi: paket her kategori için bir oran önerir (%0, %1, %10, %20 listesinden), esnaf onaylar.
Öneri tablosu yayından önce bir mali müşavire okutulur; okutulmadan öneri gösterilmez, yalnız liste
gösterilir.

### Düzenler ve renkler

Üç düzen: **Sade** (hızlı liste), **Vitrin** (fotoğraf öncelikli), **Kurumsal** (çok şube). Sekiz
renk; her renk WCAG AA kontrastını test ile sağlar. Yazı tipi telefonun kendi yazı tipidir (hız).
Böylece her sektörde 3 düzen × 8 renk, blok dizilişiyle birlikte birbirinden ayırt edilen vitrinler
çıkar.

### Bloklar

| Blok                | İçerik ve sınırlar                                                                |
| ------------------- | --------------------------------------------------------------------------------- |
| Kapak (zorunlu)     | Logo, kapak fotoğrafı, ad, kısa tanıtım (180), açık/kapalı, puan                  |
| Duyuru bandı        | Metin (120), başlangıç ve bitiş tarihi                                            |
| Kampanya            | Teşvik motorundaki kupon ya da kampanya; serbest metinle indirim vaadi yazılamaz  |
| Öne çıkanlar        | En çok 12 ürün ya da hizmet, elle seçilir; satıştan kalkan kendiliğinden gizlenir |
| Kategoriler         | Izgara ya da şerit                                                                |
| Ürünler (sipariş)   | Kategoriye göre liste, arama, süzgeç; sipariş motorunda zorunlu                   |
| Hizmetler (randevu) | Hizmet, süre, fiyat, boş saat; rezervasyon motorunda zorunlu                      |
| Hakkımızda          | Metin (1000), en çok 6 fotoğraf                                                   |
| Galeri              | En çok 12 fotoğraf                                                                |
| Saatler ve adres    | Şubeden gelir; "Haritada aç" telefonun harita uygulamasını açar                   |
| Değerlendirmeler    | Ortalama, sayı, son yorumlar ve işletme yanıtları                                 |
| Teslimat            | Bölgeler, ücret, en az tutar, süre; teslimat motorundan gelir                     |
| İletişim            | "İşletmeye yaz" (VADO sohbeti), "Takip et" (kanal)                                |
| Yasal (zorunlu)     | Satıcı bilgileri, ön bilgilendirme ve iade koşulları; en altta, kaldırılamaz      |

Fiyat, stok, puan ve saat gibi canlı bilgiler bloğa kopyalanmaz; yayın anında değil, her açılışta
ilgili motordan okunur. Vitrin belgesi yalnız düzeni ve esnafın yazdığı metni taşır.

## 7. Türkiye kuralları (yayın denetimi)

Yayın düğmesi sunucudaki tek bir denetimden geçer; aynı denetim her güncellemede yeniden çalışır.

- **Satıcının yasal profili** (K8): ad/unvan, VKN ya da TCKN (maskeli gösterilir), vergi dairesi,
  MERSİS (şirkette), açık adres, telefon, e-posta, isteğe bağlı KEP. Satıcı türü: şirket, şahıs
  işletmesi ya da **esnaf muaflığı belgeli ev üretimi** (Gelir Vergisi Kanunu md. 9; belge
  numarası istenir).
- **Mesafeli satış:** ön bilgilendirme formu ve sözleşme sunucuda, sürümlü şablondan üretilir;
  müşteri onayı ve metnin özeti siparişte değişmez saklanır. Cayma hakkı 14 gün; çabuk bozulan ve
  kişiye özel üretilen ürünlerde istisna paket kuralından gelir.
- **Fiyat gösterimi:** her fiyat KDV dahildir. Tartılı ve hacimli üründe birim fiyat (kg, lt başına)
  da gösterilir.
- **Yasaklı ürün:** ürün adı ve açıklaması paketin sözlüğüyle taranır (Türkçe harf sadeleştirmeli);
  eşleşme yayını değil, o ürünü durdurur ve nedenini yazar. Şüpheli durum VADO inceleme kuyruğuna
  düşer.
- **Kişisel veri:** esnaf müşterinin telefonunu görmez (K7). Esnafın kendi telefonu şahıs
  işletmesinde kişisel veridir; vitrinde gösterilip gösterilmeyeceğini esnaf seçer.
- **Hukuk kontrolü:** yasal metin şablonları ve ETBİS kaydı gibi yükümlülükler yayın öncesi bir
  hukukçuya okutulur (A6 kabul listesinde).

## 8. Teknik mimari

- **Vitrin belgesi v2:** Studio tablosuna sektör paketi ve sürümlü blok belgesi eklenir (yeni şema
  dosyası; yayımlanmış dosyalar değişmez). Taslak ve yayın ayrımı korunur. Belge Zod ile her iki
  uçta doğrulanır; bilinmeyen blok reddedilir.
- **Kısa ad:** işletme kısa adları ayrı tabloda; eski ad değişince 1 yıl yönlendirilir ve başka bir
  işletmeye 90 gün verilmez (taklide karşı). Ayrılmış adlar (vado, destek, admin...) ve Türkçe
  benzer harf denetimi.
- **Katalog derinliği:** birim (adet, kg, g, lt, ml, paket), tartılı satış (adım ve tahmini tutar),
  isteğe bağlı stok adedi (sıfırda kendiliğinden tükendi), barkod (EAN-13 doğrulamalı), ürün başına
  en çok 6 fotoğraf. Tartılı üründe kapıda gerçek tutar alınır; fark sınırı paket kuralıdır ve
  aşılırsa müşteriden onay istenir.
- **Paylaşım sayfası:** `/@kısa-ad` sunucuda üretilen hafif bir HTML'dir: Open Graph etiketleri,
  mağazaya özel manifest, açık/kapalı, öne çıkanlar. JavaScript olmadan okunur. "Sipariş ver" VADO
  web uygulamasında mağazayı açar; Android App Links (`assetlinks.json`) uygulama yüklüyse
  uygulamada açar.
- **Afiş:** sunucuda PDF; Türkçe harfler için gömülü yazı tipi (Noto Sans, OFL). İmzalı QR
  bugünkü QR servisinden gelir.
- **Dükkânım kabuğu:** VADO uygulamasında Business'ı açan görünüm; devir kodu; köprü mesajları
  sözleşmede tanımlı ve sürümlü; Business yalnız bu köprüyü tanır.
- **Bildirim:** işletme olayları, izni olan üyelere (`orders.view` vb.) mevcut push servisiyle
  gider; işlemsel iletidir, reklam içeremez.
- **Kalıcı denetim:** proje kuralları betiği vitrin belgesinde serbest HTML/URL alanı, blok
  çizicisinde `dangerouslySetInnerHTML` görürse hata verir.

## 9. Adımlar

Her adım bir zip'tir ve kendi içinde eksiksizdir. Sıra bağımlılığa göredir.

| #   | İçerik                                                                                                                                      | Kabul                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A2  | Tarafsız sipariş çekirdeği (PLAN_2.8 K2): sipariş bağlamı, teslim biçimi ve tahsilat kaydı                                                  | Denetim betiği çekirdekte restoran kavramı bulmaz; mağaza yolculuğu HTTP ve SQL ile geçer                             |
| M1  | Sektör paketleri, düzenler, 8 renk, blok sistemi, ortak blok çizicisi, Studio düzenleyicisi, randevu mini uygulamasının rezervasyon köprüsü | Restoran, mağaza ve randevu mini uygulamaları aynı belgeyi çizer; bilinmeyen blok iki uçta reddedilir; kontrast testi |
| M2  | Katalog derinliği: birim, tartılı satış, stok, barkod, çoklu fotoğraf, KDV önerisi                                                          | Stok yarışı (iki müşteri son ürün) SQL ile; tartı farkı sınırı; EAN-13 denetimi                                       |
| M3  | Yasal profil, ön bilgilendirme ve sözleşme, onay kanıtı, yayın denetimi, yasaklı ürün                                                       | Eksik profilde uzaktan sipariş açılmaz; metin değişince `cart_changed`; yasaklı ürün durur                            |
| M4  | Dükkân Aç sihirbazı, teslimat bölgesi ve saat ekranları, Dükkânım kabuğu, devir kodu, push                                                  | Tarayıcıda 390×844'te sıfırdan yayına; devir kodu tek kullanımlık ve 60 sn; push alıcı izni                           |
| M5  | Kısa ad, paylaşım sayfası, mağaza manifesti, App Links, web'den sipariş, QR afiş PDF                                                        | JS kapalıyken OG etiketleri; web'den sipariş baştan sona; afişte Türkçe harfler                                       |
| M6  | Dükkânım günlük işleri: özet, sesli uyarı, tükendi, toplu fiyat önizlemeli                                                                  | Tarayıcı senaryoları; toplu fiyatta eş zamanlı düzenleme çakışması                                                    |
| M7  | Kalite kapısı: erişilebilirlik (TalkBack etiketleri, 48dp, büyük yazı), yavaş 3G, çift dokunma                                              | Otomatik denetimler; bozma denemeleri                                                                                 |
| M8  | Gerçek kullanıcı denemesi (sürüm sahibiyle): beş esnaf, gerçek Android telefon                                                              | Ortanca kurulum süresi < 10 dk; bulunan sorunlar kapanır                                                              |
| M9  | Yapay zekâ ile ürün listesi önerisi — yalnız MK7 kararı verilirse                                                                           | Karar verildiğinde yazılır                                                                                            |

A3 (kurye), A4 (değerlendirme, favori, iade ekranları) ve A6 (kapanış) PLAN_2.8'deki gibi kalır;
A3'ün teslimat bölgesi ekranı M4'te, A5'in mevzuat çekirdeği M3'te yapılır.

## 10. Bu planda olmayanlar

- Her işletmeye ayrı Play Store / App Store uygulaması (MK1).
- Serbest HTML, CSS, betik ya da dış site gömme.
- Online ödeme (lisanslı ödeme kuruluşu bağlanınca; PLAN_2.8 §6).
- e-Arşiv / e-Fatura: belgeyi esnaf kendi düzenler.
- Sağlık sektörü, alkol, tütün, ilaç, canlı hayvan satışı (§6).
- Özel ses tanıma servisi (MK5).

## 11. Denenmeyecek olanlar ve kimin yapacağı

Gerçek Android telefonda kamera, barkod, push ve ana ekrana ekleme; gerçek esnafla süre ölçümü;
yasal metinlerin hukukçu okuması; KDV öneri tablosunun mali müşavir okuması. Bunları geliştirme
ortamı yapamaz; M8 ve A6'da sürüm sahibiyle yapılır.
