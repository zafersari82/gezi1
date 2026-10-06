-- Saatli menü, şube bulunurluğu ve tarihli çalışma saatleri ortak katalog verisidir.
create function valid_operation_hours(value jsonb) returns boolean language plpgsql immutable as $$
declare entry jsonb; opening integer; closing integer; previous_end integer := -1;
begin
  if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 5 then return false; end if;
  for entry in select element from jsonb_array_elements(value) element order by (element->>'opensAt')::numeric loop
    if jsonb_typeof(entry) <> 'object' or (select count(*) from jsonb_object_keys(entry)) <> 2
      or jsonb_typeof(entry->'opensAt') <> 'number' or jsonb_typeof(entry->'closesAt') <> 'number' then return false; end if;
    if (entry->>'opensAt')::numeric <> trunc((entry->>'opensAt')::numeric)
      or (entry->>'closesAt')::numeric <> trunc((entry->>'closesAt')::numeric) then return false; end if;
    opening := (entry->>'opensAt')::integer; closing := (entry->>'closesAt')::integer;
    if opening < 0 or opening > 1439 or closing <= opening or closing > opening + 1440
      or opening < previous_end then return false; end if;
    previous_end := closing;
  end loop;
  return true;
exception when others then return false;
end $$;

create table branch_ordering_settings (
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  preparation_minutes integer not null default 20 check (preparation_minutes between 1 and 240),
  slot_minutes integer not null default 15 check (slot_minutes between 5 and 60),
  advance_days integer not null default 7 check (advance_days between 1 and 30),
  version integer not null default 1 check (version > 0),
  primary key (business_id, branch_id),
  foreign key (business_id, branch_id) references branches(business_id, id)
);
create table branch_hours_exceptions (
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  date date not null,
  hours jsonb not null check (valid_operation_hours(hours)),
  version integer not null default 1 check (version > 0),
  primary key (business_id, branch_id, date),
  foreign key (business_id, branch_id) references branches(business_id, id)
);
create table catalog_branch_availability (
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  item_id uuid not null,
  available boolean not null,
  version integer not null default 1 check (version > 0),
  primary key (business_id, branch_id, item_id),
  foreign key (business_id, branch_id) references branches(business_id, id),
  foreign key (business_id, item_id) references catalog_items(business_id, id)
);
create table catalog_menu_revisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  item_id uuid,
  category_id uuid,
  version integer not null default 1 check (version > 0),
  check ((item_id is not null) <> (category_id is not null)),
  foreign key (business_id, branch_id) references branches(business_id, id),
  foreign key (business_id, item_id) references catalog_items(business_id, id),
  foreign key (business_id, category_id) references catalog_categories(business_id, id)
);
create unique index catalog_menu_item_revision on catalog_menu_revisions(business_id,branch_id,item_id) where item_id is not null;
create unique index catalog_menu_category_revision on catalog_menu_revisions(business_id,branch_id,category_id) where category_id is not null;
create table catalog_menu_windows (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  item_id uuid,
  category_id uuid,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at smallint not null check (opens_at between 0 and 1439),
  closes_at smallint not null check (closes_at > opens_at and closes_at <= opens_at + 1440),
  check ((item_id is not null) <> (category_id is not null)),
  foreign key (business_id, branch_id) references branches(business_id, id),
  foreign key (business_id, item_id) references catalog_items(business_id, id),
  foreign key (business_id, category_id) references catalog_categories(business_id, id)
);
create index catalog_menu_item on catalog_menu_windows(business_id,branch_id,item_id);
create index catalog_menu_category on catalog_menu_windows(business_id,branch_id,category_id);

-- Yeni satır eklemek bile fiyat görüntüsü alan işlemin şube/ürün kilidini aşamaz.
create function lock_operation_parent() returns trigger language plpgsql as $$
declare target record;
begin
  if tg_op = 'DELETE' then target := old; else target := new; end if;
  if tg_op = 'UPDATE' and (new.business_id <> old.business_id or new.branch_id <> old.branch_id) then
    raise exception 'Operasyon verisinin işletmesi ve şubesi değiştirilemez' using errcode = '23514';
  end if;
  perform 1 from branches where business_id=target.business_id and id=target.branch_id for update;
  if tg_table_name in ('catalog_branch_availability','catalog_menu_revisions','catalog_menu_windows') then
    if target.category_id is not null then
      perform 1 from catalog_categories where business_id=target.business_id and id=target.category_id for update;
    end if;
    if target.item_id is not null then
      perform 1 from catalog_items where business_id=target.business_id and id=target.item_id for update;
    end if;
  end if;
  if tg_op = 'UPDATE' and tg_table_name <> 'catalog_menu_windows' then new.version := old.version + 1; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
-- Bulunurluk satırında kategori alanı bulunmadığından ayrı küçük kilit tetikleyicisi kullanılır.
create function lock_availability_parent() returns trigger language plpgsql as $$
declare target record;
begin
  if tg_op = 'DELETE' then target := old; else target := new; end if;
  if tg_op = 'UPDATE' and (new.business_id <> old.business_id or new.branch_id <> old.branch_id or new.item_id <> old.item_id) then
    raise exception 'Bulunurluk bağları değiştirilemez' using errcode = '23514';
  end if;
  perform 1 from branches where business_id=target.business_id and id=target.branch_id for update;
  perform 1 from catalog_items where business_id=target.business_id and id=target.item_id for update;
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger availability_parent_lock before insert or update or delete on catalog_branch_availability
  for each row execute function lock_availability_parent();
do $$
declare name text;
begin
  foreach name in array array['branch_ordering_settings','branch_hours_exceptions','catalog_menu_revisions','catalog_menu_windows'] loop
    execute format('create trigger operation_parent_lock before insert or update or delete on %I for each row execute function lock_operation_parent()',name);
  end loop;
  foreach name in array array['branch_ordering_settings','branch_hours_exceptions','catalog_branch_availability','catalog_menu_revisions','catalog_menu_windows'] loop
    execute format('alter table %I enable row level security',name);
    execute format('alter table %I force row level security',name);
    execute format('create policy tenant_scope on %I using (business_id = nullif(current_setting(''vado.business_id'',true),'''')::uuid) with check (business_id = nullif(current_setting(''vado.business_id'',true),'''')::uuid)',name);
  end loop;
end $$;

create function branch_open_intervals(business uuid,branch uuid,day date)
returns table(opens_at timestamptz,closes_at timestamptz) language sql stable as $$
  select (day::timestamp + make_interval(mins => h.opening)) at time zone b.timezone,
    (day::timestamp + make_interval(mins => h.closing)) at time zone b.timezone
  from branches b cross join lateral (
    select (entry->>'opensAt')::integer opening,(entry->>'closesAt')::integer closing
    from branch_hours_exceptions e cross join lateral jsonb_array_elements(e.hours) entry
    where e.business_id=business and e.branch_id=branch and e.date=day
    union all
    select w.opens_at,w.closes_at from branch_hours w where w.business_id=business and w.branch_id=branch
      and w.weekday=extract(dow from day)::integer
      and not exists (select 1 from branch_hours_exceptions e where e.business_id=business and e.branch_id=branch and e.date=day)
  ) h where b.business_id=business and b.id=branch and b.active
$$;
create function branch_is_open(business uuid,branch uuid,instant timestamptz)
returns boolean language sql stable as $$
  select exists (select 1 from branches b cross join generate_series(0,1) previous_day
    cross join lateral branch_open_intervals(business,branch,(instant at time zone b.timezone)::date-previous_day) h
    where b.business_id=business and b.id=branch and instant>=h.opens_at and instant<h.closes_at)
$$;
create function catalog_item_served_at(business uuid,branch uuid,item uuid,instant timestamptz)
returns boolean language sql stable as $$
  select exists (select 1 from catalog_items i join branches b on b.business_id=i.business_id and b.id=branch
    left join catalog_branch_availability a on a.business_id=i.business_id and a.branch_id=branch and a.item_id=i.id
    where i.business_id=business and i.id=item and i.active and i.available and b.active and coalesce(a.available,true)
    and (i.category_id is null or exists (select 1 from catalog_categories c where c.business_id=business and c.id=i.category_id and c.active))
    and not exists (
      select 1 from (values (item,null::uuid),(null::uuid,i.category_id)) target(item_id,category_id)
      where (target.item_id is not null or target.category_id is not null)
        and exists (select 1 from catalog_menu_windows w where w.business_id=business and w.branch_id=branch
          and (w.item_id=target.item_id or w.category_id=target.category_id))
        and not exists (
          select 1 from catalog_menu_windows w cross join generate_series(0,1) previous_day
          where w.business_id=business and w.branch_id=branch and (w.item_id=target.item_id or w.category_id=target.category_id)
            and w.weekday=extract(dow from ((instant at time zone b.timezone)::date-previous_day))::integer
            and instant>=(((instant at time zone b.timezone)::date-previous_day)::timestamp + make_interval(mins=>w.opens_at)) at time zone b.timezone
            and instant<(((instant at time zone b.timezone)::date-previous_day)::timestamp + make_interval(mins=>w.closes_at)) at time zone b.timezone
        )
    ))
$$;
