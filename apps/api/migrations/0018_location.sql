create table location_provinces (
  id text primary key check (char_length(id) between 1 and 120),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (char_length(slug) between 1 and 160),
  unique (name),
  unique (slug)
);

create table location_districts (
  id text primary key check (char_length(id) between 1 and 120),
  province_id text not null references location_provinces(id),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (char_length(slug) between 1 and 160),
  unique (province_id, id),
  unique (province_id, name),
  unique (province_id, slug)
);

create table location_neighborhoods (
  id text primary key check (char_length(id) between 1 and 120),
  province_id text not null,
  district_id text not null,
  name text not null check (char_length(name) between 1 and 160),
  slug text not null check (char_length(slug) between 1 and 200),
  postal_code text check (postal_code is null or postal_code ~ '^\\d{5}$'),
  unique (province_id, district_id, id),
  unique (district_id, id),
  foreign key (province_id, district_id) references location_districts(province_id, id)
);
create index location_neighborhoods_lookup
  on location_neighborhoods(province_id, district_id, name, id);

create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  business_customer_id uuid not null,
  label text not null check (char_length(label) between 1 and 40),
  province_id text not null,
  district_id text not null,
  neighborhood_id text not null,
  address_line text not null check (char_length(address_line) between 3 and 500),
  recipient_name text not null default '' check (char_length(recipient_name) <= 120),
  recipient_phone text not null default '' check (char_length(recipient_phone) <= 32),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, business_customer_id)
    references business_customers(business_id, id) on delete cascade,
  foreign key (province_id, district_id, neighborhood_id)
    references location_neighborhoods(province_id, district_id, id)
);
create index customer_addresses_customer
  on customer_addresses(business_id, business_customer_id, created_at, id);

create table location_service_areas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, branch_id, name),
  foreign key (business_id, branch_id) references branches(business_id, id) on delete cascade
);

create table location_service_area_neighborhoods (
  business_id uuid not null references businesses(id) on delete cascade,
  service_area_id uuid not null,
  province_id text not null,
  district_id text not null,
  neighborhood_id text not null,
  primary key (business_id, service_area_id, neighborhood_id),
  foreign key (business_id, service_area_id)
    references location_service_areas(business_id, id) on delete cascade,
  foreign key (province_id, district_id, neighborhood_id)
    references location_neighborhoods(province_id, district_id, id)
);
create index location_service_area_neighborhood_lookup
  on location_service_area_neighborhoods(business_id, neighborhood_id, service_area_id);

create function protect_customer_address() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.business_id <> old.business_id
      or new.business_customer_id <> old.business_customer_id
      or new.created_at <> old.created_at or new.version <> old.version + 1 then
      raise exception 'Müşteri adresinin sahipliği ve sürümü korunmalıdır' using errcode = '23514';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger customer_address_check before update on customer_addresses
  for each row execute function protect_customer_address();

create function protect_location_service_area() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.business_id <> old.business_id or new.branch_id <> old.branch_id
      or new.created_at <> old.created_at or new.version <> old.version + 1 then
      raise exception 'Hizmet bölgesinin şube bağı ve sürümü korunmalıdır' using errcode = '23514';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger location_service_area_check before update on location_service_areas
  for each row execute function protect_location_service_area();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'customer_addresses',
    'location_service_areas',
    'location_service_area_neighborhoods'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format(
      'create policy tenant_scope on %I using
        (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)
       with check
        (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)',
      table_name
    );
  end loop;
end $$;

revoke insert, update, delete on location_provinces, location_districts, location_neighborhoods
  from vado_app, vado_platform;
grant select on location_provinces, location_districts, location_neighborhoods
  to vado_app, vado_platform;
