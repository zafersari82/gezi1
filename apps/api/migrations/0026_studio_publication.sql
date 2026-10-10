-- Yayınlanan vitrin taslağın ayrı bir anlık görüntüsüdür; kaydetmek canlı yayını değiştirmez.
-- Eski işletmeler yayına alınmış sayılmaz. Mevcut RLS business_studio üzerinde korunur.
alter table business_studio
  add column published_design jsonb,
  add column published_version integer not null default 0,
  add column published_at timestamptz,
  add constraint studio_published_version_valid check (published_version >= 0),
  add constraint studio_publication_consistent check (
    (published_design is null and published_at is null and published_version = 0)
    or (published_design is not null and published_at is not null and published_version > 0)
  );
