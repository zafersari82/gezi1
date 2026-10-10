-- Katalog herkese okunabilir coğrafyadır; adres ve bölgeler ayrı sahiplik alanlarıdır.
create table location_countries (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 constraint location_country_code_check check(code ~ '^[A-Z]{2}$')
);
create table location_provinces (
 id uuid primary key default gen_random_uuid(),source_id integer not null unique,
 country_id uuid not null references location_countries(id) on delete restrict,name text not null,full_official_name text not null,
 constraint location_province_source_check check(source_id>0 and length(name)>0 and length(full_official_name)>0),constraint location_province_parent_key unique(country_id,id)
);
create index location_provinces_country_idx on location_provinces(country_id);
create table location_districts (
 id uuid primary key default gen_random_uuid(),source_id integer not null unique,
 province_id uuid not null references location_provinces(id) on delete restrict,name text not null,full_official_name text not null,
 constraint location_district_source_check check(source_id>0 and length(name)>0 and length(full_official_name)>0),constraint location_district_parent_key unique(province_id,id)
);
create index location_districts_province_idx on location_districts(province_id);
create table location_neighborhoods (
 id uuid primary key default gen_random_uuid(),source_id integer not null unique,
 district_id uuid not null references location_districts(id) on delete restrict,name text not null,full_official_name text not null,
 constraint location_neighborhood_source_check check(source_id>0 and length(name)>0 and length(full_official_name)>0),constraint location_neighborhood_parent_key unique(district_id,id)
);
create index location_neighborhoods_district_idx on location_neighborhoods(district_id);
create table location_catalog_imports (
 source text primary key,version text not null,sha256 text not null,counts jsonb not null,imported_at timestamptz not null default now(),constraint location_catalog_hash_check check(sha256 ~ '^[0-9a-f]{64}$')
);
revoke insert,update,delete on location_countries,location_provinces,location_districts,location_neighborhoods,location_catalog_imports from vado_app;
create function location_catalog_identity_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'Coğrafya kaydı silinemez'; end if;
 if (to_jsonb(new)-'name'-'full_official_name') is distinct from (to_jsonb(old)-'name'-'full_official_name') then raise exception 'Coğrafya kimliği ve parent değiştirilemez'; end if;
 return new;
end $$;
create trigger location_country_identity before update or delete on location_countries for each row execute function location_catalog_identity_guard();
create trigger location_province_identity before update or delete on location_provinces for each row execute function location_catalog_identity_guard();
create trigger location_district_identity before update or delete on location_districts for each row execute function location_catalog_identity_guard();
create trigger location_neighborhood_identity before update or delete on location_neighborhoods for each row execute function location_catalog_identity_guard();
create table location_addresses (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references users(id) on delete restrict,
 country_id uuid not null references location_countries(id) on delete restrict,province_id uuid not null,district_id uuid not null,neighborhood_id uuid not null,
 label text not null,recipient_name text not null,phone text not null,address_line text not null,door text not null,note text not null,
 version integer not null default 1,archived boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint location_address_owner_key unique(user_id,id),
 constraint location_address_province_fk foreign key(country_id,province_id) references location_provinces(country_id,id) on delete restrict,
 constraint location_address_district_fk foreign key(province_id,district_id) references location_districts(province_id,id) on delete restrict,
 constraint location_address_neighborhood_fk foreign key(district_id,neighborhood_id) references location_neighborhoods(district_id,id) on delete restrict,
 constraint location_address_fields_check check(length(btrim(label)) between 1 and 60 and length(btrim(recipient_name)) between 2 and 120 and phone ~ '^\+[1-9][0-9]{7,14}$' and length(btrim(address_line)) between 5 and 500 and length(btrim(door)) between 1 and 80 and length(note)<=500 and version>0)
);
create index location_addresses_user_idx on location_addresses(user_id,archived);
create index location_addresses_country_idx on location_addresses(country_id);
create index location_addresses_province_idx on location_addresses(country_id,province_id);
create index location_addresses_district_idx on location_addresses(province_id,district_id);
create index location_addresses_neighborhood_idx on location_addresses(district_id,neighborhood_id);
alter table location_addresses enable row level security;
alter table location_addresses force row level security;
create policy location_address_owner on location_addresses using(user_id=nullif(current_setting('vado.user_id',true),'')::uuid) with check(user_id=nullif(current_setting('vado.user_id',true),'')::uuid);
create table location_service_areas (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id) on delete restrict,
 branch_id uuid not null,name text not null,version integer not null default 1,active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint location_area_branch_fk foreign key(business_id,branch_id) references branches(business_id,id) on delete restrict,
 constraint location_area_scope_key unique(business_id,branch_id,id),constraint location_area_fields_check check(length(btrim(name)) between 1 and 100 and version>0)
);
create index location_service_areas_branch_idx on location_service_areas(business_id,branch_id);
create table location_service_area_neighborhoods (
 business_id uuid not null,branch_id uuid not null,area_id uuid not null,neighborhood_id uuid not null references location_neighborhoods(id) on delete restrict,
 primary key(business_id,branch_id,area_id,neighborhood_id),constraint location_area_neighborhood_scope_fk foreign key(business_id,branch_id,area_id) references location_service_areas(business_id,branch_id,id) on delete restrict
);
create index location_service_area_neighborhoods_neighborhood_idx on location_service_area_neighborhoods(neighborhood_id);
-- Aktör, kapsam ve etkin işletme üyeliği birlikte gerekir; yalnız tenant GUC yetki vermez.
create function location_business_actor(business uuid) returns boolean language sql stable as $$
 select business=nullif(current_setting('vado.business_id',true),'')::uuid and nullif(current_setting('vado.user_id',true),'') is not null and exists(select 1 from business_members m where m.business_id=business and m.user_id=nullif(current_setting('vado.user_id',true),'')::uuid and m.active)
$$;
create function location_business_reader(business uuid) returns boolean language sql stable as $$
 select business=nullif(current_setting('vado.business_id',true),'')::uuid and (location_business_actor(business) or exists(select 1 from business_customers c where c.business_id=business and c.user_id=nullif(current_setting('vado.user_id',true),'')::uuid))
$$;
create function location_business_writer(business uuid) returns boolean language sql stable as $$
 select location_business_actor(business) and exists(select 1 from business_members m where m.business_id=business and m.user_id=nullif(current_setting('vado.user_id',true),'')::uuid and m.active and m.role in ('owner','manager'))
$$;
alter table location_service_areas enable row level security;
alter table location_service_areas force row level security;
create policy location_area_read on location_service_areas for select using(location_business_reader(business_id));
create policy location_area_write on location_service_areas for all using(location_business_writer(business_id)) with check(location_business_writer(business_id));
alter table location_service_area_neighborhoods enable row level security;
alter table location_service_area_neighborhoods force row level security;
create policy location_area_neighborhood_read on location_service_area_neighborhoods for select using(location_business_reader(business_id));
create policy location_area_neighborhood_write on location_service_area_neighborhoods for all using(location_business_writer(business_id)) with check(location_business_writer(business_id));
create table location_idempotency_keys (
 user_id uuid not null references users(id) on delete restrict,business_id uuid references businesses(id) on delete restrict,
 operation text not null,key text not null,body_hash text not null,response_body jsonb,created_at timestamptz not null default now(),primary key(user_id,operation,key),
 constraint location_idempotency_fields_check check(key ~ '^[A-Za-z0-9._:-]{1,128}$' and body_hash ~ '^[0-9a-f]{64}$')
);
create index location_idempotency_business_idx on location_idempotency_keys(business_id);
alter table location_idempotency_keys enable row level security;
alter table location_idempotency_keys force row level security;
create policy location_idempotency_owner on location_idempotency_keys using(user_id=nullif(current_setting('vado.user_id',true),'')::uuid and (business_id is null or location_business_actor(business_id))) with check(user_id=nullif(current_setting('vado.user_id',true),'')::uuid and (business_id is null or location_business_actor(business_id)));
create function location_record_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'Konum kaydı silinemez; arşivle veya devre dışı bırak'; end if;
 if new.id<>old.id or new.created_at<>old.created_at then raise exception 'Konum kimliği değiştirilemez'; end if;
 if tg_table_name='location_addresses' then
  if new.user_id<>old.user_id or old.archived then raise exception 'Adres sahibi veya arşivlenmiş adres değiştirilemez'; end if;
 else
  if new.business_id<>old.business_id or new.branch_id<>old.branch_id or not old.active then raise exception 'Bölge kapsamı veya kapalı bölge değiştirilemez'; end if;
 end if;
 if new.version<>old.version+1 then raise exception 'Konum sürümü bir artmalıdır'; end if;
 new.updated_at=now();return new;
end $$;
create trigger location_address_guard before update or delete on location_addresses for each row execute function location_record_guard();
create trigger location_area_guard before update or delete on location_service_areas for each row execute function location_record_guard();
create function location_idempotency_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' or old.response_body is not null then raise exception 'Tekrar yanıtı değiştirilemez'; end if;
 if (to_jsonb(new)-'response_body') is distinct from (to_jsonb(old)-'response_body') then raise exception 'Tekrar kimliği değiştirilemez'; end if;
 return new;
end $$;
create trigger location_idempotency_guard before update or delete on location_idempotency_keys for each row execute function location_idempotency_guard();
