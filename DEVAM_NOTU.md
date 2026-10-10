# VADO 2.8 — Devam notu

**Sürüm:** `2.8.0-alpha.3`, final değil.  
**Güncel paket:** `VADO_2.8_konuma_gore_kesif_tam_kaynak.zip`.

Bu adımda keşif il ve ilçe seçimine göre sunucuda filtrelenir. Bölge kimlikleri `location_provinces` ve `location_districts` kataloğundan gelir. Şube adresi işletme sahibi tarafından Şubeler ekranından eşleştirilir. Yalnızca etkin şubenin il/ilçe kimlikleri kamusal arama izdüşümüne aktarılır; tenant korumalı şube tablosuna global SELECT açılmadı.

**Sonraki işler:** Siparişe başlamadan önce restoranın seçilmiş teslimat adresinin mahalle bazlı hizmet alanında olup olmadığını doğrulamak; kargo ve fiziksel hizmetlerin uygunluk türlerini sektör bazında ayırmak; müşteri tarafında şube seçimi ve doğru şube fiyat/katalog bağlamı. Daha sonra mobil kolay kullanım denemeleri ve son kapsamlı Docker/PostgreSQL/RLS kabul testleri.

**Kapsam dışında:** vardiya/görev yönetimi. **Kod ilkesi:** temiz, tek kaynak, ayrı yama yok.
