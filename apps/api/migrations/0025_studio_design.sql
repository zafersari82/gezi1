-- Görünüm verisi işletmenin operasyon kayıtlarından ayrı kalır.
-- Sürüm numarası eşzamanlı telefon düzenlemelerinde kayıp güncellemeyi engeller.
alter table business_studio
  add column title text not null default '',
  add column tagline text not null default '',
  add column palette text not null default 'teal',
  add column version integer not null default 1,
  add constraint studio_title_valid check (char_length(title) <= 80),
  add constraint studio_tagline_valid check (char_length(tagline) <= 180),
  add constraint studio_palette_valid check (palette in ('teal', 'forest', 'navy', 'plum')),
  add constraint studio_version_valid check (version > 0);
-- Başvuruda kullanılan görünüm şablonu ayrı bir kayıt olarak kalır.
