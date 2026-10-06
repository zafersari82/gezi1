-- Ortak katalog: bütün tutarlar kuruş, vergi oranı yüzde biriminin yüzde biri olarak saklanır.
-- Geç kalan bir istek, silinmiş hesabı işletme müşterisine yeniden bağlayamaz.
create function check_business_customer_user() returns trigger language plpgsql as $$
begin
  if new.user_id is not null then
    perform 1 from users where id = new.user_id and status = 'active' for share;
    if not found then
      raise exception 'İşletme müşterisi yalnızca etkin hesaba bağlanabilir' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger business_customer_user_check before insert or update of user_id on business_customers
  for each row execute function check_business_customer_user();

create table catalog_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  unique (business_id, id), unique (business_id, name)
);
create table catalog_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  sku text check (char_length(sku) between 1 and 80),
  active boolean not null default true,
  available boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  unique (business_id, id), unique (business_id, sku),
  foreign key (business_id, category_id) references catalog_categories(business_id, id)
);
create function catalog_item_version() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.business_id <> old.business_id then
    raise exception 'Ürünün kimliği ve işletmesi değiştirilemez' using errcode = '23514';
  end if;
  new.version := old.version + 1;
  return new;
end $$;
create trigger catalog_item_version before update on catalog_items
  for each row execute function catalog_item_version();

create table option_groups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  min_selected integer not null default 0 check (min_selected between 0 and 20),
  max_selected integer not null default 1 check (max_selected between min_selected and 20),
  active boolean not null default true,
  unique (business_id, id)
);
create table options (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  group_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  price_delta_minor integer not null default 0 check (price_delta_minor between 0 and 100000000),
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  unique (business_id, id),
  foreign key (business_id, group_id) references option_groups(business_id, id)
);
create table item_option_groups (
  business_id uuid not null references businesses(id) on delete cascade,
  item_id uuid not null,
  group_id uuid not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (business_id, item_id, group_id),
  foreign key (business_id, item_id) references catalog_items(business_id, id),
  foreign key (business_id, group_id) references option_groups(business_id, id)
);
create table prices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  item_id uuid not null,
  branch_id uuid,
  amount_minor integer not null check (amount_minor between 0 and 100000000),
  vat_basis_points integer not null check (vat_basis_points between 0 and 10000),
  currency text not null default 'TRY' check (currency = 'TRY'),
  unique (business_id, id),
  foreign key (business_id, item_id) references catalog_items(business_id, id),
  foreign key (business_id, branch_id) references branches(business_id, id)
);
create unique index prices_default on prices(business_id, item_id) where branch_id is null;
create unique index prices_branch on prices(business_id, item_id, branch_id) where branch_id is not null;

-- Fiyat veya bağ eklenmesi, fiyat görüntüsü alan işlemin ürün kilidini aşamaz.
create function lock_catalog_parent() returns trigger language plpgsql as $$
declare target_business uuid; target_item uuid; target_group uuid;
begin
  if tg_op = 'DELETE' then target_business := old.business_id;
  else target_business := new.business_id; end if;
  if tg_table_name in ('prices', 'item_option_groups') then
    if tg_op = 'DELETE' then target_item := old.item_id; else target_item := new.item_id; end if;
    perform 1 from catalog_items where business_id = target_business and id = target_item for update;
  else
    if tg_op = 'DELETE' then target_group := old.group_id; else target_group := new.group_id; end if;
    if tg_op = 'UPDATE' and (new.group_id <> old.group_id or new.business_id <> old.business_id or new.id <> old.id) then
      raise exception 'Seçeneğin kimliği ve grubu değiştirilemez' using errcode = '23514';
    end if;
    perform 1 from option_groups where business_id = target_business and id = target_group for update;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger prices_parent_lock before insert or update or delete on prices
  for each row execute function lock_catalog_parent();
create trigger item_option_groups_parent_lock before insert or update or delete on item_option_groups
  for each row execute function lock_catalog_parent();
create trigger options_parent_lock before insert or update or delete on options
  for each row execute function lock_catalog_parent();

-- Zorunlu grubun seçenekleri aynı işlem sonunda yeterli olmalıdır.
create function check_option_group_minimum() returns trigger language plpgsql as $$
declare target_group uuid; target_business uuid;
begin
  if tg_table_name = 'option_groups' then
    target_group := new.id; target_business := new.business_id;
  elsif tg_op = 'DELETE' then
    target_group := old.group_id; target_business := old.business_id;
  else target_group := new.group_id; target_business := new.business_id;
  end if;
  if exists (
    select 1 from option_groups g where g.business_id = target_business and g.id = target_group
      and g.active and g.min_selected > (
        select count(*) from options o where o.business_id = target_business and o.group_id = target_group and o.active
      )
  ) then raise exception 'Zorunlu seçenek grubunda yeterli seçenek bulunmalıdır' using errcode = '23514'; end if;
  return null;
end $$;
create constraint trigger option_group_minimum after insert or update on option_groups
  deferrable initially deferred for each row execute function check_option_group_minimum();
create constraint trigger option_group_options_minimum after insert or update or delete on options
  deferrable initially deferred for each row execute function check_option_group_minimum();

do $$
declare table_name text;
begin
  foreach table_name in array array['catalog_categories', 'catalog_items', 'option_groups',
    'options', 'item_option_groups', 'prices'] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format('create policy tenant_scope on %I using
      (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)
      with check (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)', table_name);
  end loop;
end $$;
