# S5 — Sohbet içinde şubeye özel ürün paylaşımı

- Mevcut S4 sohbet ve QR URL altyapısı kullanıldı, yeni sohbet motoru veya migrasyon yok.
- URL `vado:///products/<business UUID>/<branch UUID>/<item UUID>`; fiyat, kullanıcı veya yetki taşımaz.
- Kullanıcı işletme → şube → ürün seçerek link gönderir. Ürün kartı her açılışta güncel sunucu kaydını okur.
- API yalnız doğrulanmış/aktif işletmelerin, aktif şubelerde o anda satışta olan aktif ürünlerini getirir. `catalog_item_served_at` mevcut ortak bulunurluk kuralıdır; şube fiyatı genel fiyata önceliklidir.
- Mesaj silinen/tükenen ürünü gösteremez; sipariş başlatmaz. Ürün ekranından mağazaya geçiş vardır.
- Ürün araması ilk 60 ürünü döndürür. Çok büyük kataloglar için cursor-sayfalama sonraki sürüme bırakıldı.
- Tam npm/PostgreSQL/Expo çalıştırması olmadan final onayı verilmemeli.

## Kabul senaryoları

1. Farklı işletmenin ürününe erişim reddedilir.
2. Pasif, kategorisi pasif, zaman penceresi dışında veya şubede kapalı ürün paylaşım kartı göstermez.
3. Şube fiyatı değişince sohbet kartı yeni fiyatı gösterir; eski mesajdan fiyat almaz.
4. Şube/işletme kapatılırsa bağlantı kullanılamaz.
5. Sohbetten normal mağaza ve mini uygulama paylaşımı bozulmaz.
6. QR tarama yalnızca bilinen ve geçerli VADO yollarını açar.
7. Gerçek cihaz ve Docker kabul testleri son aşamada çalıştırılır.
