-- Kurumsal zincir görünümü yeni bir kayıt türü değildir; var olan Studio taslağıdır.
-- Mevcut şablonlar ve yayımlanmış tasarımlar değişmeden kalır.
alter table business_studio
  drop constraint if exists business_studio_template_id_check;
alter table business_studio
  add constraint business_studio_template_id_check
  check (template_id in (
    'food-fast', 'food-classic', 'food-premium', 'food-enterprise',
    'beauty-solo', 'beauty-team', 'beauty-premium'
  ));
