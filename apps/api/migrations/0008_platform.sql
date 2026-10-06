-- İşletme verisi yalnızca işlem içinde kurulan kapsamla okunur ve yazılır.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vado_app')
    or not exists (select 1 from pg_roles where rolname = 'vado_platform' and rolbypassrls and not rolsuper)
    or current_user <> 'vado_owner' then
    raise exception 'Önce veritabanı rollerini kurun; şemayı vado_owner ile uygulayın';
  end if;
end $$;

create table business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, user_id)
);
create unique index business_members_owner on business_members(business_id) where role = 'owner';
create index business_members_user on business_members(user_id) where active;

create function protect_business_owner() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' and exists (select 1 from businesses where id = old.business_id) then
      raise exception 'İşletmenin sahip üyeliği silinemez' using errcode = '23514';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and
    (new.role <> 'owner' or new.user_id <> old.user_id or new.business_id <> old.business_id) then
    raise exception 'İşletmenin sahip üyeliği değiştirilemez' using errcode = '23514';
  end if;
  if new.role = 'owner' and not exists (
    select 1 from businesses where id = new.business_id and owner_id = new.user_id
  ) then raise exception 'Sahip üyeliği işletme sahibine aittir' using errcode = '23514'; end if;
  return new;
end $$;
create trigger business_member_owner_check before insert or update or delete on business_members
  for each row execute function protect_business_owner();

create table branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  timezone text not null default 'Europe/Istanbul',
  address text not null default '' check (char_length(address) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, name)
);

create table branch_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at smallint not null check (opens_at between 0 and 1439),
  closes_at smallint not null check (closes_at > opens_at and closes_at <= opens_at + 1440),
  unique (business_id, id),
  unique (business_id, branch_id, weekday, opens_at),
  foreign key (business_id, branch_id) references branches(business_id, id) on delete cascade
);

-- Şube satırı kilitlenerek eş zamanlı ve geceyi aşan saat çakışmaları da engellenir.
create function check_branch_hours() returns trigger language plpgsql as $$
declare start_minute integer; end_minute integer;
begin
  perform 1 from branches where business_id = new.business_id and id = new.branch_id for update;
  start_minute := new.weekday * 1440 + new.opens_at;
  end_minute := new.weekday * 1440 + new.closes_at;
  if exists (
    select 1 from branch_hours h, generate_series(-1, 1) as week_shift
    where h.business_id = new.business_id and h.branch_id = new.branch_id and h.id <> new.id
      and int4range(start_minute, end_minute, '[)') &&
        int4range(h.weekday * 1440 + h.opens_at + week_shift * 10080,
          h.weekday * 1440 + h.closes_at + week_shift * 10080, '[)')
  ) then raise exception 'Şube çalışma saatleri çakışıyor' using errcode = '23514'; end if;
  return new;
end $$;
create trigger branch_hours_check before insert or update on branch_hours
  for each row execute function check_branch_hours();

create function check_branch_timezone() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Saat dilimi geçersiz' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger branch_timezone_check before insert or update on branches
  for each row execute function check_branch_timezone();

create table business_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);
create unique index business_customers_user on business_customers(business_id, user_id)
  where user_id is not null;

alter table mini_app_merchants add constraint mini_app_merchants_business_binding
  unique (business_id, mini_app_id, merchant_id);
create table app_instances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  mini_app_id text not null,
  merchant_id text not null,
  engine text not null default 'ordering' check (engine = 'ordering'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, mini_app_id, merchant_id),
  foreign key (business_id, mini_app_id, merchant_id)
    references mini_app_merchants(business_id, mini_app_id, merchant_id)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['business_members', 'branches', 'branch_hours',
    'business_customers', 'app_instances'] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format('create policy tenant_scope on %I using
      (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)
      with check (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)', table_name);
  end loop;
end $$;

-- Başvuru sahibi üyeliği yalnızca yeni işletmenin kimliğiyle kurulur; eski kapsam geri yüklenir.
create function create_owner_membership() returns trigger language plpgsql security definer
  set search_path = pg_catalog, public as $$
declare previous_scope text;
begin
  previous_scope := current_setting('vado.business_id', true);
  perform set_config('vado.business_id', new.id::text, true);
  insert into public.business_members(business_id, user_id, role) values (new.id, new.owner_id, 'owner');
  perform set_config('vado.business_id', coalesce(previous_scope, ''), true);
  return new;
end $$;
revoke all on function create_owner_membership() from public;
create trigger business_owner_membership after insert on businesses
  for each row execute function create_owner_membership();

do $$
declare business_row record;
begin
  for business_row in select id, owner_id from businesses loop
    perform set_config('vado.business_id', business_row.id::text, true);
    insert into business_members(business_id, user_id, role)
      values (business_row.id, business_row.owner_id, 'owner');
  end loop;
  perform set_config('vado.business_id', '', true);
end $$;

grant usage on schema public to vado_app, vado_platform;
grant select, insert, update, delete on all tables in schema public to vado_app, vado_platform;
grant usage, select on all sequences in schema public to vado_app, vado_platform;
revoke all on schema_migrations from vado_app;
grant select on schema_migrations to vado_app;
alter default privileges for role vado_owner in schema public
  grant select, insert, update, delete on tables to vado_app, vado_platform;
alter default privileges for role vado_owner in schema public
  grant usage, select on sequences to vado_app, vado_platform;
