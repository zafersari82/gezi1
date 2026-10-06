# Güvenlik

Bu belge VADO'nun neyi nasıl koruduğunu, neyi korumadığını ve bir açık bulunduğunda ne yapılacağını
anlatır. Tasarım kararlarının gerekçesi [docs/MIMARI.md](docs/MIMARI.md) içindedir.

## Açık bildirimi

Bir güvenlik açığı bulduysanız herkese açık bir yerde paylaşmadan önce uygulamayı işleten ekibe
bildirin. Yayından önce buraya bir iletişim adresi yazılmalı ve kimin, ne kadar sürede yanıt
vereceği belirlenmelidir; bu sürümde tanımlı bir adres yoktur.

## Güven sınırları

| Taraf             | Güven                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| API               | Tek karar noktası. Her yetki ve her kural burada denetlenir.                                                                          |
| Mobil uygulama    | Güvenilmez. Yaptığı denetimler yalnızca kullanıcıya erken bilgi vermek içindir.                                                       |
| Mini uygulama     | Güvenilmez üçüncü taraf kodu. İncelenmiş olsa da yalıtılmış çalışır; belirteç, numara, kart görmez.                                   |
| Yönetim paneli    | Güvenilir ama dar: API'ye yalnızca sunucu tarafından, yönetici anahtarı ve hesabın oturumuyla ulaşır. Hesabı ve yetkiyi API doğrular. |
| SMS aracı servisi | Doğrulama kodunu görür; yalnızca iç ağdan erişilebilir olmalıdır.                                                                     |

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

- Doğrulama kodu özeti, QR imzası, mini uygulama kimliği ve mini uygulama kimlik belirteci (2.5)
  dört bağımsız anahtar ailesiyle korunur. Biri sızarsa ya da değiştirilirse diğerleri etkilenmez.
- Doğrulama kodu ve QR anahtarları sürümlüdür: imza, anahtarın kimliğini taşır. Anahtar
  değiştirildiğinde yenisi imzalar, eskisi belirlenen güne kadar yalnızca doğrular; süresi dolan
  anahtar kendiliğinden devre dışı kalır.
- Mini uygulama kimliği anahtarı tek ve uzun ömürlüdür; diğer anahtarların değişmesi kimlikleri
  değiştirmez.
- Kimlik belirteci Ed25519 ile imzalanır; gizli anahtar yalnızca API'dedir, mini uygulamaların
  sunucuları belirteci yayımlanan açık anahtarla doğrular. Anahtar halkadır: değiştirildiğinde
  eskisi ertesi günün sonuna kadar yayımlanır.
- Canlı ortamda dört aile de açıkça tanımlı, en az 256 bit, rastgele üretilmiş ve birbirinden farklı
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

### Mini uygulama kimlik belirteci

- Belirteç yalnızca kaydı açık, `identity.basic` yetkisi olan ve kullanıcının kimlik iznini verdiği
  mini uygulamaya verilir. Beş dakika geçerlidir.
- İçinde kullanıcının o kayda özgü takma kimliği (`sub` = `openId`), kaydın kimliği (`aud`) ve
  API'nin adresi (`iss`) vardır; ad, telefon ve VADO kullanıcı kimliği yoktur. Bir kayda verilen
  belirteç başka bir kaydın sunucusunda `aud` tutmadığı için geçmez.
- Her belirtecin rastgele bir `jti` değeri vardır; tek kullanım isteyen sunucu bunu saklayarak
  yeniden gönderilen belirteci reddedebilir. VADO belirteci geri çağıramaz: sızan bir belirteç
  süresi dolana kadar (en fazla beş dakika) geçerlidir.

### QR kodlar

- Kodlar sunucu tarafından imzalanır; sahte kod üretilemez. Kişisel kodlar kısa ömürlüdür.
- Panelden üretilen mini uygulama kodu en fazla beş parametre taşıyabilir (2.5). Parametreler
  imzanın içindedir: değiştirilen kod okunmaz. Kullanıcıların ürettiği kod parametre taşımaz.
  Mobil uygulama parametreleri ekran adresine yazmaz, bellekte tutar; bir bağlantı ya da başka
  bir uygulama mini uygulamaya parametre veremez. Kod üretimi denetim kaydına yazılır.
- Kod, imzalayan anahtarın kimliğini taşır. Anahtar değiştirildiğinde eski kodlar belirlenen güne
  kadar okunur; eski anahtarla okutulan her kod günlüğe düşer.
- Kod her zaman sunucuda çözülür ve hedefin hâlâ geçerli olduğu yeniden denetlenir.

### Yönetim

- Her yönetici kendi hesabıyla girer; paylaşılan kullanıcı adı ve şifre yoktur. Hesaplar,
  parolalar, ikinci adım ve oturumlar API'nin veritabanındadır. Panel "ben şu yöneticiyim" diye
  beyan etmez: hesabın oturum belirtecini API'ye taşır, API her istekte oturumu, hesabın durumunu
  ve rolünün iznini veritabanından doğrular.
- Yönetim uçları iki katmanla korunur: yönetici anahtarı isteğin panel sunucusundan geldiğini,
  oturum belirteci isteği yapan hesabı kanıtlar. Biri tek başına yetmez. Anahtar zamanlama
  saldırısına dayanıklı biçimde karşılaştırılır ve tarayıcıya hiç gönderilmez.
- Yetki her uçta sunucuda denetlenir. Rol-izin tablosu tek yerdedir (`packages/contracts`); her
  yönetim ucu gerektirdiği izni bildirir ve izin bildirmeyen uç kaydedilemez (API başlamaz).
  Otomatik test, kayıtlı her yönetim ucunu her rolle çağırır ve izni olmayan her rolün
  reddedildiğini doğrular. Panelde menüyü ve düğmeleri gizlemek yalnızca kolaylıktır.
- Parola scrypt ile (N = 2^15, r = 8, p = 1; hesap başına rastgele tuz) saklanır ve sabit zamanda
  karşılaştırılır; en az 12 karakterdir. Hesap yoksa da bir özet hesaplanır: "hesap yok", "parola
  yanlış", "hesap kapalı" ve "hesap kilitli" yanıtı da süresi de aynıdır.
- Parola ve ikinci adım denemeleri birlikte sayılır; beş hatalı denemeden sonra hesap 15 dakika
  kilitlenir. Sayaç karşılaştırmadan önce artırılır; eş zamanlı denemeler sınırı aşamaz. Giriş
  uçlarına ayrıca IP başına dakikada 30 istek sınırı uygulanır.
- İkinci adım bütün hesaplarda zorunludur: doğrulama uygulamasının kodu (TOTP, RFC 6238) ya da
  tek kullanımlık kurtarma kodu. Kabul edilen son kodun zaman adımı saklanır; aynı kod ve ondan
  eskisi ikinci kez geçmez. Kurtarma kodları 80 bit rastgeledir, yalnızca SHA-256 özetleri
  saklanır ve her biri bir kez geçer. Uygulama RFC 4226 ve RFC 6238'in sınama vektörleriyle
  sınanır.
- Parola doğrulanınca açılan yarım oturum yalnızca ikinci adıma yarar ve 10 dakikada kapanır;
  ikinci adım geçilince belirteç değişir. Tam oturum belirteci 256 bit rastgeledir, veritabanında
  SHA-256 özeti saklanır; 30 dakika kullanılmazsa ya da 12 saat dolunca kapanır. Çerez
  `HttpOnly`, `SameSite=Strict` ve canlı ortamda `Secure`'dur.
- Parola değişince hesabın diğer oturumları; rol değişince, hesap kapatılınca, parola ya da ikinci
  adım sıfırlanınca bütün oturumları kapanır. Yönetici kendi oturumlarını görür ve uzaktan kapatır.
- İlk hesap yalnızca sunucuda, komut satırından açılır; varsayılan parola yoktur. Yöneticinin
  belirlediği geçici parolayla açılan hesap, parolasını değiştirene kadar hiçbir izni kullanamaz.
- Son etkin sahip hesabı sahiplikten çıkarılamaz ve kapatılamaz; kural veritabanında da durur.
- **Dört göz ilkesi:** paket sürümünü yükleyen ya da incelemeye gönderen hesap onu onaylayamaz.
  Kural serviste ve veritabanında (tetikleyici, doğrudan SQL ile sınanır) uygulanır.
- Panelden yapılan her değişiklik, girişler, başarısız girişler, hatalı ikinci adım kodları,
  ikinci adımın kurulması ve sıfırlanması, parola ve rol değişiklikleri denetim kaydına hesabın
  kimliğiyle yazılır.
- **İşletme hesapları (2.5)** bir işletmeye bağlıdır ve yalnızca o işletmenin satıcı olarak bağlı
  olduğu uygulama kayıtlarını görür; başka bir kayıt için "bulunamadı" (404) alır, kaydın var
  olduğunu öğrenemez. Yapabildiği yalnızca okumak, işletme ayarlarını değiştirmek ve QR kodu
  üretmektir. Kapsam iki katmanlıdır: kapsamı uygulayan uçlar kayıtları süzer; ayrıca kapsamlı bir
  hesap, rol tablosu yanlışlıkla genişletilse bile kapsamı uygulamayan bir uca giremez (test, rol
  tablosunu bilerek genişletip bunu sınar). Hesabın işletmesi ve rolü sonradan değişmez; kural
  veritabanında da (kısıt ve tetikleyici) durur. İşletme hesabına yayın geçmişinde VADO ekibinin
  adları gösterilmez.
- Canlı ortamda demo modu açılamaz; bu yüzden demo modundaki `000000` ikinci adım kolaylığı canlıya
  sızmaz. Paylaşılan eski panel değişkenleri (`VADO_PORTAL_USER`, `VADO_PORTAL_PASSWORD`) canlı
  panelde hâlâ tanımlıysa panel açılmaz.

### Anlık bildirimler

- Bildirim adresi (Expo push belirteci) oturuma bağlıdır ve yalnızca o oturumun sahibine
  yazılabilir; çıkışta, oturum uzaktan kapatılınca ve hesap askıya alınınca veritabanı adresi siler
  (tetikleyici). Aynı adres başka bir hesapla kaydedilince önceki hesaptan alınır: telefonu
  devralan kişi önceki hesabın bildirimlerini görmez.
- Mesaj bildiriminin içeriği varsayılan olarak gizlidir ("Yeni mesajın var"); gönderen ve metin
  yalnızca kullanıcı açarsa, en fazla 120 karakter olarak gönderilir. Fotoğrafın kendisi
  gönderilmez.
- Yeni cihazdan giriş bildirimi kullanıcının diğer cihazlarına her zaman gider ve kapatılamaz.
- Bildirim gönderimi isteği bekletmez; Expo'ya ulaşılamaması mesaj gönderimini etkilemez.
- Bildirimin verisi yalnızca sohbetin kimliğini taşır; mobil uygulama tanımadığı veriyle hiçbir
  ekran açmaz.

## Bilinen sınırlar

Bunlar hata değil, bu sürümün bilinçli sınırlarıdır; yayın kararını verirken hesaba katın.

- **Anlık bildirimler üçüncü taraflardan geçer.** Bildirim Expo'ya, oradan Google'a (FCM) ya da
  Apple'a (APNs) gider. Önizleme açıksa gönderenin adı ve mesajın ilk 120 karakteri bu
  sağlayıcıların sunucularından geçer (KVKK açısından yurt dışına aktarım; bkz.
  [docs/TURKIYE_UYUM.md](docs/TURKIYE_UYUM.md)). Önizleme kapalıyken yalnızca "Yeni mesajın var"
  ve sohbetin kimliği gider. Expo'nun teslim makbuzları (receipts) okunmaz; geçersiz adres yalnızca
  gönderim anındaki yanıtta "DeviceNotRegistered" dönerse silinir. **Cihaz tarafı denenmedi.**
- **İşletme hesabının kapsamı satıcı bağlantısına dayanır.** Bir kayda birden çok işletmenin
  satıcısı bağlıysa her biri o kaydı görür ve ayarlarını değiştirebilir (ayarlardaki satıcı
  seçimi dahil). Kayıt başına tek işletme önerilir.

- **Uçtan uca şifreleme yoktur.** Mesajlar aktarımda TLS ile korunur, sunucuda düz metin saklanır.
  Sunucuya ya da veritabanına erişen kişi mesajları okuyabilir.
- **Fotoğraf adresleri oturum istemez.** Adres tahmin edilemez ama adresi öğrenen herkes fotoğrafı
  açabilir. Sohbetten çıkarılan bir üye, daha önce gördüğü fotoğrafların adresini kullanmaya devam
  edebilir.
- **Panel hesaplarının sınırları.** İkinci adımın sırrı (TOTP) çalışabilmek için veritabanında
  açık durur; veritabanını okuyabilen biri kodları üretebilir (parolayı yine bilmesi gerekir).
  Donanım anahtarı (WebAuthn, passkey) desteklenmez. Kilitlenme hesap adına göredir: hesap adını
  bilen biri yanlış parolalarla hesabı 15 dakikalık aralarla kilitli tutabilir; bunu IP başına
  istek sınırı yavaşlatır ama durdurmaz. Hesabın IP adresi ve tarayıcısı panel sunucusunun
  ilettiği başlıktan okunur (anahtarı bilen panel sunucusuna güvenilir). Eski kayıtlarda (2.4'ten
  önce) işlemi yapan "Ortak panel hesabı (2.3)" olarak görünür; o kayıtlarda kişi ayırt edilemez.
  Paneli yine de VPN ya da IP kısıtıyla koruyun.
- **Sürümün son kararı tek alanda tutulur.** Onaylı bir sürüm geri çekilince "son karar veren"
  alanına geri çeken yazılır; onaylayanın kim olduğu denetim kaydında kalır.
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
- **Geliştirici hesapları ve paket imzası yoktur.** Paketi panel hesabı olan biri yükler; paketin
  kimden geldiği bir imzayla değil, panele erişimle belirlenir. Yükleyen ile onaylayan ayrıdır
  (dört göz ilkesi) ama iki hesabın aynı kişiye verilmesini sistem engelleyemez.
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
- **Yeni cihaz uyarısı açık oturum adreslerine gönderilir.** SQL outbox teslimi kalıcıdır;
  Expo kabulü cihaz gösterimi garantisi değildir. Gerçek telefon teslimi bu ortamda denenmedi.
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
  şifresi) rastgele, birbirinden farklı olmalı ve depoya eklenmemelidir.
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

## 2.6: işletme yalıtımı

API `vado_app` ile bağlanır; başlangıç kontrolü sahip rolünü, süper kullanıcıyı, RLS atlamayı
ve ayrıcalıklı rol üyeliğini reddeder. `business_members`, `branches`, `branch_hours`,
`business_customers`, `app_instances` tablolarında RLS ve FORCE zorunludur. İşlem kapsamı yoksa
veri görünmez ve yazılamaz. `TenantScope` yalnızca doğrulanmış üyelik veya kabuk bağlamından
üretilir; iç işlem başka işletmeye geçemez. Bileşik yabancı anahtarlar işletmeler arası bağları
engeller. Platform erişimi ayrı `vado_platform` bağlantısı ve açık `platformScope` yoluyla
çalışır; motor modüllerinin bu yolu veya kapsam kurucusunu içe aktarması lint hatasıdır.

Hesap silme işlemi platform yolunda, müşteri bağını ve üyelikleri aynı işlemde temizler.
İşletmenin rastgele müşteri kimliği kullanıcı kimliğinden türetilmez. Yeni işletmenin sahip
üyeliği sınırlı veritabanı tetikleyicisiyle kurulur; tetikleyici önceki işlem kapsamını geri yükler.

Katalog tablolarında da RLS/FORCE ve işletme kimliğini içeren yabancı anahtarlar zorunludur.
Müşteri kataloğu pasif ürünleri ve kullanılmayan seçenek gruplarını açmaz. Fiyat ve seçenek
bağlarının yazılması, fiyat görüntüsü işleminin kilidini aşamaz. Tutarlar ve vergi oranları
API'de ve veritabanında sınırlandırılır; seçenek kimliği başka gruba taşınamaz.

0009 hesap silme yarışını da kapatır: müşteri bağı yalnızca etkin kullanıcıya kurulabilir.
Bağ kurma kullanıcının okuma kilidini, hesap silme aynı kullanıcının yazma kilidini önce alır.
Böylece silme bittikten sonra bekleyen istek kullanıcı bağını geri kuramaz; veritabanındaki
silinmiş kullanıcı satırının hâlâ bulunması yeni bir bağ için yeterli değildir.

## 2.6 olay ve tekrar koruması

İşletme olayı, teslim ve tekrar anahtarları RLS/FORCE ile yalıtılır. Sohbet ve giriş
olayları ayrı platform kuyruğundadır; uygulama bu kuyruğu okuyamaz, teslim kaydı
yazamaz. Dağıtıcı açık `platformScope` yolu kullanır; motorun bu yola, kapsam kurucusuna
ve genel olay üreticisine erişimi lint ile yasaktır. Olay içeriği ve teslim kayıtları
veritabanında değişmez. İşletme/sipariş sırası, önceki olay teslim edilene kadar korunur.

İç etki ve teslim kaydı aynı SQL işleminde yazılır. Dış çağrı sırasında SQL kilidi yoktur;
başarılı gönderimle teslim kaydı arasındaki çökme çift gönderim doğurabilir. Mobil
foreground denetimi yedi gün içindeki son 2048 kimliği kalıcı tutar; kayıt başarısızsa
gösterimi bastırır. İşletim sistemi arka plan gösterimi için Expo `collapseId` ve `tag`
alanlarına aynı olay kimliği yazılır; gerçek telefonda davranışı bu ortamda denenmedi.

Tekrar anahtarı işletme, uygulama örneği, müşteri ve işlem adına bağlıdır; 24 saatlik
yanıt başka müşteriye verilmez. Farklı gövde `409 idempotency_conflict` alır. Webhook
alıcısı olay kimliğini tekilleştirmeli, `vado-timestamp` tazeliğini (örneğin beş dakika)
ve ham gövde için HMAC-SHA256 imzasını sabit süreli karşılaştırmayla doğrulamalıdır.
İmza girdisi `<zaman>.<ham JSON>`; başlık `vado-signature: sha256=<hex>`. Gizli anahtar
manifestte veya istemcide bulunmaz; yalnızca sunucuyu işleten kişi kurar.

## 2.6 sepet ve sipariş koruması

Altı sipariş tablosu zorunlu RLS/FORCE ve bileşik işletme bağları kullanır. Sepet
düzenlemesi üst kaydın sürümünü aynı işlemde artırır. Checkout anahtarı, sepet kilidi,
güncel katalog, fiyat görüntüsü, geçmiş ve olay tek SQL işlemindedir. Güncel fiyat
veya KDV değişiminde sipariş yazılmaz. Başarılı yanıt 24 saat aynı müşteri bağlamında
tekrar verilir. Fiyat görüntüsü sonradan sıfır tutarlı satırla dahi genişletilemez.
Durum geçişi veritabanındaki değişmez akış ve sürümle doğrulanır; terminal sipariş
değişmez. Müşteri VADO kullanıcı kimliği sipariş yanıtına veya olaya yazılmaz.

Köprü `ordering.basic` yetkisi ister; bütün sipariş parametreleri strict şemadır.
İşletme ve uygulama örneği kabuğun imzalı açılış bağlamından alınır; seçili mini
uygulamanın örneğe gerçekten bağlı olması sunucuda doğrulanır. Oturum belirteci
pakete aktarılmaz. Müşteri yalnızca kendi uygulama örneğindeki siparişlerini okur.

## 2.6 kayıtlı yetenekler ve üyelik iptali

Yetenek manifesti JSON verisidir; sunucu kodu statik kayıt listesinden gelir.
İşletme keyfi paket, sürüm, şema veya kural işlevi yükleyemez. SQL de yalnızca
`ordering.preparation@1.0.0` grafiği ve sınırlı `stationLabel` verisini kabul eder.
Manifest derleyicisi izinli ara adımı, tekil durumları, kayıtlı kural adlarını,
döngüsüz ve erişilebilir akışı doğrular; terminal durumlar değişmez.

İşletme kapsamı verildikten sonra her `withTenant` işlemi etkin kullanıcıyı
ve aynı rolle etkin üyeliği yeniden kilitleyip doğrular. Hesap silme bu
kullanıcıyı önce kilitler; 0012 etkin üye bağını da veritabanında doğrular.
Böylece bekleyen işlem silmeden sonra erişemez veya üyeliği yeniden açamaz.

## VADO Business oturumu ve canlı siparişler

Business, mevcut VADO kullanıcısını ve güncel işletme üyeliğini doğrular. API belirteci
HttpOnly, üretimde Secure ve SameSite=Strict çerezde kalır; istemciye verilen giriş
yanıtı yalnızca başarı bilgisidir. Değişiklik istekleri tam Origin denetiminden geçer.
Vekil yol, yöntem ve sorgu izin listesiyle sınırlandırılır; işletme kimliği üyeliği
doğrulanmış seçimden eklenir. Ürün ve şube yazımı personel rolüne kapalıdır.

0013 bilet tablosunda RLS ve FORCE açıktır; kimlik alanları değişmez. Rastgele biletin
yalnızca özeti kaydedilir, 60 saniyelik süre ve tek kullanımlık güncelleme yarışta da
zorlanır. Bağlantı ömrü en çok beş dakika veya oturumun kalan süresidir; çıkış tüm
oturum soketlerini kapatır. Alıcı her olayda güncel etkin üyelikle seçilir. Kişisel
sohbet odası ve işletmeye özgü kullanıcı odası ayrıdır; olayda telefon veya müşteri
ayrıntısı yoktur. Süresi dolan biletler platform rolünde en çok binlik partilerle silinir.

PWA yalnızca değişmez statik dosyaları ve ortak çevrimdışı ekranını saklar; özel HTML,
API yanıtları ve oturumlar service worker önbelleğine yazılmaz.
