# VADO Business Studio — Gerçek restoran vitrinleri (geliştirme adayı)

## Amaç ve mimari

İşletme sahibi telefonunda hazır şablon seçer; aynı ürün, fiyat, şube, sipariş ve hesap altyapısı korunur. `packages/contracts/src/studio.ts` tüm görünümlerin tek kaynağıdır. Ayrı sipariş motoru, yeni katalog tablosu veya kopyalanmış uygulama yoktur.

## Görünüm seçenekleri

| Kimlik            | Sunum           | Mobil müşteri mağazası                                      |
| ----------------- | --------------- | ----------------------------------------------------------- |
| `food-fast`       | Kompakt         | Tek sütunda kısa ürün satırları, fiyat ve hızlı seçim       |
| `food-classic`    | Klasik          | Dengeli kartlar ve kategoriler                              |
| `food-premium`    | Fotoğraf odaklı | Geniş kapak, geniş ürün fotoğrafları, ferah düzen           |
| `food-enterprise` | Kurumsal        | Marka hiyerarşisi, şube sayısı/şube seçimi, düzenli katalog |

Mevcut üç berber/salon başlangıç taslağı korunur. Bu aşamada **dört restoran görünümü** vardır, 30 ayrı tamamlanmış şablon iddiası yoktur. Yeni seçenekler aynı kodsuz Studio panelinden seçilir; mobil kayıt ekranında da görülür.

## Veri ve yayın güvenliği

- Şablon sadece bir **görünüm ayarıdır**. İşletme, katalog, fiyat, üyelik ve sipariş verileri taşınmaz veya yeniden üretilmez.
- Taslak kaydı müşteriyi etkilemez; yalnızca doğrulanmış ve etkin mağazada sahibin açık `Yayımla` işlemi sonrası müşteri görünümü değişir.
- `0034_studio_enterprise_template.sql` önceki şablonları koruyup `food-enterprise` kimliğini `business_studio` tablosunun kısıtına ekler.
- Studio önizleme ve restoran mini uygulaması şablon başlıklarını aynı ortak sözleşmeden alır. Kurumsal şubeler işletmenin gerçek şubelerinden okunur; örnek/sahte şube üretilmez.
- Başka işletmenin verilerine yeni erişim noktası açılmadı. Yayınlanmamış logo/kapak müşteriye aktarılmaz.

## Kabulde doğrulanacaklar

1. Veritabanı migrasyon sırası (`0024` … `0034`), eski tasarımların okunması ve yeni şablonun kaydedilmesi.
2. Studio önizlemesinde dört görünümün telefon genişliklerinde taşmaması; gerçek mini uygulamada tüm görünümler ve görseller.
3. Şube seçimi, menü, ürün özelleştirme, sepet, fiyat güncellenmesi ve ödeme durumunun her şablonda değişmeden çalışması.
4. Taslak/published ayrımı, rol/yetki, aynı anda düzenleme, işletme yalıtımı.
5. Tam npm bağımlılık kurulumu, tip denetimi, Vitest, üretim derlemesi, PostgreSQL/Docker ve gerçek cihaz testleri.

Bu kaynak **nihai/üretime hazır sürüm değildir**. Vardiya ve görev yönetimi bilinçli olarak kapsam dışıdır.
