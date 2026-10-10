-- S11: Şube, hizmet ve rezerve edilebilir kaynak bazında rezervasyon. Personel vardiya
-- planlama sistemi DEĞİLDİR; kaynak fiziksel koltuk, oda veya hizmet veren uzman olabilir.
-- Müşteri kimliği rezervasyonda korunur; halka açık bir rezervasyon tablosu yoktur.
create table booking_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 90),
  duration_minutes int not null check (duration_minutes between 15 and 240 and duration_minutes % 15=0),
  price_minor bigint not null check (price_minor between 0 and 100000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(business_id,id),
  foreign key(business_id,branch_id) references branches(business_id,id) on delete cascade
);
create index booking_services_branch on booking_services(business_id,branch_id,active);

create table booking_resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(business_id,id),
  foreign key(business_id,branch_id) references branches(business_id,id) on delete cascade
);
create index booking_resources_branch on booking_resources(business_id,branch_id,active);

create table booking_resource_hours (
  business_id uuid not null,
  resource_id uuid not null,
  weekday smallint not null check(weekday between 0 and 6),
  opens_at smallint not null check(opens_at between 0 and 1425 and opens_at % 15=0),
  closes_at smallint not null check(closes_at between 15 and 1440 and closes_at % 15=0),
  primary key(business_id,resource_id,weekday,opens_at),
  check(closes_at>opens_at),
  foreign key(business_id,resource_id) references booking_resources(business_id,id) on delete cascade
);

create table booking_reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  customer_user_id uuid not null references users(id),
  service_id uuid not null,
  resource_id uuid not null,
  service_name text not null,
  resource_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_minor bigint not null check(price_minor between 0 and 100000000),
  request_key uuid not null,
  status text not null default 'confirmed' check(status in ('confirmed','cancelled','completed')),
  version int not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,id),
  unique(business_id,customer_user_id,request_key),
  foreign key(business_id,branch_id) references branches(business_id,id),
  foreign key(business_id,service_id) references booking_services(business_id,id),
  foreign key(business_id,resource_id) references booking_resources(business_id,id),
  check(ends_at > starts_at and ends_at <= starts_at + interval '4 hours')
);
create index booking_resource_calendar on booking_reservations(business_id,resource_id,starts_at,ends_at)
  where status='confirmed';
create index booking_customer_history on booking_reservations(business_id,customer_user_id,starts_at desc);

-- Doluluk yansıtması yalnız kaynak+zaman içerir; başka müşterilerin randevu
-- kayıtlarını (ve kişisel bilgilerini) RLS aşarak okumaya gerek yoktur.
create table booking_resource_busy (
  booking_id uuid primary key references booking_reservations(id) on delete cascade,
  business_id uuid not null,
  resource_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  foreign key(business_id,resource_id) references booking_resources(business_id,id)
);
create index booking_resource_busy_lookup on booking_resource_busy(business_id,resource_id,starts_at,ends_at);
alter table booking_resource_busy enable row level security;
alter table booking_resource_busy force row level security;
create policy booking_busy_read on booking_resource_busy for select using (
  business_id=nullif(current_setting('vado.business_id',true),'')::uuid
);
create policy booking_busy_write on booking_resource_busy for all using (
  business_id=nullif(current_setting('vado.business_id',true),'')::uuid
) with check (business_id=nullif(current_setting('vado.business_id',true),'')::uuid);
revoke insert,update,delete on booking_resource_busy from vado_app,vado_platform;

create function sync_booking_resource_busy() returns trigger language plpgsql security definer
  set search_path=pg_catalog,public as $$
begin
  if tg_op='INSERT' then
    insert into booking_resource_busy(booking_id,business_id,resource_id,starts_at,ends_at)
    values(new.id,new.business_id,new.resource_id,new.starts_at,new.ends_at);
  elsif old.status='confirmed' and new.status<>'confirmed' then
    delete from booking_resource_busy where booking_id=old.id and business_id=old.business_id;
  end if;
  return new;
end $$;
revoke all on function sync_booking_resource_busy() from public;
create trigger booking_resource_busy_sync after insert or update on booking_reservations
  for each row execute function sync_booking_resource_busy();

-- Kaynak üzerinde transaction-scoped advisory lock, kullanıcıdan UPDATE yetkisi
-- istemeden paralel rezervasyonları sıraya alır. Kaynak ve hizmet başka şubeden
-- taşınamaz. SQL tetikleyicisi API dışı yazımlarda da son savunmadır.
create function protect_booking_reservation() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Rezervasyon kaydı silinemez' using errcode='23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.id<>old.id or new.business_id<>old.business_id or new.branch_id<>old.branch_id
      or new.customer_user_id<>old.customer_user_id or new.service_id<>old.service_id
      or new.resource_id<>old.resource_id or new.service_name<>old.service_name
      or new.resource_name<>old.resource_name or new.starts_at<>old.starts_at
      or new.ends_at<>old.ends_at or new.price_minor<>old.price_minor
      or new.request_key<>old.request_key or new.created_at<>old.created_at
      or new.version<>old.version+1 or old.status<>'confirmed'
      or new.status not in ('cancelled','completed') then
      raise exception 'Rezervasyon kimliği ve durum akışı korunmalıdır' using errcode='23514';
    end if;
    new.updated_at:=now();
    return new;
  end if;
  if new.status<>'confirmed' or new.version<>1 then
    raise exception 'Yeni rezervasyon onaylı ve ilk sürüm olmalıdır' using errcode='23514';
  end if;
  -- SQL tetikleyici de kaynak kilidini alır. FOR SHARE kullanılamaz; müşteri
  -- oturumunda salt okuma yetkisi vardır, PostgreSQL FOR SHARE için UPDATE ister.
  perform pg_advisory_xact_lock(hashtextextended(new.business_id::text || ':' || new.resource_id::text,0));
  perform 1 from booking_resources r where r.business_id=new.business_id and r.id=new.resource_id
    and r.branch_id=new.branch_id and r.active and r.name=new.resource_name;
  if not found then raise exception 'Kaynak aktif değil' using errcode='23514'; end if;
  perform 1 from booking_services s where s.business_id=new.business_id and s.id=new.service_id
    and s.branch_id=new.branch_id and s.active and s.price_minor=new.price_minor
    and s.name=new.service_name
    and s.duration_minutes=extract(epoch from (new.ends_at-new.starts_at))/60;
  if not found then raise exception 'Hizmet aktif değil' using errcode='23514'; end if;
  if exists(select 1 from booking_resource_busy a where a.business_id=new.business_id
    and a.resource_id=new.resource_id
    and a.starts_at<new.ends_at and new.starts_at<a.ends_at) then
    raise exception 'Rezervasyon saati dolu' using errcode='23505';
  end if;
  return new;
end $$;
create trigger booking_reservation_guard before insert or update or delete on booking_reservations
  for each row execute function protect_booking_reservation();

-- RLS: Kurulum verisini oturumdaki müşteri yalnız ilgili işletme kapsamında okur,
-- yazma yalnız etkin sahip/yöneticiye aittir. İşlemci kurye rolü bu tablolara erişemez.
do $$ declare name text; begin
  foreach name in array array['booking_services','booking_resources','booking_resource_hours'] loop
    execute format('alter table %I enable row level security',name);
    execute format('alter table %I force row level security',name);
    execute format('create policy booking_setup_read on %I for select using
      (business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid)',name);
    execute format('create policy booking_setup_insert on %I for insert with check
      (business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid
        and exists(select 1 from business_members m where m.business_id=%I.business_id
          and m.user_id=nullif(current_setting(''vado.user_id'',true),'''')::uuid
          and m.active and m.role in (''owner'',''manager'')))',name,name);
    execute format('create policy booking_setup_update on %I for update using
      (business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid
        and exists(select 1 from business_members m where m.business_id=%I.business_id
          and m.user_id=nullif(current_setting(''vado.user_id'',true),'''')::uuid
          and m.active and m.role in (''owner'',''manager'')))
      with check (business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid)',name,name);
    execute format('create policy booking_setup_delete on %I for delete using
      (business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid
        and exists(select 1 from business_members m where m.business_id=%I.business_id
          and m.user_id=nullif(current_setting(''vado.user_id'',true),'''')::uuid
          and m.active and m.role in (''owner'',''manager'')))',name,name);
  end loop;
end $$;
alter table booking_reservations enable row level security;
alter table booking_reservations force row level security;
create policy booking_reservation_read on booking_reservations for select using (
  business_id=nullif(current_setting('vado.business_id',true),'')::uuid and (
    customer_user_id=nullif(current_setting('vado.user_id',true),'')::uuid
    or exists(select 1 from business_members m where m.business_id=booking_reservations.business_id
      and m.user_id=nullif(current_setting('vado.user_id',true),'')::uuid
      and m.active and m.role in ('owner','manager'))
  )
);
create policy booking_reservation_insert on booking_reservations for insert with check (
  business_id=nullif(current_setting('vado.business_id',true),'')::uuid
  and customer_user_id=nullif(current_setting('vado.user_id',true),'')::uuid
);
create policy booking_reservation_update on booking_reservations for update using (
  business_id=nullif(current_setting('vado.business_id',true),'')::uuid and (
    customer_user_id=nullif(current_setting('vado.user_id',true),'')::uuid
    or exists(select 1 from business_members m where m.business_id=booking_reservations.business_id
      and m.user_id=nullif(current_setting('vado.user_id',true),'')::uuid
      and m.active and m.role in ('owner','manager'))
  )
) with check (business_id=nullif(current_setting('vado.business_id',true),'')::uuid);
revoke delete on booking_reservations from vado_app, vado_platform;
