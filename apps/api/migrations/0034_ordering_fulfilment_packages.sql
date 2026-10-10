-- Teslim biçimleri, bağlam türleri ve canlı olay türlerinin paket kayıtları; önceki sürümlerden
-- kalan masa oturumu verisinin genel bağlama taşınması.

-- Paket davranış beyanları. Gel-al, ileri saat, masa servisi, operasyon cihazı ya da eve teslim
-- açıkken teslim biçimleri yalnız paketlerle açılır ve sipariş yalnız şube açıkken verilir.
update capability_catalog set explicit_modes = true, opening_hours = true
where engine = 'ordering' and version = '1.0.0' and id in (
  'ordering.pickup', 'ordering.scheduling', 'ordering.table_service', 'ordering.kitchen',
  'ordering.delivery'
);
update capability_catalog set decision_required = true
where engine = 'ordering' and id = 'ordering.kitchen' and version = '1.0.0';

-- Gel-al: hemen ya da (ileri saat paketiyle) şubenin saat aralığına uyan bir zamanda.
create function ordering_pickup_allowed(
  business uuid, instance uuid, branch uuid, scheduled timestamptz, context_id uuid,
  customer uuid, capabilities jsonb
) returns boolean language plpgsql stable set search_path = pg_catalog, public as $$
declare
  prep integer;
  step integer;
  advance integer;
  zone text;
  local_day date;
  local_minute numeric;
begin
  if scheduled is null then
    return true;
  end if;
  if not capabilities ? 'ordering.scheduling@1.0.0' then
    return false;
  end if;
  select coalesce(s.preparation_minutes, 20), coalesce(s.slot_minutes, 15),
    coalesce(s.advance_days, 7), b.timezone
  into prep, step, advance, zone
  from branches b
  left join branch_ordering_settings s on s.business_id = b.business_id and s.branch_id = b.id
  where b.business_id = business and b.id = branch and b.active;
  if zone is null or scheduled < now() + make_interval(mins => prep)
    or scheduled > now() + make_interval(days => advance)
  then
    return false;
  end if;
  local_day := (scheduled at time zone zone)::date;
  local_minute := extract(hour from scheduled at time zone zone) * 60
    + extract(minute from scheduled at time zone zone);
  return mod(local_minute, step) = 0
    and extract(second from scheduled at time zone zone) = 0
    and exists (
      select 1
      from generate_series(0, 1) previous_day
      cross join lateral branch_open_intervals(business, branch, local_day - previous_day) h
      where scheduled >= h.opens_at + make_interval(mins => prep) and scheduled < h.closes_at
    );
end $$;
insert into ordering_fulfilment_modes (
  code, capability_id, capability_version, core_default, payment_places, validator
) values (
  'pickup', 'ordering.pickup', '1.0.0', true, '{counter}',
  'ordering_pickup_allowed(uuid, uuid, uuid, timestamptz, uuid, uuid, jsonb)'
);

-- Masa servisi: bağlam, müşterinin katıldığı açık masa oturumudur; ileri saat alınmaz. Oturum,
-- sepet ve sipariş işlemi bitene kadar kapanmasın diye paylaşımlı kilitlenir.
insert into ordering_context_kinds (kind, capability_id, capability_version) values
  ('table_session', 'ordering.table_service', '1.0.0');
create function table_service_dine_in_allowed(
  business uuid, instance uuid, branch uuid, scheduled timestamptz, context_id uuid,
  customer uuid, capabilities jsonb
) returns boolean language plpgsql set search_path = pg_catalog, public as $$
begin
  if scheduled is not null then
    return false;
  end if;
  perform 1
  from table_sessions s
  join table_session_members m on m.business_id = s.business_id and m.table_session_id = s.id
  join restaurant_tables t on t.business_id = s.business_id and t.id = s.table_id
  where s.business_id = business and s.id = context_id and s.branch_id = branch
    and s.app_instance_id = instance and s.status = 'open' and t.active
    and m.business_customer_id = customer
  for share of s;
  return found;
end $$;
insert into ordering_fulfilment_modes (
  code, capability_id, capability_version, context_kind, payment_places, validator
) values (
  'dine_in', 'ordering.table_service', '1.0.0', 'table_session', '{table,counter}',
  'table_service_dine_in_allowed(uuid, uuid, uuid, timestamptz, uuid, uuid, jsonb)'
);

-- Masa oturumu bağlamı aynı işletme, şube ve uygulama örneğindeki bir oturumu gösterir (eski
-- yabancı anahtarın yerine). Oturumlar silinemez; bağ böylece hep geçerli kalır.
create function check_table_session_context() returns trigger language plpgsql as $$
begin
  if new.context_kind = 'table_session' and not exists (
    select 1 from table_sessions
    where business_id = new.business_id and id = new.context_id
      and branch_id = new.branch_id and app_instance_id = new.app_instance_id
  ) then
    raise exception 'Masa oturumu bu şubenin ve uygulamanın değil' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger table_session_context_check before insert or update of context_kind, context_id
  on carts for each row execute function check_table_session_context();
create trigger table_session_context_check before insert or update of context_kind, context_id
  on orders for each row execute function check_table_session_context();

-- Masa oturumu açık ya da ödenmemiş sipariş varken kapanmaz.
create or replace function check_table_session() returns trigger language plpgsql as $$
begin
  perform 1 from restaurant_tables
  where business_id = new.business_id and id = new.table_id and active
  for update;
  if not found then
    raise exception 'Masa etkin olmalıdır' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'open' or new.id <> old.id or new.business_id <> old.business_id
      or new.table_id <> old.table_id or new.branch_id <> old.branch_id
      or new.app_instance_id <> old.app_instance_id or new.created_at <> old.created_at
      or new.version <> old.version + 1 or new.status <> 'closed'
    then
      raise exception 'Masa oturumu yalnızca bir kez kapatılır' using errcode = '23514';
    end if;
    if exists (
      select 1
      from orders o
      left join order_payments p on p.business_id = o.business_id and p.order_id = o.id
      where o.business_id = new.business_id
        and o.context_kind = 'table_session' and o.context_id = new.id
        and (o.status not in ('completed', 'rejected', 'cancelled')
          or (o.status = 'completed' and o.total_minor > 0 and p.id is null))
    ) then
      raise exception 'Açık veya ödenmemiş sipariş varken masa kapatılamaz' using errcode = '23514';
    end if;
    new.closed_at := now();
  end if;
  return new;
end $$;

-- Garson çağrısı ve hesap isteği canlı olayları; kaynak, çağrının masa oturumudur.
create function table_service_live_source(business uuid, aggregate uuid)
returns table (
  branch_id uuid, app_instance_id uuid, business_customer_id uuid, context_kind text,
  context_id uuid
) language sql stable set search_path = pg_catalog, public as $$
  select s.branch_id, s.app_instance_id, r.business_customer_id, 'table_session'::text, s.id
  from table_service_requests r
  join table_sessions s on s.business_id = r.business_id and s.id = r.table_session_id
  where r.business_id = business and r.id = aggregate
$$;
insert into live_event_types (type, resolver) values
  ('table.requested', 'table_service_live_source(uuid, uuid)'),
  ('table.request_resolved', 'table_service_live_source(uuid, uuid)');

-- Eve teslim: adres zorunlu; saat ve bölge, teslimat görüntüsünde denetlenir.
insert into ordering_fulfilment_modes (
  code, capability_id, capability_version, requires_address, payment_places
) values (
  'delivery', 'ordering.delivery', '1.0.0', true, '{delivery,counter}'
);

-- İptal ve iade paketi: iptal, siparişin güncel sürümüne bağlı gerekçeli bir talebe dayanır.
create function check_returns_cancellation() returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled'
    and ordering_capabilities_for_instance(old.business_id, old.app_instance_id)
      ? 'ordering.returns@1.0.0'
    and not exists (
      select 1 from order_return_requests
      where business_id = old.business_id and order_id = old.id and kind = 'cancel'
        and status = 'pending' and order_version = old.version
    )
  then
    raise exception 'İptal, gerekçeli güncel bir talebe bağlanmalıdır' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger returns_cancellation_check before update of status on orders
  for each row execute function check_returns_cancellation();

-- Önceki sürümlerden kalan masa oturumu bağları genel bağlama taşınır. Kayıtlar değişmez
-- tetikleyicilerle korunduğu ve satır güvenliği zorunlu olduğu için taşıma süresince ikisi de
-- yalnız bu işlemde kapatılır.
do $$
declare
  target text;
begin
  foreach target in array array['carts', 'orders', 'business_live_events'] loop
    execute format('alter table %I no force row level security', target);
    execute format('alter table %I disable trigger user', target);
    execute format(
      'update %I set context_kind = %L where context_id is not null and context_kind is null',
      target, 'table_session'
    );
    execute format('alter table %I enable trigger user', target);
    execute format('alter table %I force row level security', target);
  end loop;
end $$;

alter table carts validate constraint cart_context_pair;
alter table carts validate constraint cart_context_kind;
alter table carts validate constraint cart_fulfilment_mode;
alter table orders validate constraint order_context_pair;
alter table orders validate constraint order_context_kind;
alter table orders validate constraint order_fulfilment_mode;
alter table business_live_events validate constraint live_event_context_pair;
alter table business_live_events validate constraint live_event_context_kind;
alter table business_live_events validate constraint live_event_type_known;
