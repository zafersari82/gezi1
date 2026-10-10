# Konum platformu

`2.8.0-alpha.1` konum kataloğu, kullanıcıya ait adresler ve şube hizmet bölgeleri
servislerini sunar. Konum servisi ücret, indirim, teslimat süresi veya ETA politikası
bilmez. Adres ve hizmet bölgesi deneyim ekranları Görev 5 kapsamındadır.

## Veri ve lisans

Türkiye verisi [onurusluca/turkey-geo-api](https://github.com/onurusluca/turkey-geo-api)
kaynağının `5a16cef20f2335e3fe643c9618f931866bb8134c` commit'inden alınmıştır.
MIT lisanslıdır: Copyright (c) 2025 Onur Usluca. Erişim tarihi 2026-10-07'dir.
Paket 81 il, 973 ilçe ve 73.496 mahalle/köy/yerleşim içerir. Kısa adı boş 12.299
kayıtta `full_official_name` gösterim adı olarak kullanılır; resmî tam ad ayrı
korunur. Aynı adlı yerler birleştirilmez; kaynak kimlikleri dış kimlik olarak
saklanır ve aynı veri tekrar aktarılınca UUID'ler değişmez. Gerçek kaynak kaydı
`999532` dahildir; yalnız açıkça adlandırılmış sentetik test kayıtları test
sayımlarında dışarıda tutulur.

Normalize UTF-8 kaynağın SHA-256 özeti:
`76219fdbd23fa5183a918fd4730f60d91e53b29b593b7638bf8f317078add37f`.
`apps/api/data/location` altında `turkey-geo.json.gz`, `LICENSE` ve
`provenance.json` birlikte bulunur. Provenans kaynak ağaç ve dosya özetlerini
kaydeder. API derlemesi bunları `dist/data/location` içine kopyalar; mevcut
Dockerfile API `dist` dizinini imaja alır. Lisansı belirsiz kullanıcı verisi
bu kataloğa katılmaz. İşletmeler fiilî hizmet bölgelerini ayrıca doğrulamalıdır.

## Kurulum ve üretim aktarımı

Node 22.13 veya üzerini ve gerçek PostgreSQL kullanın. Mevcut kurulumun üç ayrı
bağlantısını koruyun: `DATABASE_URL` uygulama rolü, `DATABASE_MIGRATE_URL` şema
sahibi, `DATABASE_PLATFORM_URL` platform rolü. Anahtar ve diğer API yapılandırmaları
[KURULUM.md](KURULUM.md) ve [YAYIN.md](YAYIN.md) kurallarına tabidir.

Yükseltme öncesi yedek alın; 0001–0017 dosyalarını değiştirmeden şema sahibiyle
0018'i uygulayın. Ardından kök dizinden çalıştırın:

```sh
npm run db:migrate
npm run db:location
```

Aktarım komutu `node --import tsx` kullanır; paketli dosyanın özetini, tam kayıt
sayılarını, benzersiz kaynak kimliklerini ve ülke/il/ilçe/mahalle zincirini yazmadan
önce doğrular. Tek PostgreSQL işlemi ve advisory lock ile tamamlanır; hata halinde
isim güncellemeleri dahil tamamı geri alınır. Aynı komut tekrar güvenle çalıştırılabilir.
Derlenmiş üretim imajında API çalışma dizininden eşdeğer komut:

```sh
node dist/cli/import-location.js
```

Katalog yüklenmediyse katalog uçları `location_catalog_not_ready` (503) verir;
boş bir ulusal katalog hazırmış gibi sunulmaz. Uygulama rolü katalog tablolarını
salt okunur kullanır; aktarım platform rolüyle yapılır. Katalog okuma kilidi
yazma yetkisi gerektirmez. Gerçek Docker çalıştırması ayrı dağıtım doğrulamasıdır.

## Kapsam ve işlemler

Bütün HTTP uçları oturum ister. Adres sahibi oturumdan gelir; gövdede kullanıcı
kimliği kabul edilmez. Okuma/yazma kullanıcı kapsamı etkin hesaptan doğrulanır.
Adres ülke/il/ilçe/mahalle kimlikleri tam zincirle uyuşmalıdır. Dönen açılmış
coğrafya da sözleşmede üst bağlantıları ve adres kimliklerini doğrular.

Adres oluşturma, düzenleme ve arşivleme `idempotency-key` ister. Düzenleme ve
arşivleme `expectedVersion` ister; başarılı değişiklik sürümü artırır. Aynı anahtar
ve aynı girdi saklanmış yanıtı getirir, farklı girdi 409 verir. Arşivli adres
listede gösterilmez; sahibi kimlikle okuyabilir, yeniden düzenleyemez.

Hizmet bölgesi şube ve işletmeye bileşik bağla bağlıdır. Personel okuyabilir;
sahip ve yönetici oluşturur, değiştirir ve devre dışı bırakır. Her yazma tekrar
anahtarıyla, değişiklikler beklenen sürümle korunur. Etkin olmayan bölge eşleşmez.
Başka işletmenin şubesi veya mahallesi sessizce kabul edilmez. FORCE RLS ve SQL
kısıtları HTTP dışındaki yazmalarda da kapsamı ve sahipliği korur.

Platform tüketicileri aynı işlemde `readOwnedAddress(tx, userId, addressId)`,
`readServiceAreas(tx, scope, branchId)` ve
`readMatchingServiceAreas(tx, scope, branchId, neighborhoodId)` kullanabilir.
`findServiceAreas` kendi işlemini açan servis girişidir. Bölge yazmaları ve
mahalle eşleştirmeleri aynı şube advisory lock'unu paylaşır.

Mutasyonlar denetim ve işlemsel olay kuyruğunu aynı SQL işleminde yazar.
Olay yüklerinde yalnız kayıt kimliği ve sürüm bulunur; adres, isim, telefon ve
not bulunmaz. Tekrar aynı olayı ikinci kez yazmaz. Adresin kişisel veri içeren
yanıtı kullanıcı kapsamındaki tekrar tablosunda korunur.

## LocationAPI ve kullanıcı izni

SDK `vado.location` altında ülke/il/ilçe/mahalle okuma ve adres
listeleme/okuma/oluşturma/düzenleme/arşivleme metotlarını sunar. Katalog metotları
`location.catalog` paket yetkisini ister. Adres metotları ayrıca
`location.addresses` paket yetkisini ve kullanıcının iznini ister. Kabuk sabit HTTP yollarını ve oturumunu kullanır;
paket serbest URL, kullanıcı veya işletme kimliği seçemez. Yanıtlar ortak Zod
sözleşmeleriyle doğrulanır. Şube bölgesi yönetimi Business HTTP API'sindedir.

Bu servis canlı GPS ve arka plan konum izinleri eklemez. Var olan
`location.getCurrent`/`location.coarse` ayrı kabuk yeteneğidir. Alpha.1 yeni adres
ve bölge ekranı sunmaz; kullanıcı deneyimi Görev 5'te tamamlanacaktır.
