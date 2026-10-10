-- VADO Search: Türkçe harfleri tek bir arama biçimine indirge; aksan taşıyan adlar da eşleşir.
-- İşlev IMMUTABLE'dır; trigram ifade indeksleri ile aynı hesaplamayı kullanır.
create or replace function vado_discovery_fold(value text)
returns text language sql immutable parallel safe as $$
  select translate(lower(replace(replace(coalesce(value,''), 'İ', 'i'), 'I', 'ı')),
    'çğıöşüâîû', 'cgiosuaiu')
$$;

-- İsim / açıklama / şehir içinde aramayı yüz binlerce satıra ölçekleyebilmek için.
-- pg_trgm PostgreSQL'in güvenilir standart eklentisidir; migration rolünde CREATE gerekir.
create extension if not exists pg_trgm;
create index businesses_discovery_text_idx on businesses using gin
  (vado_discovery_fold(name || ' ' || description || ' ' || city) gin_trgm_ops)
  where status = 'active' and verified;
create index mini_apps_discovery_text_idx on mini_apps using gin
  (vado_discovery_fold(name || ' ' || description || ' ' || developer_name) gin_trgm_ops)
  where enabled and verified;
-- Boş sorgular için alfabetik sayfalama erişimi.
create index businesses_discovery_name_idx on businesses (vado_discovery_fold(name),id)
  where status = 'active' and verified;
create index mini_apps_discovery_name_idx on mini_apps (vado_discovery_fold(name),id)
  where enabled and verified;
