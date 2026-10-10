-- VADO Business Studio: işletmenin müşteriye görünen vitrini ve görselleri.
--
-- Şablon yalnız görünümdür; işletmenin kataloğu, fiyatı, siparişi ayrı kalır. Taslak müşteriye
-- hiç görünmez; müşteri yalnız açık "Yayımla" işleminin anlık görüntüsünü görür.

-- İşletmeye ait görsel. Dosya baytları ortak medya sağlayıcısındadır; burada sahiplik bağı tutulur.
-- Başka işletmenin görseli vitrine ya da ürüne bağlanamaz (bileşik yabancı anahtar).
create table business_media (
  business_id uuid not null references businesses (id) on delete cascade,
  media_id uuid not null references media (id),
  uploaded_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  primary key (business_id, media_id)
);
create index business_media_media on business_media (media_id);

-- İşletme başına görsel kotası (varsayılan 256 MiB). Kota, yeniden kodlanmış gerçek boyuttan
-- hesaplanır; aynı işletmenin eş zamanlı yüklemeleri işletme satırı kilidiyle sıralanır.
alter table businesses
  add column media_quota_bytes bigint not null default 268435456,
  add constraint businesses_media_quota check (media_quota_bytes between 1048576 and 1099511627776);

-- Veritabanından silinmiş görselin dosyası depodan sonra silinir. Depo o an ulaşılamazsa anahtar
-- kuyrukta kalır ve sonraki temizlikte yeniden denenir.
create table business_media_deletions (
  storage_key text primary key,
  business_id uuid not null references businesses (id),
  created_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);

-- Vitrin: düzenlenen taslak ve müşterinin gördüğü son yayın aynı satırdadır. Şablon ve renk
-- kimlikleri sözleşmelerdeki kayıttan doğrulanır; yeni şablon şema değişikliği gerektirmez.
create table business_studio (
  business_id uuid primary key references businesses (id) on delete cascade,
  template_id text not null check (template_id ~ '^[a-z]+(-[a-z]+)*$'),
  title text not null default '' check (char_length(title) <= 80),
  tagline text not null default '' check (char_length(tagline) <= 180),
  palette text not null default 'teal' check (palette ~ '^[a-z]+$'),
  logo_media_id uuid,
  cover_media_id uuid,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  published_design jsonb,
  published_version integer not null default 0 check (published_version >= 0),
  -- Yayımlanan taslağın sürümü; taslak bundan ileriyse yayımlanmamış değişiklik vardır.
  published_from_version integer,
  published_at timestamptz,
  foreign key (business_id, logo_media_id) references business_media (business_id, media_id),
  foreign key (business_id, cover_media_id) references business_media (business_id, media_id),
  constraint business_studio_publication check (
    (published_design is null and published_at is null and published_from_version is null
      and published_version = 0)
    or (published_design is not null and published_at is not null
      and published_from_version between 1 and version and published_version > 0)
  )
);

-- Ürün fotoğrafı katalog verisidir: kaydedilince menüde görünür, ayrı vitrin yayını gerekmez.
alter table catalog_items
  add column image_media_id uuid,
  add constraint catalog_items_image
    foreign key (business_id, image_media_id) references business_media (business_id, media_id);
create index catalog_items_image on catalog_items (image_media_id) where image_media_id is not null;

select vado_secure_tenant_table('business_media');
select vado_secure_tenant_table('business_media_deletions');
select vado_secure_tenant_table('business_studio');
