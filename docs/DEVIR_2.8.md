# 2.8 devir notu

Bu belge 2.8'i yazacak kişi ya da yapay zekâ ajanı için 2.7.0 sonunda yazıldı. Bağlayıcı kurallar
geçerlidir. Güncel durum, bulgular ve tamamlama planı: [PLAN_2.8.md](PLAN_2.8.md).

## Önce okuyun

1. [PLATFORM_MIMARISI.md](PLATFORM_MIMARISI.md): katmanlar, üç motor, değişmez teknik kurallar
   (işletme yalıtımı ve RLS, `businessCustomerId`, sipariş güvenilirliği, olayların en az bir kez
   teslimi, Studio'ya hazır sözleşmeler), PRO kalite şartı.
2. [PLAN_2.6.md](PLAN_2.6.md): başındaki "Devir" bölümündeki bağlayıcı çalışma kuralları burada da
   geçerlidir.
3. [PLAN_2.7.md](PLAN_2.7.md), [KABUL_2.7.md](KABUL_2.7.md), [RESTORAN_2.7.md](RESTORAN_2.7.md):
   2.7'de ne yapıldı ve nasıl kabul edildi.
4. [YOL_HARITASI.md](YOL_HARITASI.md).

## 2.7.0'ın doğrulanmış durumu

- Boş klasörde `npm ci` ve `npm run check`: 813 test geçti, bütün derlemeler başarılı.
- 164/164 bozma denemesi, 31 tarayıcı senaryosu, 11 geçiş/geri dönüş denetimi (önceki geliştirici).
- Docker ve Compose (ayrı doğrulama): API, panel ve Business imajları derlendi; belgedeki sırayla
  (`--profile setup run --rm database-roles`, sonra `up`) beş servis sağlıklı açıldı, 0014–0017
  uygulandı; `business_id` taşıyan 39 tablonun 37'sinde RLS açık ve zorlanmış (kalan ikisi 2.6
  öncesinin VADO ekibi tabloları: `admin_accounts`, `mini_app_merchants`).
- Denenmedi: fiziksel tablette ses ve uyku, gerçek telefonda kamera, izin ve push teslimi.
- Doğrulama betikleri depoda değildir; sürüm sahibindeki `VADO_2.7.0_dogrulama.zip` içindedir.
- Testler PostgreSQL yöneticisi `postgres` (parola `vado`, geliştirme Compose'undaki gibi) ister;
  roller (`vado_owner`, `vado_app`, `vado_platform`) test kurulumunda oluşturulur.

## Bağlayıcı kurallar (özet)

- Kullanıcıyla Türkçe, kısa ve sade: ne yapıldı, ne çalışırken görüldü (sayıyla), ne denenmedi,
  sırada ne var. Çalıştırılmayan şeye "hazır" denmez, "denenmedi" yazılır.
- Her adımda `npm run check` geçer; her ara sürümden önce boş klasörde `npm ci` + `npm run check`.
- Kural susturulmaz (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `TODO`,
  `FIXME` yasak). Kod İngilizce; arayüz, hata, yorum, test adı, belge, commit iletisi Türkçe.
- Yayımlanmış şema dosyası düzenlenmez; değişiklik sıradaki numaralı dosyada. İşletme tablolarında
  RLS zorunlu ve doğrudan SQL ile sınanır.
- Sürüm numarası yalnızca bizim paketlerimizin `version` alanlarında, `apps/mobile/app.json`,
  `API_VERSION` ve mobil yedek değerde değişir; sonra `npm install --package-lock-only`. Kilit
  dosyasında kör metin değiştirme yapılmaz (2.6'da bir paketin sürümü yanlışlıkla bozulmuştu).
- Depoya gerçek anahtar, parola ya da `.env` girmez.
- Belgeler kodla birlikte değişir (CHANGELOG geçiş adımlarıyla, SECURITY, API, YAYIN, MIMARI,
  YOL_HARITASI, README "Neyi denedik").

## 2.8: Restoran, 2. parça

**Önce tek sayfalık 2.8 planını yazın; sürüm sahibi onaylamadan koda geçmeyin.**

Önce 2.7'den kalan iki küçük bulgu:

1. Masa QR düğmesi yalnızca yetkisi olan role görünsün; personel rolü görmesin.
2. Teslim saati gösterilirken şubenin saat dilimi açıkça yazsın.

Kapsam (her biri üretim kalitesinde; yarım özellik "varmış gibi" gösterilmez):

1. **Eve teslim:** adres modeli (il/ilçe/mahalle), şube başına teslimat bölgeleri (Konum platform
   servisi), bölgeye göre teslimat ücreti ve en az sipariş tutarı, tahmini teslim süresi.
2. **Restoranın kendi kuryesi:** kurye hesabı (VADO hesabı + işletme üyeliği), atama, "yola
   çıktı / teslim edildi" akışı, müşteriye canlı teslimat durumu. Dış kurye ağı yok; yalnızca
   sağlayıcı arayüzü.
3. **Teşvik platform servisi:** kampanya, kupon, sadakat. Çok kullanımda ve eş zamanlı kullanımda
   limit aşılmamalı.
4. **Değerlendirme ve favoriler** (platform servisleri), **tekrar sipariş**, **müşteri–restoran
   mesajlaşması** (var olan sohbetin işletme kanalı).
5. **İptal ve iade akışı:** kim, hangi durumda iptal edebilir; kapıda ödemede iade kaydı.
6. **Kapıda nakit ve kart ödemesi.** Online ödeme yok.
7. **Mevzuat:** mesafeli satış ön bilgilendirmesi (hemen tüketilen yiyecekte cayma istisnası),
   kampanya bildirimleri için İYS izni (işlemsel ve ticari ileti ayrımı).
8. 2.7'deki "kapalı şubede ileri saate sipariş de reddedilir" kararını bir işletme ayarına
   dönüştürmeyi değerlendirin (işletme seçsin).

Kapanış: bozma denemesi (164'ün üstüne); keşiften tekrar siparişe tam müşteri yolculuğu ve
restoran operasyonunun tarayıcıda uçtan uca senaryosu; zayıf ağ ve çift dokunma denemesi; 2.7→2.8
geçiş ve geri dönüş; Docker/Compose denemesi (yukarıdaki sırayla); belgeler; sürüm `2.8.0`.

**Pilot yok.** Sektör başına pilot yapılmaz. 2.8.0'dan sonra doğrudan 2.9'a (Rezervasyon
motoru) geçilir. Bütün sektörler bittikten sonra, yayından önce tek bir toplu gerçek kullanım
denemesi yapılır; "PRO" etiketleri ondan sonra konur. 2.8.0 sonunda yalnızca kısa bir **ara cihaz
denemesi listesi** hazırlayın (sürüm sahibinin telefonu ve bir tablet: ses, uyku, push, kamera,
QR).

**Mimari denetim:** 2.8 bitmeden Sipariş motorunun çekirdeğinde restorana özgü bir kavram (masa,
mutfak, garson, kurye gibi) kalmadığını gösterin; bunlar yalnızca restoran paketlerinde ve
restoran deneyiminde olmalı. VADO bir yemek uygulaması değil, süper uygulamadır; Sipariş motoru
Market ve Mağaza'yı da çatallanmadan taşıyabilmelidir.
