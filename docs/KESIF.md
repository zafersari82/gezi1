# Keşif ve arama

VADO'da işletmeleri ve mini uygulamaları bulmanın tek yolu sunucudaki birleşik aramadır. Sıralama
reklam, puan ya da kişisel veriyle değişmez; sponsorlu sonuç yoktur.

## Arama

`GET /v1/discovery/search` doğrulanmış ve etkin işletmeleri, yayında ve doğrulanmış mini
uygulamaları tek sorguda arar.

| Parametre    | Anlam                                                           |
| ------------ | --------------------------------------------------------------- |
| `q`          | En çok 80 karakter, en çok 8 sözcük; bütün sözcükler eşleşmeli. |
| `kind`       | `all`, `business` ya da `miniapp`.                              |
| `category`   | Sektör (yemek, alışveriş, güzellik...).                         |
| `provinceId` | İl. İlçe verilirse il de verilmelidir.                          |
| `districtId` | İlçe.                                                           |
| `limit`      | Sayfa başına 1–40, varsayılan 20.                               |
| `cursor`     | Önceki yanıtın `nextCursor` değeri.                             |

- **Türkçe:** "IŞIK", "Işık", "ışık" ve "isik" aynı sonuca varır; ç/ğ/ı/ö/ş/ü ve şapkalı harfler
  sadeleştirilir (`vado_discovery_fold`). `%` ve `_` joker değildir.
- **Sıralama:** adın tam eşleşmesi, adın başı, adın içinde sözcük, sonra açıklama/şehir/geliştirici.
  Eşit sonuçlar ad, tür ve kimlikle kararlı sıralanır.
- **İmleç** arama bağlamına bağlıdır; başka süzgeçle kullanılan imleç `validation_failed` alır. İmleç
  yetki değildir: görünürlük her sayfada yeniden denetlenir.
- **Ölçek:** sonuç kimlikleri tek sorguyla seçilir, kayıtlar iki toplu sorguyla yüklenir. Arama
  metni için trigram (GIN), boş sorgu için ad indeksi vardır (`0024_discovery_search.sql`,
  `pg_trgm` eklentisi).

## Konuma göre

- Kullanıcı il ve ilçeyi listeden seçer; GPS izni istenmez, seçim cihazda kalır, koordinat
  gönderilmez.
- İl seçilirse o ildeki, ilçe de seçilirse o ilçede **adresi kayıtlı ve etkin şubesi olan**
  işletmeler gelir. Kaynak, şubenin yapılandırılmış adresidir (bkz. "Şube adresi").
- Mini uygulamalar "Türkiye geneli" alanında kalır; fiziksel yakınlık iddia etmez.
- Bir ilçede şube olması o adrese teslimat yapıldığı anlamına gelmez. "Adresime teslim edenler"
  süzgeci teslimat bölgelerinden hesaplanacaktır (2.8 planı, A3).

## Şube adresi

Şubenin adresi Türkiye adres kataloğundan seçilir: il, ilçe, mahalle ve açık adres
(`0023_branch_address.sql`). Katalog bağı yabancı anahtarla korunur; tutarsız seçim
`location_parent_invalid` alır. 2.8 öncesinden kalan serbest metin tahminle dönüştürülmez,
işletme yeni adresi kaydedene kadar yalnız gösterilir.

Kamusal keşif için `branch_discovery_locations` adlı tek yönlü bir okuma izdüşümü vardır: yalnız
etkin ve adresi kayıtlı şubenin il ve ilçesi. Şube tablosu işletme RLS'si altında kalır; uygulama
rolleri izdüşüme yazamaz, yalnız şube tetikleyicisi yazar.

## Vitrinden mini uygulamaya

İşletme profilinden mini uygulamaya geçişte istemci uygulama örneğini seçmez:
`GET /v1/businesses/:businessId/miniapps/:miniAppId/launch` etkin, doğrulanmış işletme ile yayındaki
mini uygulamanın tek etkin örneğini döndürür. Birden çok etkin örnek varsa rastgele seçilmez, 404
döner. Açılış bağlamı adrese yazılmaz; kabuğun belleğinde tutulur ve her köprü çağrısında sunucuda
yeniden doğrulanır.

## Mobil

- Keşfet ana ekranı işletme ve mini uygulama için ayrı, küçük önizlemeler alır.
- Arama ekranı 300 ms yazma gecikmesi, tür ve sektör süzgeci, "Daha fazla göster" ve kaynak bazlı
  hata durumu içerir.
- Konum seçimi ayrı ekrandadır ve arama ile Keşfet aynı seçimi kullanır.

## Denenen ve denenmeyen

- Denendi: `apps/api/test/discovery-search.test.ts` (206 kayıtla sayfalama, ilçe yalıtımı,
  imleç, görünürlük), `apps/api/test/branch-address.test.ts`, mobil arama birim testleri.
- Denenmedi: telefonda Keşfet ve arama; büyük veride `EXPLAIN ANALYZE` ölçümü (2.8 kapanışında).
