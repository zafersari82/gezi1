# Güvenlik

Bu belge VADO'nun neyi nasıl koruduğunu, neyi korumadığını ve bir açık bulunduğunda ne yapılacağını
anlatır. Tasarım kararlarının gerekçesi [docs/MIMARI.md](docs/MIMARI.md) içindedir.

## Açık bildirimi

Bir güvenlik açığı bulduysanız herkese açık bir yerde paylaşmadan önce uygulamayı işleten ekibe
bildirin. Yayından önce buraya bir iletişim adresi yazılmalı ve kimin, ne kadar sürede yanıt
vereceği belirlenmelidir; bu sürümde tanımlı bir adres yoktur.

## Güven sınırları

| Taraf             | Güven                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| API               | Tek karar noktası. Her yetki ve her kural burada denetlenir.                                        |
| Mobil uygulama    | Güvenilmez. Yaptığı denetimler yalnızca kullanıcıya erken bilgi vermek içindir.                     |
| Mini uygulama     | Güvenilmez üçüncü taraf kodu. İncelenmiş olsa da yalıtılmış çalışır; belirteç, numara, kart görmez. |
| Yönetim paneli    | Güvenilir ama dar: API'ye yalnızca sunucu tarafından, yönetici anahtarıyla ulaşır.                  |
| SMS aracı servisi | Doğrulama kodunu görür; yalnızca iç ağdan erişilebilir olmalıdır.                                   |

## Neler korunuyor

### Giriş ve oturum

- Doğrulama kodu 6 hanelidir, 5 dakika geçerlidir, tek kullanımlıktır ve en fazla 5 kez denenebilir.
  Deneme sayacı karşılaştırmadan önce artırılır; eş zamanlı tahminler sınırı aşamaz.
- Kod isteme sınırlıdır: kullanılmamış kod varken 60 saniye bekleme, on dakikada numara başına 5 ve
  IP başına 20 kod.
- Kod veritabanında düz metin değil, yalnızca bu işe ayrılmış bir anahtarla alınmış özet olarak
  durur.
- Oturum belirteci 256 bitlik rastgele bir değerdir; veritabanında yalnızca SHA-256 özeti saklanır.
  Veritabanı sızsa da belirteçler elde edilemez.
- Kullanılan cihazda oturum kendiliğinden uzar, kullanıcıya yeniden kod sorulmaz; 30 gün hiç
  kullanılmayan cihazın oturumu sona erer.
- Her istekte ve her gerçek zamanlı bağlantıda oturum veritabanından doğrulanır. Oturumu kapatmak,
  hesabı askıya almak ya da silmek anında etkili olur ve açık bağlantıları düşürür.
- Mobil uygulama belirteci cihazın güvenli deposunda (Keychain, Keystore) saklar.
- Canlı ortamda API; demo modu açıkken, eksik, varsayılan ya da zayıf anahtarlarla veya SMS
  sağlayıcısı olmadan başlamayı reddeder.

### Cihaz tanıma ve yeniden doğrulama

- Her kurulum rastgele bir cihaz kimliği üretir ve girişte gönderir. Oturum; cihaz kimliği, cihaz
  adı ve IP adresiyle kaydedilir. Kimlik cihazın seri numarası değildir: Android ve iOS onu
  uygulamalara vermez.
- Hesaba daha önce giriş yapılmamış bir cihazdan oturum açılırsa açık cihazlarda uyarı çıkar,
  Oturumlar ekranında o cihaz bir gün "Yeni cihaz" olarak işaretlenir ve giriş denetim kaydına düşer.
- Ödeme onayı, hesap silme ve başka bir cihazın oturumunu kapatma hassas işlemlerdir: kimlik son 10
  dakikada kanıtlanmadıysa yapılmaz. Kullanıcıya sürekli sorulmaz; yalnızca bu işlemlerde ve
  yalnızca doğrulama eskidiyse sorulur.
- Yeni cihazda giriş kodu bu işlemlere yetmez; hesabın numarasına ayrı bir işlem onay kodu gider.
  Kodu bir kez ele geçiren ya da kullanıcıyı kandırıp bir kod alan kişi hesaba girebilir ama ödeme
  yapamaz, hesabı silemez, sahibinin cihazlarını hesaptan atamaz; sahibi ise uyarıyı görüp o oturumu
  kapatabilir.
- Giriş kodu ile işlem onay kodu ayrıdır; biri diğerinin yerine geçmez ve SMS metinleri farklıdır.
- Tanınan cihazda SMS beklenmez: uygulama cihazın kilidini (parmak izi, yüz ya da ekran kilidi
  şifresi) sorar, geçilirse girişte verilen cihaz anahtarını gönderir. Anahtar telefonun güvenli
  deposunda, sunucuda yalnızca özeti durur. Yeni cihazda ilk 24 saat bu yol kapalıdır.
- Parmak izi ve yüz verisi uygulamaya gelmez. Doğrulamayı işletim sistemi yapar; uygulama yalnızca
  "geçti" ya da "geçmedi" sonucunu öğrenir.
- İsteğe bağlı uygulama kilidi: açıkken uygulama, açılışta ve yarım dakikadan uzun arka planda
  kaldıktan sonra cihazın kilidi geçilene kadar hiçbir ekranı göstermez. Ayarı değiştirmek de cihaz
  kilidini ister.

### Anahtarlar

- Doğrulama kodu özeti, QR imzası ve mini uygulama kimliği üç bağımsız anahtar ailesiyle korunur.
  Biri sızarsa ya da değiştirilirse diğer ikisi etkilenmez.
- Doğrulama kodu ve QR anahtarları sürümlüdür: imza, anahtarın kimliğini taşır. Anahtar
  değiştirildiğinde yenisi imzalar, eskisi belirlenen güne kadar yalnızca doğrular; süresi dolan
  anahtar kendiliğinden devre dışı kalır.
- Mini uygulama kimliği anahtarı tek ve uzun ömürlüdür; diğer anahtarların değişmesi kimlikleri
  değiştirmez.
- Canlı ortamda üç aile de açıkça tanımlı, en az 256 bit, rastgele üretilmiş ve birbirinden farklı
  değilse API başlamaz. Geliştirme anahtarı canlı ortamda kabul edilmez.
- 2.1 ve öncesinden geçişte kimlikler ve basılmış QR kodları korunur; anahtarlar yanlışlıkla
  sıfırdan üretilmişse API bunu başlangıçta yakalar ve başlamaz.
- Oturum belirteçleri imza anahtarı kullanmaz; anahtarların sızması açık oturumları ele geçirmeye
  yetmez.
- Hata iletilerine ve günlüğe anahtarların kendisi yazılmaz, yalnızca kimlikleri yazılır.

Üretme, geçiş ve değiştirme adımları: [docs/ANAHTARLAR.md](docs/ANAHTARLAR.md).

### Veri erişimi

- Her uç nokta, isteği yapanın o kayda erişim hakkını veritabanından doğrular: sohbet üyeliği,
  kişilik, sahiplik. İstemcinin gönderdiği kimliğe güvenilmez.
- Telefon numarası yalnızca sahibine döner. Kullanıcı araması yalnızca tam eşleşme bulur; dizin
  taranamaz. Engelleyen kullanıcı, engellenen için hiç yokmuş gibi görünür.
- Birebir mesaj yalnızca kişiler arasında gönderilebilir; tanımadığınız biri size yazamaz.
- Tüm sorgular parametrelidir; sorgu metnine kullanıcı verisi karışmaz.
- Girdiler sözleşme şemalarıyla doğrulanır; gövde boyutu, dosya boyutu ve istek sayısı sınırlıdır.
- Yüklenen dosyanın türü içeriğinden belirlenir; yalnızca JPEG, PNG ve WebP kabul edilir ve dosya
  sunucunun ürettiği rastgele bir adla saklanır.

### Mini uygulamalar

Mini uygulamalar VADO'ya paket olarak yüklenir, incelenir ve VADO'nun sunucusundan sunulur. Canlı
ortamda yalnızca yüklenmiş ve onaylanmış paketler çalışır; geliştiricinin kendi sunucusundan açılan
kayıtlar yalnızca geliştirme ortamında vardır ve canlı ortamda açılamaz.

**İncelenen kod ile çalışan kod aynıdır.**

- Yüklenen sürümün içeriği sabitlenir ve SHA-256 özetiyle tanınır. Sürüm numarası yeniden
  kullanılamaz; değişiklik yeni bir sürümdür ve yeniden incelenir.
- Dosyalar içerik adresli bir depoda durur: her dosyanın adı kendi özetidir, var olan bir dosyanın
  üzerine yazılamaz, depoda silme işlemi yoktur. Her okumada özet yeniden doğrulanır; değişmiş ya
  da eksik dosya sunulmaz, sürüm onaylanamaz.
- Aynı kural veritabanında tetikleyicilerle de uygulanır: sürümün içeriği ve dosya listesi
  değiştirilemez, silinemez, durumu geriye alınamaz. Uygulamadaki bir hata ya da elle yazılmış bir
  SQL onaylı sürümü değiştiremez.
- Paketin sunulduğu adres özeti taşır; kabuk, sunucunun bildirdiği özetin dışındaki bir içeriği
  açamaz.

**Paket yalıtılmış çalışır.** Kabuk paketi doğrudan açmaz; VADO'nun kendi yazdığı ince bir
_sarmalayıcı belgeyi_ açar, paket onun içindeki korumalı çerçevede çalışır. Katmanlar birbirini
tamamlar:

- _Kimliksiz kaynak._ Paketin çerçevesi kum havuzundadır (`sandbox`): belge opak bir kaynakta
  çalışır; çerezi, tarayıcı deposu, IndexedDB'si ve Service Worker'ı yoktur. Yeni pencere açamaz,
  kendisini çerçeveleyen sayfaları (sarmalayıcıyı, web önizlemesinde kabuğun sayfasını) başka adrese
  götüremez. Başka bir uygulama kaydının ya da VADO'nun herhangi bir verisini okuyamaz.
- _Sarmalayıcının çerçeve kısıtı._ Sarmalayıcı belgenin güvenlik politikası, çerçeveye yalnızca
  paketin giriş belgesinin yüklenmesine izin verir (`frame-src`). Tarayıcı motoru bu kısıtı paketin
  kendi başlattığı gezinmelere de uygular: paket başka bir adrese gitmek isterse istek daha
  gönderilmeden reddedilir. Bağlantıya tıklama, form gönderme, `location` ataması, sayfa
  yenileme etiketi, `data:` ve `blob:` adresleri, telefon ve uygulama şemaları (`tel:`, `intent:`)
  ve sunucu yönlendirmesi bu kısıta takılır.
- _Paketin güvenlik politikası._ Giriş belgesi kendi `Content-Security-Policy` başlığıyla sunulur.
  Kod yalnızca paketin kendi klasöründen çalışır (satır içi betik, `eval`, WebAssembly ve dışarıdan
  kod yoktur); ağ bağlantısı yalnızca o klasöre ve paketin bildirim dosyasında yazan adreslere
  kurulur; paketin başka bir sayfayı çerçevelemesi, eklenti ve form gönderimi kapalıdır. Kaynaklar
  `'self'` ile değil paketin klasörüyle sınırlandığı için paket, aynı alan adındaki API'yi ya da
  başka bir kaydın dosyalarını çağıramaz. Giriş belgesi dışındaki dosyalar belge olarak açılırsa
  etkisizdir: pakette betik çalıştırabilen tek belge giriş belgesidir.
- _Sarmalayıcının köprü kuralı._ Paket köprüyle sarmalayıcı üzerinden konuşur. Sarmalayıcı
  yalnızca çerçevesinden gelen ilk bağlantıyı kabul eder; çerçeveden ikinci bir bağlantı isteği
  gelirse (ilk sayfa gitmiş, yerine başkası yüklenmiş demektir) ya da tarayıcı çerçeve kısıtının
  ihlalini bildirirse çerçeveyi kaldırır ve kabuğa haber verir. Sonradan yüklenen bir sayfa köprüye
  ulaşamaz.
- _Kabuktaki kilit._ Telefondaki WebView görünümde yüklenen adresleri denetler: kaydın adres
  kapsamı dışındaki sayfa açılmaz, sistem tarayıcısına ya da başka bir uygulamaya da devredilmez.
  iOS'ta kilit her çerçevenin gezinmesini görür ve yanıt gelene kadar bekler; Android'de yalnızca
  ana sayfanınkini görür (bkz. Bilinen sınırlar). Ana sayfa olarak sarmalayıcıdan başka bir sayfa
  yüklenmeye başlarsa kabuk görünümü kaldırır. Köprü iletisi yalnızca sarmalayıcı belgeden
  geldiyse işlenir; paketin köprüye sarmalayıcıyı atlayarak gönderdiği ileti kabul edilmez. Yeni
  pencere, dosya sistemi erişimi, çerez paylaşımı, tarayıcı deposu ve konum kapalıdır. Kamera ve
  mikrofon, sarmalayıcıyla ve paketle birlikte gönderilen `Permissions-Policy` başlığıyla
  kapatılır; iOS'ta kabuk isteği ayrıca reddeder.
- _Alt alan adı (isteğe bağlı)._ `VADO_APPS_ORIGIN` ayarlandığında her uygulama kaydı kendi alan
  adından sunulur; kayıtlar birbirinden ve API'den tarayıcının kaynak ayrımıyla da ayrılır. Bu
  alan adlarından API'nin hiçbir uç noktasına ulaşılamaz.

Bu katmanların neyi, hangi tarayıcı motorunda engellediği deneyle ölçüldü; sonuçlar ve açık kalan
yollar "Bilinen sınırlar" bölümündedir.

**Yetki, izin ve kimlik.**

- Her köprü metodu, paketin bildirim dosyasında istediği bir yetkiye bağlıdır; inceleyen bu
  yetkileri ve bağlanılacak adresleri, önceki onaylı sürüme göre farkıyla birlikte görür.
- Kimlik, kamera ve konum için kullanıcıya ayrıca sorulur; izin geri alınabilir. Yeni bir sürüm
  yetkileri ya da bağlanılan adresleri değiştirirse verilmiş izinler geçersiz olur ve kullanıcıya
  yeniden sorulur.
- Köprü iletisinde mini uygulamanın kimliği yoktur; kabuk, isteğin geldiği pencereyi kendisi bilir.
  Bir mini uygulama başkasının adına istek gönderemez. Köprü, paketin sarmalayıcıya verdiği tek bir
  ileti kapısından geçer; başka bir pencereden ya da ikinci kez gelen bağlantı isteği kabul
  edilmez.
- Mini uygulama kullanıcının gerçek kimliğini değil, o uygulama kaydına özel bir takma kimliği
  görür. Aynı paketi kullanan iki işletme aynı kullanıcıyı eşleştiremez. Takma kimlik yalnızca bu
  işe ayrılmış anahtarla türetilir ve geri çevrilemez.

**Kapatma.**

- Tek bir kayıt kapatılabilir ya da onaylı bir sürüm geri çekilebilir; ikincisi o sürümü yayınlayan
  bütün kayıtları kapatır. Kapanan kayıt listeden kalkar, açılamaz, kimlik ve ödeme alamaz, QR kodu
  çalışmaz ve dosyaları artık sunulmaz. Bunların hepsi aynı kurala bağlı olduğu için kapatma, bir
  sonraki istekte geçerlidir.
- Yükleme, inceleme kararları, yayın, ayar değişikliği ve geri alma denetim kaydına yazılır; yayın
  geçmişi değiştirilemez.

**Yüklemede.**

- Arşiv, dosyaları saklanmadan önce denetlenir: boyut, dosya sayısı ve açılmış boyut sınırı
  (sıkıştırma bombası), üst klasöre çıkan ve gizli dosya yolları, sembolik bağlantılar, aynı adın
  yinelenmesi, şifreli girdiler, yapısı tutarsız arşivler ve izinli olmayan dosya türleri.
  Kurallara uymayan arşivden hiçbir şey saklanmaz.
- Canlı ortamda paket yalnızca şifreli (`https`, `wss`) adreslere bağlanmayı bildirebilir.

### Ödeme

- Kart bilgisi VADO'ya da mini uygulamaya da girmez.
- Ödeme oturumunu mini uygulama değil kabuk açar; uygulama kaydının kullanıcılara açık olduğu,
  ödeme yetkisi ve satıcı eşleştirmesi sunucuda doğrulanır. Tutar, sunucunun kaydettiği değerden
  gösterilir.
- Onay yalnızca VADO'nun kendi ekranında verilir; aynı sipariş için ikinci oturum açılmaz.

### QR kodlar

- Kodlar sunucu tarafından imzalanır; sahte kod üretilemez. Kişisel kodlar kısa ömürlüdür.
- Kod, imzalayan anahtarın kimliğini taşır. Anahtar değiştirildiğinde eski kodlar belirlenen güne
  kadar okunur; eski anahtarla okutulan her kod günlüğe düşer.
- Kod her zaman sunucuda çözülür ve hedefin hâlâ geçerli olduğu yeniden denetlenir.

### Yönetim

- Yönetim uç noktaları yalnızca yönetici anahtarıyla çağrılır; anahtar zamanlama saldırısına
  dayanıklı biçimde karşılaştırılır ve tarayıcıya hiç gönderilmez.
- Panel HTTP Basic girişinin arkasındadır; giriş sunucu işlevlerinde ikinci kez doğrulanır. Canlı
  ortamda giriş bilgisi tanımlı değilse panel açılmaz.
- Panelden yapılan her değişiklik denetim kaydına yazılır.

## Bilinen sınırlar

Bunlar hata değil, bu sürümün bilinçli sınırlarıdır; yayın kararını verirken hesaba katın.

- **Uçtan uca şifreleme yoktur.** Mesajlar aktarımda TLS ile korunur, sunucuda düz metin saklanır.
  Sunucuya ya da veritabanına erişen kişi mesajları okuyabilir.
- **Fotoğraf adresleri oturum istemez.** Adres tahmin edilemez ama adresi öğrenen herkes fotoğrafı
  açabilir. Sohbetten çıkarılan bir üye, daha önce gördüğü fotoğrafların adresini kullanmaya devam
  edebilir.
- **Panelde tek hesap vardır.** Yöneticiler aynı kullanıcı adı ve şifreyi paylaşır; denetim
  kaydında kimin yaptığı ayırt edilemez. İki adımlı doğrulama yoktur. Paneli VPN ya da IP kısıtıyla
  koruyun.
- **Web önizlemesinde belirteç tarayıcı deposundadır.** Web sürümü deneme amaçlıdır.
- **İstek sınırı IP adresine göredir.** Çok sayıda adres kullanan bir saldırganı durdurmaz; aynı
  adresi paylaşan gerçek kullanıcıları etkileyebilir.
- **Cihaz kimliği ve cihaz anahtarı donanıma bağlı değildir.** İkisi de telefonun güvenli deposunda
  durur ama cihazın gerçekten o cihaz olduğu Google Play Integrity ya da Apple App Attest ile
  doğrulanmaz; root ve jailbreak denetimi yoktur. Cihaz kilidini uygulama sorar; anahtar, işletim
  sisteminin parmak iziyle açtığı bir donanım anahtarı değildir. Cihazdaki depoyu kopyalayabilen
  biri ikisini de kopyalar.
- **Paket yalıtımı iki tarayıcı motorunda denendi; gerçek telefonda denenmedi.** Paketin açıldığı
  belgeden çıkış 59 denemeyle ölçüldü: `location` ataması, bağlantı, form, sayfa yenileme etiketi,
  yeni pencere, üst pencereyi götürme, `data:` ve `blob:` adresleri, telefon ve uygulama şemaları,
  sunucu yönlendirmesi, sayfa yüklenmeden gezinme, görsel, betik, stil, `fetch`, WebSocket ve
  benzerleri; karşılaştırma için sayfa değişmeden yapılan gezinmeler de (serbest kalmalıdır).
  Denemeler Chromium 141'de üç düzende (telefondaki köprünün Android davranışı, iOS davranışı ve web
  önizlemesi), WebKit 2.52'de (WebKitGTK) iki düzende (iOS davranışı ve web önizlemesi) yinelendi;
  köprünün telefondaki davranışı öykünüldü (Android: ileti nesnesi her çerçevededir, kabuk
  gönderenin kaynağını görür; iOS: ileti nesnesi yalnızca ana çerçevededir). Hiçbirinde paketin
  dışına istek çıkmadı. Ölçüm önce bir deney sunucusunda yapıldı, sonra kaçış yollarını deneyen bir
  paket API'ye yüklenip yayınlanarak API'nin gerçekten sunduğu sarmalayıcı belge ve başlıklarla
  yinelendi; sonuç aynıydı. Deney sunucusunda sarmalayıcının çerçeve kısıtı kaldırıldığında iki
  motorda da dokuz yoldan istek çıktı; yani ölçüm sızıntıyı görebiliyor. Bunlar masaüstü
  motorlarıdır: Android System WebView ve iOS WKWebView'in kendisi, kabuğun kilidi ve köprünün
  telefondaki taşıması yalnızca derlendi. Yayından önce iki platformda da gerçek cihazda
  sınanmalıdır.
- **WebRTC bağlantıları sınırlanamıyor.** Tarayıcılar, sayfanın WebRTC ile kurduğu bağlantıları
  güvenlik politikasına bağlamıyor (denenen Chromium 141, bunun için önerilen `webrtc` kuralını
  tanımıyor). Denemede paket, `RTCPeerConnection` ile bildirim dosyasında yazmayan bir adrese UDP
  paketleri gönderebildi ve kendi seçtiği bir alan adını çözdürebildi; alan adına gömülen veri bu
  yolla paketin dışına çıkar. Karşı uç bağlantıyı tamamlarsa aynı yoldan veri kanalı da
  kurulabilir (bu kısmı denenmedi). Bu yol 2.3.0'da da açıktı. Sayfanın içinden sağlam biçimde
  kapatılamıyor: paket, içeriğini kendisinin yazdığı bir alt çerçevede taze bir ortam açabiliyor.
  Kalıcı çözüm WebRTC'yi WebView'in kendisinde kapatmaktır ve yerel kod gerektirir (yol
  haritasında). O zamana kadar yükleme incelemesi `RTCPeerConnection` kullanımını "incele" bulgusu
  olarak gösterir; karartılmış kodu yakalamaz. Gerekçesi açık olmayan WebRTC kullanan sürüm
  onaylanmamalıdır.
- **Android'de paketin çerçevesinin gezinmesini yalnızca tarayıcı motoru engeller.** Kullanılan
  WebView kitaplığı Android'de alt çerçevelerin gezinmesini kabuğa sormaz. Paketin başka bir adrese
  gitmesini engelleyen, sarmalayıcının çerçeve kısıtıdır; Chromium'la yapılan denemede istek
  gönderilmeden uygulandı, ama Android'de bu yol için ikinci, bağımsız bir yerel katman yoktur.
  iOS'ta kilit her çerçeveyi ayrıca denetler; WebKit üzerinde kilit öykünülerek yapılan denemede,
  çerçeve kısıtı kaldırıldığında kilit tek başına da isteği durdurdu.
  Sarmalayıcının köprü kuralı ikinci hattır ama eksiktir: ilk sayfası yüklenmeden başka adrese
  giden bir paketi ayırt edemez. Ana sayfa için durum farklıdır: paket, kum havuzu yüzünden ana
  sayfayı (sarmalayıcıyı) götüremez; kitaplığın Android'deki kilidi ise yanıt çeyrek saniyede
  gelmezse gezinmeye izin verdiği için kesin sınır sayılmaz, ana sayfa değişirse kabuk görünümü
  kaldırır.
- **Android'de kamera ve mikrofonu kabuk reddedemiyor.** Kullanılan WebView kitaplığı, VADO'nun
  sahip olduğu Android iznini (QR okutmak için alınan kamera izni) isteyen sayfaya kendiliğinden
  verir. Bunu sarmalayıcıyla ve paketle birlikte gönderilen `Permissions-Policy` başlığı kapatır;
  Android'de bu konuda yerel bir ikinci katman yoktur. iOS'ta kabuk isteği ayrıca reddeder.
- **Web önizlemesi tam Chrome'da iki yan kanal bırakır.** Önizlemede de paketin gezinmesini
  sarmalayıcı engeller ve istek gönderilmez. Ama tam Chrome 141 ile yapılan denemede iki davranış
  görüldü: engellenen gezinmenin hedefine, istek gönderilmese de önceden bağlantı açılıyor (alan
  adı çözülüyor; alan adına gömülen veri sızabilir) ve `<link rel="prerender">` ipucu güvenlik
  politikasına bakılmadan istek gönderiyor. Bunların Android WebView'de olup olmadığı ölçülmedi;
  içinde bu Chrome özellikleri bulunmayan başsız Chromium'da görülmedi. Önizleme geliştirme ve
  tanıtım içindir.
- **Alt alan adı kipi kapalıyken paketler API ile aynı alan adından sunulur.** Ayrım kimliksiz
  kaynağa ve güvenlik politikasındaki klasör kısıtına dayanır. Tarayıcılar bu klasör kısıtını
  yönlendirmeden sonra uygulamaz; bu yüzden API bu adreslerde hiçbir zaman yönlendirme yapmaz.
  Sarmalayıcı belge de bu kipte API'nin kaynağında çalışır; kendi betiğinden başka hiçbir şey
  çalıştıramaz ve hiçbir yere bağlanamaz, ama kaynak ayrımı yoktur. Canlı ortamda
  `VADO_APPS_ORIGIN` ile kayıtları ayrı alan adlarına almak önerilir.
- **Otomatik inceleme güvence değildir.** Yüklemedeki bulgular kalıp eşleştirmeye dayanır;
  karartılmış kodu yakalamaz. Kararı inceleyen kişi verir, sınırları çalışma anındaki katmanlar
  çizer. Bu sınırların içinde kalan kötü niyet mümkündür: paket, kullanıcının izniyle aldığı adı
  ve takma kimliği, bildirim dosyasında yazan adreslere gönderebilir. İnceleyen, özellikle
  bağlanılan adreslere ve istenen yetkilere bakmalıdır.
- **Yükleyen ile onaylayan ayrılmaz.** Panelde tek hesap olduğu için paketi yükleyen kişi onu
  onaylayabilir; dört göz ilkesi ve geliştirici hesapları yoktur. Paketin kimden geldiği bir imzayla
  değil, panele erişimle belirlenir.
- **Geri çekilen dosyalar geri toplanamaz.** Sarmalayıcı belge ve paketin giriş belgesi her
  açılışta sunucuya sorulur; geri çekilen sürümde ikisi de artık sunulmaz. Paketin diğer dosyaları
  (betik, stil, görsel) değişmez olduğu için uzun süre önbelleklenir ve daha önce indirmiş bir
  cihazda ya da aradaki bir önbellekte (CDN) kalabilir; tek başlarına belge olarak açılamazlar.
  Kapatılan kaydı kabuk açmaz ve API ona kimlik ya da ödeme vermez; o anda açık duran bir mini
  uygulamanın ekranı ise kullanıcı çıkana kadar kalır.
- **Paket deposu sunucunun diskindedir.** Diske yazabilen biri bir dosyayı değiştirirse bu, ilk
  okumada özet uyuşmazlığıyla yakalanır ve dosya sunulmaz. Hem diske hem veritabanına yazabilen
  birine karşı koruma yoktur; paketler ayrıca imzalanmaz.
- **Paket boyutu sınırı ölçüme dayanmıyor.** Varsayılan 5 MB sınırı geçicidir; kesin değer gerçek
  cihazlarda açılış süresi ölçüldükten sonra belirlenecektir.
- **Mini uygulama kimliği anahtarı değiştirilemez.** Değişirse bütün kullanıcıların mini
  uygulamalardaki kimliği değişir. Anahtar sızarsa bunun otomatik bir geçişi yoktur; anahtarın
  yanlışlıkla değiştirildiğini de sunucu yalnızca 2.1'den geçiş sırasında fark eder. Değeri
  yedekleyin.
- **Anahtarlar ortam değişkeninde durur.** Gizli değer kasası ya da donanım modülü kullanılmaz;
  sunucuya ya da `.env` dosyasına erişen kişi anahtarları okuyabilir.
- **Parmak izi, yüz ve uygulama kilidi gerçek telefonda denenmedi.** Sunucu tarafı ve SMS koduyla
  doğrulama uçtan uca denendi; cihaz kilidini soran bölüm yalnızca derlendi.
- **Yeni cihaz uyarısı yalnızca açık cihazlara ulaşır.** Anlık bildirim (push) olmadığı için
  uygulama kapalıyken uyarı görülmez; oturum listesindeki "Yeni cihaz" işareti kalır.
- **Konuma ya da alışılmadık IP adresine göre şüpheli giriş tespiti yoktur.** IP adresi kaydedilir
  ve kullanıcıya gösterilir ama karar vermede kullanılmaz.
- **Kötüye kullanım tespiti yoktur.** İstenmeyen içerik yalnızca kullanıcı şikayetiyle fark edilir.
- **Bağımsız güvenlik denetimi yapılmadı.**

Giderilmesi planlananlar [docs/YOL_HARITASI.md](docs/YOL_HARITASI.md) içindedir.

## Bağımlılık uyarıları

`npm install` sonunda "30 vulnerabilities" satırı çıkar. 4 Ekim 2026 tarihindeki durum:

- API, yönetim paneli, sözleşmeler, mini uygulama kitaplığı ve örnek mini uygulamanın
  bağımlılıklarında bilinen açık yoktur (`npm audit --workspace @vado/api` sıfır döner).
- Uyarıların tamamı mobil uygulamanın bağımlılıklarındadır ve dört kayıttan türer. Expo ve React
  Native paketleri bu dört pakete bağlı olduğu için npm her birini ayrı sayar; sayı bu yüzden
  büyüktür.

| Paket                  | Kayıt               | Nerede çalışır                                   | Durum                                    |
| ---------------------- | ------------------- | ------------------------------------------------ | ---------------------------------------- |
| `braces`               | GHSA-vfj7-8cjw-p6xm | Metro derleme aracı, geliştirici bilgisayarında  | Düzeltilmiş sürüm yayınlanmadı           |
| `node-forge`           | GHSA-86w9-cpqp-85rv | Expo komut satırı aracı, geliştirici bilgisayarı | Düzeltilmiş sürüm yayınlanmadı           |
| `uuid`                 | GHSA-w5hq-g745-h8pq | iOS proje dosyasını üreten araç (`xcode`)        | Araç eski sürüme bağlı                   |
| `decode-uri-component` | GHSA-vcc3-ghjq-m6fr | Expo Router'ın adres çözümlemesi, uygulama içi   | Expo Router 58'de giderildi (ön sürümde) |

İlk üçü yalnızca derleme sırasında, geliştirici bilgisayarında çalışır; uygulama paketine girmez.
Dördüncüsü uygulamanın içindedir: bozuk biçimli bir bağlantı uygulamayı yanıt vermez hâle
getirebilir, veri sızdırmaz. Proje Expo'nun en güncel kararlı sürümünü (SDK 57) kullanır; SDK 58
kararlı olduğunda yükseltmek bu uyarıyı kaldırır.

`npm audit fix --force` çalıştırmayın. npm bu uyarıları Expo'yu 44 sürümüne düşürerek "düzeltmeyi"
önerir; bu, uygulamayı bozar.

## Canlı ortamda sizin sorumluluğunuzda olanlar

- TLS: API ve panel yalnızca `https` üzerinden yayınlanmalıdır.
- `/v1/admin/` yolu internete kapatılmalıdır (Nginx örneğinde kapalıdır).
- Anahtarlar (`VADO_OTP_KEYS`, `VADO_QR_KEYS`, `VADO_OPENID_KEY`, `VADO_ADMIN_API_KEY`, veritabanı
  ve panel şifreleri) rastgele, birbirinden farklı olmalı ve depoya eklenmemelidir.
  `VADO_OPENID_KEY` ayrıca yedeklenmelidir (bkz. [docs/ANAHTARLAR.md](docs/ANAHTARLAR.md)).
- PostgreSQL ve Redis dışarıya açılmamalıdır (örnek Compose dosyasında kapalıdır).
- Paket deposu (`VADO_PACKAGE_DIR`) veritabanıyla birlikte yedeklenmeli; yedekten dönüşten sonra
  `packages verify` komutuyla denetlenmelidir.
- Ters vekil, API'nin paket dosyalarıyla gönderdiği güvenlik başlıklarını değiştirmemelidir
  (Nginx örneğinde değiştirilmez). Paketlerin önüne önbellek (CDN) konursa, sürüm geri
  çekildiğinde önbellek de temizlenmelidir.
- Paketleri kimin inceleyip onaylayacağı belirlenmeli; panel erişimi bu kişilerle sınırlı
  tutulmalıdır.
- Sunucu diski ve yedekler şifrelenmeli; yedeklere erişim kısıtlanmalıdır.
- İşletim sistemi, Docker ve bağımlılıklar güncel tutulmalıdır (`npm audit`).

Kurulum adımları: [docs/YAYIN.md](docs/YAYIN.md).
