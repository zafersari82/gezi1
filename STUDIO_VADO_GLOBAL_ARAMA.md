# VADO Search — Sunucu taraflı birleşik keşif (2.8 geliştirme adayı)

## Ne değişti?

`GET /v1/discovery/search` artık **bütün doğrulanmış/etkin işletmeleri** ve **yayında, doğrulanmış mini uygulamaları** sunucuda birlikte arıyor. Mobil arama, ilk 200 işletmenin cihazda arandığı eski yaklaşımı kullanmıyor. İşletme sayısı arttığında ekran 20'şer kayıt alıyor; kullanıcı “Daha fazla göster” diyebiliyor.

İstek örneği:

```http
GET /v1/discovery/search?q=pilav&kind=all&category=food&limit=20
Authorization: Bearer <oturum>
```

Yanıt örneği:

```json
{
  "items": [
    { "kind": "business", "business": { "...": "işletme sözleşmesi" } },
    { "kind": "miniapp", "miniApp": { "...": "yayınlı uygulama sözleşmesi" } }
  ],
  "nextCursor": "..."
}
```

Sonraki sayfada aynı `q`, `kind`, `category`, `limit` gönderilir ve `cursor` eklenir. `nextCursor: null` son sayfadır. İmleç arama bağlamına bağlanır, geçersiz/farklı filtreyle kullanılan imleç `validation_failed` ile reddedilir. İmleç bir yetkilendirme mekanizması değildir: **her sorguda yayın/doğrulama filtreleri yeniden uygulanır**.

## Sıralama ve Türkçe arama

- Bütün sözcüklerin eşleşmesi gerekir; yüzde/alt çizgi gibi karakterler joker karakter değildir.
- İlk sıra: tam ad eşleşmesi; sonra adın başlangıcı; sonra sözcüklerin ad içinde bulunması; en son açıklama/şehir/geliştirici bilgisi.
- Aynı derecede sonuçlar normalize edilmiş ad, kayıt türü ve kimlikle kararlı şekilde sıralanır.
- `IŞIK`, `Işık`, `ışık`, `isik` gibi yazımlar aynı sadeleştirmeye girer. Türkçe harf dönüşümü veritabanı fonksiyonuna alınmıştır.
- En fazla 8 sözcük, 80 karakter ve sayfa başına 40 kayıt kabul edilir.
- Sonuçlar reklam, müşteri verisi veya puan üzerinden sıralanmaz; sponsorlu sonuç mekanizması yoktur.

## Kaynak mimarisi

- `packages/contracts/src/discovery.ts`: istek, sonuç, sayfa sözleşmeleri.
- `apps/api/src/modules/discovery/`: doğrulanan rota, sorgu ve keyset cursor kodu.
- `apps/api/migrations/0033_discovery_search.sql`: `vado_discovery_fold` ve indeksler.
- `apps/mobile/src/app/(app)/search.tsx`: 300 ms yazma gecikmesi, filtreleme, sayfalama, yeniden deneme.
- `apps/api/test/discovery-search.test.ts`: sayfalama, görünürlük, mini uygulama, filtre ve cursor regresyonları.

Sorgu, sonuç kimliklerini **tek birleşik ve parametreli SQL sorgusundan** seçer; sonra işletme ve mini uygulama satırlarını iki toplu sorguyla yükler. Böylece her sonuç için ayrı sorgu (N+1) oluşturulmaz. Mini uygulamaların çalışma adresleri ve izinleri önceki güvenli mapper ile hesaplanır; yeni URL çalıştırma yolu açılmamıştır.

## Kurulum ve indeksler

Önce mevcut migrasyonlar uygulanır, ardından **`0033_discovery_search.sql`** yüklenir. Bu dosya PostgreSQL'in `pg_trgm` uzantısını kullanır; migrasyon hesabının veritabanında ilgili uzantıyı oluşturma yetkisi bulunmalıdır. Daha önce uzantı kuruluysa yeniden oluşturulmaz. Arama metni için GIN trigram, boş sorguların isim sırası için B-tree ifade indeksleri tanımlıdır. Büyük üretim verisinde `EXPLAIN (ANALYZE, BUFFERS)` ile plan ve gecikme ayrıca ölçülmelidir.

## Doğrulama sınırları

Kaynak kuralları, TypeScript sözdizimi, SQL ifade oluşturma ve imleç doğrulama kontrolleri bu çalışma ortamında yapıldı. **Gerçek PostgreSQL üzerinde migrasyon, yük testi ve yeni Vitest entegrasyon testi çalıştırılmadı.** Uygulama mağazası/gerçek telefon performansı da henüz doğrulanmadı. Arama sonuçları eşzamanlı yayın/değişiklik altında anlık değişebilir; sayfalar geçmiş zamanın sabit anlık görüntüsü değildir. Tam üretim kabulü için DB, Docker, uçtan uca test ve büyük veri deneyi gereklidir.

**Kapsam dışında:** Görev ve vardiya yönetimi, ücretli sıralama, konum bazlı sıralama, kişiselleştirme ve özel kullanıcı bilgilerinde arama.
