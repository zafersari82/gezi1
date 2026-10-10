-- İşletme medyası kullanıcı avatarından ve sohbet görsellerinden ayrı bir sahiplik bağı taşır.
-- Dosya baytları mevcut ortak medya sağlayıcısında saklanır; yeni depo oluşturulmaz.
create table business_media (
  business_id uuid not null references businesses(id) on delete cascade,
  media_id uuid not null references media(id) on delete restrict,
  uploaded_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  primary key (business_id, media_id)
);
create index business_media_media_idx on business_media(media_id);
alter table business_media enable row level security;
alter table business_media force row level security;
create policy tenant_scope on business_media
  using (business_id = nullif(current_setting('vado.business_id', true), '')::uuid)
  with check (business_id = nullif(current_setting('vado.business_id', true), '')::uuid);
grant select, insert, update, delete on business_media to vado_app, vado_platform;

alter table business_studio
  add column logo_media_id uuid,
  add column cover_media_id uuid,
  add constraint business_studio_logo_media_fk foreign key(business_id,logo_media_id)
    references business_media(business_id,media_id),
  add constraint business_studio_cover_media_fk foreign key(business_id,cover_media_id)
    references business_media(business_id,media_id);
alter table catalog_items
  add column image_media_id uuid,
  add constraint catalog_items_business_media_fk foreign key(business_id,image_media_id)
    references business_media(business_id,media_id);
create index catalog_items_image_media_idx on catalog_items(image_media_id)
  where image_media_id is not null;
-- Yayınlanan tasarımda medya kimlikleri JSONB anlık görüntüsünde bulunur.
-- Böylece kaydedilmemiş/taslak logo değiştirme işlemleri canlıya sızmaz.
