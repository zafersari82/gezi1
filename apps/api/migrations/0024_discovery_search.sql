-- VADO arama: Türkçe harfleri tek biçime indirger. "IŞIK", "Işık", "ışık" ve "isik" aynı
-- sonuca varır. İşlev değişmezdir (IMMUTABLE); indeksler ve sorgular aynı hesabı kullanır.
create function vado_discovery_fold(value text)
returns text language sql immutable parallel safe as $$
  select translate(
    lower(replace(replace(coalesce(value, ''), 'İ', 'i'), 'I', 'ı')),
    'çğıöşüâîû',
    'cgiosuaiu'
  )
$$;

-- Ad, açıklama ve şehir içinde aramanın büyük veride hızlı kalması için trigram indeksleri.
-- pg_trgm PostgreSQL'in güvenilir (trusted) eklentisidir; veritabanı sahibi kurabilir.
create extension if not exists pg_trgm;
create index businesses_discovery_text on businesses
  using gin (vado_discovery_fold(name || ' ' || description || ' ' || city) gin_trgm_ops)
  where status = 'active' and verified;
create index mini_apps_discovery_text on mini_apps
  using gin (vado_discovery_fold(name || ' ' || description || ' ' || developer_name) gin_trgm_ops)
  where enabled and verified;

-- Boş sorguda ada göre sayfalama.
create index businesses_discovery_name on businesses (vado_discovery_fold(name), id)
  where status = 'active' and verified;
create index mini_apps_discovery_name on mini_apps (vado_discovery_fold(name), id)
  where enabled and verified;
