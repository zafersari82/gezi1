-- Paketli mini uygulamalar.
--
-- Paket, incelenmiş koddur: bir kez yüklenir, özetlenir ve bir daha değişmez. Uygulama kaydı
-- (mini_apps) bir işletmenin vitrinidir: adı, simgesi, ayarları ve yayınladığı paket sürümü.
-- Aynı paket sürümünü çok sayıda uygulama kaydı yayınlayabilir.

-- ---------------------------------------------------------------------------
-- Paketler ve sürümleri
-- ---------------------------------------------------------------------------

create table packages (
  id text primary key,
  name text not null,
  developer_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packages_id_check check (id ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
);

create table package_versions (
  package_id text not null references packages (id) on delete restrict,
  version text not null,
  -- Sürüm numarasının sayısal bölümleri; sıralama metinle değil bununla yapılır (1.10.0 > 1.9.0).
  version_key integer[] not null generated always as (string_to_array(version, '.')::integer[]) stored,
  -- Bildirim dosyasında yazan ad.
  name text not null,
  status text not null default 'draft',
  -- İçerik özeti: dosya listesinin (özet, boyut, yol) SHA-256 değeri.
  digest text not null,
  size_bytes integer not null,
  file_count integer not null,
  entry text not null,
  icon text,
  permissions text[] not null,
  network text[] not null,
  config_fields jsonb not null,
  findings jsonb not null,
  -- 'admin' (yönetim paneli) veya işlemi yapan hesabın kimliği.
  uploaded_by text not null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  primary key (package_id, version),
  constraint package_versions_version_check
    check (version ~ '^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})$'),
  constraint package_versions_status_check
    check (status in ('draft', 'in_review', 'approved', 'rejected', 'withdrawn', 'revoked')),
  constraint package_versions_digest_check check (digest ~ '^[0-9a-f]{64}$')
);

create index package_versions_status_idx on package_versions (status, created_at);

-- Dosyaların içeriği veritabanında değil, içerik adresli paket deposunda durur; burada yalnızca
-- hangi yolda hangi içeriğin (SHA-256) bulunduğu yazılıdır.
create table package_files (
  package_id text not null,
  version text not null,
  path text not null,
  sha256 text not null,
  size integer not null,
  content_type text not null,
  primary key (package_id, version, path),
  constraint package_files_version_fk
    foreign key (package_id, version)
    references package_versions (package_id, version) on delete restrict,
  constraint package_files_sha256_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint package_files_size_check check (size >= 0)
);

-- ---------------------------------------------------------------------------
-- Değişmezlik
--
-- Uygulama zaten bu kurallara uyar; tetikleyiciler, bir hata ya da elle yapılan bir müdahale
-- olduğunda da yüklenmiş bir sürümün içeriğinin değişememesini sağlar.
-- ---------------------------------------------------------------------------

create function package_versions_guard() returns trigger
language plpgsql as $$
declare
  actual text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Paket sürümü silinemez: % %', old.package_id, old.version;
  end if;

  if (
    new.package_id, new.version, new.name, new.digest, new.size_bytes, new.file_count,
    new.entry, new.icon, new.permissions, new.network, new.config_fields, new.findings,
    new.uploaded_by, new.created_at
  ) is distinct from (
    old.package_id, old.version, old.name, old.digest, old.size_bytes, old.file_count,
    old.entry, old.icon, old.permissions, old.network, old.config_fields, old.findings,
    old.uploaded_by, old.created_at
  ) then
    raise exception 'Paket sürümünün içeriği değiştirilemez: % %', old.package_id, old.version;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('in_review', 'withdrawn'))
      or (old.status = 'in_review' and new.status in ('approved', 'rejected', 'withdrawn'))
      or (old.status = 'approved' and new.status = 'revoked')
    ) then
      raise exception 'Paket sürümü % durumundan % durumuna geçemez: % %',
        old.status, new.status, old.package_id, old.version;
    end if;

    -- Taslaktan çıkan sürümün dosya listesi özetiyle eşleşmelidir. Özet, uygulamadaki
    -- `packageDigestInput` ile aynı metinden hesaplanır.
    if old.status = 'draft' and new.status = 'in_review' then
      select encode(
        sha256(convert_to(coalesce(string_agg(
          f.sha256 || '  ' || f.size || '  ' || f.path || E'\n', '' order by f.path collate "C"
        ), ''), 'UTF8')),
        'hex'
      )
      into actual
      from package_files f
      where f.package_id = new.package_id and f.version = new.version;

      if actual <> new.digest then
        raise exception 'Paket sürümünün dosyaları özetiyle eşleşmiyor: % %',
          old.package_id, old.version;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger package_versions_guard
  before update or delete on package_versions
  for each row execute function package_versions_guard();

create function package_files_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- Sürüm satırı kilitlenir: aynı anda incelemeye gönderilen sürüme dosya eklenemez.
    perform 1
    from package_versions v
    where v.package_id = new.package_id and v.version = new.version and v.status = 'draft'
    for share;
    if not found then
      raise exception 'Dosya yalnızca taslak sürüme eklenebilir: % %', new.package_id, new.version;
    end if;
    return new;
  end if;

  raise exception 'Paket dosyaları değiştirilemez ve silinemez: % % %',
    old.package_id, old.version, old.path;
end;
$$;

create trigger package_files_guard
  before insert or update or delete on package_files
  for each row execute function package_files_guard();

create function packages_truncate_guard() returns trigger
language plpgsql as $$
begin
  raise exception 'Paket tabloları boşaltılamaz: %', tg_table_name;
end;
$$;

create trigger package_versions_truncate_guard
  before truncate on package_versions
  for each statement execute function packages_truncate_guard();

create trigger package_files_truncate_guard
  before truncate on package_files
  for each statement execute function packages_truncate_guard();

-- ---------------------------------------------------------------------------
-- Uygulama kayıtları
-- ---------------------------------------------------------------------------

alter table mini_apps
  -- package: VADO'ya yüklenmiş paket. url: geliştiricinin kendi sunucusu (yalnızca geliştirme).
  add column source text not null default 'url',
  -- Yayındaki paket sürümü. İlk yayına kadar boştur.
  add column package_id text,
  add column package_version text,
  -- İşletmeye özel ayarlar; yayındaki sürümün bildirdiği alanlara göre doğrulanır.
  add column config jsonb not null default '{}',
  alter column entry_url drop not null,
  alter column version drop not null,
  add constraint mini_apps_source_check check (source in ('package', 'url')),
  add constraint mini_apps_release_fk
    foreign key (package_id, package_version)
    references package_versions (package_id, version) on delete restrict,
  -- Paketle yayınlanan kayıtta giriş adresi, izinli kaynaklar, yetkiler ve sürüm kayıtta tutulmaz;
  -- yayındaki paket sürümünden okunur.
  add constraint mini_apps_shape_check check (
    (
      source = 'url'
      and entry_url is not null
      and version is not null
      and package_id is null
      and package_version is null
    )
    or (
      source = 'package'
      and entry_url is null
      and version is null
      and allowed_origins = '{}'
      and capabilities = '{}'
      and (package_id is null) = (package_version is null)
    )
  );

-- 2.2 ve öncesinin kayıtları adresle açılıyordu; yeni kayıtlar kaynağını açıkça belirtir.
alter table mini_apps alter column source drop default;

create index mini_apps_release_idx on mini_apps (package_id, package_version)
  where package_id is not null;

-- Uygulama kaydının yayın geçmişi: her satır, o andan sonra yayında olan sürümü ve ayarları
-- gösterir. Geri alma, bir önceki yayını ayarlarıyla birlikte geri getirir.
create table mini_app_releases (
  mini_app_id text not null references mini_apps (id) on delete cascade,
  seq integer not null,
  package_id text not null,
  version text not null,
  action text not null,
  config jsonb not null,
  actor text not null,
  created_at timestamptz not null default now(),
  primary key (mini_app_id, seq),
  constraint mini_app_releases_version_fk
    foreign key (package_id, version)
    references package_versions (package_id, version) on delete restrict,
  constraint mini_app_releases_action_check check (action in ('publish', 'rollback', 'config'))
);

create function mini_app_releases_guard() returns trigger
language plpgsql as $$
begin
  raise exception 'Yayın geçmişi değiştirilemez: % #%', old.mini_app_id, old.seq;
end;
$$;

create trigger mini_app_releases_guard
  before update on mini_app_releases
  for each row execute function mini_app_releases_guard();

-- Bir uygulama kaydının çalışma anındaki hali: paketle yayınlanan kayıtta yetkiler, sürüm ve
-- bağlanılan adresler yayındaki paket sürümünden gelir. Sorgular kayda buradan bakar.
create view mini_app_runtime as
select
  a.id,
  a.name,
  a.description,
  a.icon_url,
  a.category,
  a.developer_name,
  a.verified,
  a.enabled,
  a.sort_order,
  a.source,
  a.config,
  a.entry_url,
  a.allowed_origins,
  a.package_id,
  a.package_version,
  a.updated_at,
  p.name as package_name,
  v.status as package_status,
  v.digest as package_digest,
  v.entry as package_entry,
  v.icon as package_icon,
  v.config_fields as package_config_fields,
  coalesce(v.network, '{}') as network,
  coalesce(v.permissions, a.capabilities) as capabilities,
  coalesce(a.package_version, a.version) as version
from mini_apps a
left join packages p on p.id = a.package_id
left join package_versions v
  on v.package_id = a.package_id and v.version = a.package_version;
