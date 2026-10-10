-- İptal/iade talebi ve tekrar sipariş paketleri.
--
-- Bitmiş sipariş yeniden açılmaz. İade, ayrı ve değişmez bir mali kayda (order_refunds) bağlanır.
-- Tekrar sipariş ve iade "veri paketleri"dir: siparişin durum grafiğini ve teslim biçimini
-- değiştirmez.

alter table app_instance_capabilities drop constraint capability_id_known;
alter table app_instance_capabilities add constraint capability_id_known check (
  capability_id in (
    'ordering.preparation', 'ordering.table_service', 'ordering.pickup', 'ordering.scheduling',
    'ordering.kitchen', 'ordering.delivery', 'ordering.reorder', 'ordering.returns'
  )
);

-- Siparişin durum grafiği, uygulama örneğindeki paketlerle uyumlu mu? Önceki sürümlerde üst
-- üste sarmalanmış işlev burada tek gövdeye iner. Arama yolu sabittir: yedekten dönüşte kısıt,
-- boş arama yoluyla çalışırken de yardımcı işlevleri bulur.
create or replace function ordering_graph_allowed(graph jsonb, capabilities jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare
  entry text;
  workflow jsonb;
  prepared boolean;
begin
  if jsonb_typeof(capabilities) <> 'array' then return false; end if;
  if (select count(*) from jsonb_array_elements(capabilities))
    <> (select count(distinct value) from jsonb_array_elements(capabilities))
  then
    return false;
  end if;
  workflow := capabilities - 'ordering.reorder@1.0.0' - 'ordering.returns@1.0.0';
  for entry in select jsonb_array_elements_text(workflow) loop
    if entry not in (
      'ordering.preparation@1.0.0', 'ordering.table_service@1.0.0', 'ordering.pickup@1.0.0',
      'ordering.scheduling@1.0.0', 'ordering.kitchen@1.0.0', 'ordering.delivery@1.0.0'
    ) then
      return false;
    end if;
  end loop;
  if workflow ? 'ordering.scheduling@1.0.0' and not workflow ? 'ordering.pickup@1.0.0' then
    return false;
  end if;
  if workflow ? 'ordering.kitchen@1.0.0' and workflow ? 'ordering.preparation@1.0.0' then
    return false;
  end if;
  prepared := workflow ?| array['ordering.preparation@1.0.0', 'ordering.kitchen@1.0.0'];
  if workflow ? 'ordering.delivery@1.0.0' then
    return prepared and graph in (ordering_delivery_graph(), ordering_preparation_graph());
  end if;
  return graph = case when prepared then ordering_preparation_graph() else ordering_core_graph() end;
end $$;
drop function ordering_legacy_graph_allowed(jsonb, jsonb);

-- Teslim biçimi açık paketlerle mümkün mü? Veri paketleri karara katılmaz.
create or replace function restaurant_fulfilment_allowed(
  business uuid, instance uuid, branch uuid, mode text, scheduled timestamptz, seating uuid,
  customer uuid
) returns boolean language plpgsql stable as $$
declare
  caps jsonb;
  prep integer;
  step integer;
  advance integer;
  zone text;
  local_day date;
  local_minute numeric;
begin
  caps := ordering_capabilities_for_instance(business, instance)
    - 'ordering.reorder@1.0.0' - 'ordering.returns@1.0.0';
  if mode = 'delivery' then
    return caps ? 'ordering.delivery@1.0.0' and seating is null;
  end if;
  if mode = 'dine_in' then
    return caps ? 'ordering.table_service@1.0.0' and scheduled is null and exists (
      select 1
      from table_sessions s
      join table_session_members m on m.business_id = s.business_id and m.table_session_id = s.id
      join restaurant_tables t on t.business_id = s.business_id and t.id = s.table_id
      where s.business_id = business and s.id = seating and s.branch_id = branch
        and s.app_instance_id = instance and s.status = 'open' and t.active
        and m.business_customer_id = customer
    );
  end if;
  if mode <> 'pickup' or seating is not null then return false; end if;
  if scheduled is null then
    return caps = '[]'::jsonb
      or caps = '["ordering.preparation@1.0.0"]'::jsonb
      or caps ? 'ordering.pickup@1.0.0';
  end if;
  if not caps ? 'ordering.scheduling@1.0.0' then return false; end if;
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
drop function restaurant_legacy_fulfilment_allowed(uuid, uuid, uuid, text, timestamptz, uuid, uuid);

-- Müşterinin iptal ya da iade talebi. Talep siparişin o anki sürümüne bağlanır; karar bir kez
-- verilir ve gerekçesiyle saklanır.
create table order_return_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  order_id uuid not null,
  app_instance_id uuid not null,
  business_customer_id uuid not null,
  order_version integer not null check (order_version > 0),
  kind text not null check (kind in ('cancel', 'refund')),
  amount_minor bigint not null check (amount_minor between 0 and 100000000),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  decision_reason text check (char_length(btrim(decision_reason)) between 3 and 500),
  member_id uuid,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, id, order_id),
  foreign key (business_id, order_id) references orders (business_id, id),
  foreign key (business_id, app_instance_id) references app_instances (business_id, id),
  foreign key (business_id, business_customer_id) references business_customers (business_id, id),
  foreign key (business_id, member_id) references business_members (business_id, id)
);
create unique index order_return_requests_one_pending
  on order_return_requests (business_id, order_id) where status = 'pending';

alter table order_return_requests enable row level security;
alter table order_return_requests force row level security;
create policy return_actor on order_return_requests
  using (
    business_id = nullif(current_setting('vado.business_id', true), '')::uuid
    and (
      tenant_customer_actor(business_id, business_customer_id)
      or tenant_member_manages(business_id)
    )
  )
  with check (
    business_id = nullif(current_setting('vado.business_id', true), '')::uuid
    and (
      tenant_customer_actor(business_id, business_customer_id)
      or tenant_member_manages(business_id)
    )
  );
create policy courier_denied on order_return_requests as restrictive
  using (current_user = 'vado_owner' or not courier_actor(business_id))
  with check (current_user = 'vado_owner' or not courier_actor(business_id));

-- Kapıda alınan ödemenin geri verildiğinin kaydı talebe bağlanır; talep başına tek kayıt.
alter table order_refunds
  add column request_id uuid,
  add constraint order_refunds_request
    foreign key (business_id, request_id, order_id)
    references order_return_requests (business_id, id, order_id);
create unique index order_refunds_one_per_request on order_refunds (request_id)
  where request_id is not null;

create function check_return_receipt() returns trigger language plpgsql as $$
begin
  if new.request_id is not null and not exists (
    select 1 from order_return_requests
    where business_id = new.business_id and id = new.request_id and order_id = new.order_id
      and status = 'pending' and amount_minor = new.amount_minor
  ) then
    raise exception 'İade kaydı açık talebin tutarıyla eşleşmelidir' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger return_receipt_check before insert on order_refunds
  for each row execute function check_return_receipt();

create function protect_return_request() returns trigger language plpgsql as $$
declare
  parent orders;
  paid bigint;
  refunded bigint;
begin
  select * into parent from orders
  where business_id = new.business_id and id = new.order_id
  for update;
  select coalesce(sum(amount_minor), 0) into paid from order_payments
  where business_id = new.business_id and order_id = new.order_id;
  select coalesce(sum(amount_minor), 0) into refunded from order_refunds
  where business_id = new.business_id and order_id = new.order_id;

  if parent.id is null or parent.business_customer_id <> new.business_customer_id
    or parent.app_instance_id <> new.app_instance_id
  then
    raise exception 'Talep siparişin kendi bağlamından açılır' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.version <> 1 or new.status <> 'pending' or new.member_id is not null
      or new.decision_reason is not null or new.order_version <> parent.version
      or not ordering_capabilities_for_instance(new.business_id, new.app_instance_id)
        ? 'ordering.returns@1.0.0'
      or not tenant_customer_actor(new.business_id, new.business_customer_id)
    then
      raise exception 'Talebi yalnız siparişin sahibi, iade paketi açıkken açar' using errcode = '23514';
    end if;
    -- İptal, alınmış ödemenin tamamını geri verir; iade, teslim edilmiş ve ödenmiş siparişte
    -- geri verilmemiş tutarı aşamaz.
    if new.kind = 'cancel' and (
        parent.status in ('completed', 'cancelled', 'rejected')
        or new.amount_minor <> greatest(paid - refunded, 0)
      )
      or new.kind = 'refund' and (
        parent.status not in ('completed', 'cancelled')
        or (parent.total_minor > 0 and paid <> parent.total_minor)
        or new.amount_minor > paid - refunded
        or (new.amount_minor = 0 and parent.total_minor <> 0)
      )
    then
      raise exception 'Talebin türü, durumu ve tutarı siparişle uyuşmuyor' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.id <> old.id or new.business_id <> old.business_id or new.order_id <> old.order_id
    or new.app_instance_id <> old.app_instance_id
    or new.business_customer_id <> old.business_customer_id or new.kind <> old.kind
    or new.amount_minor <> old.amount_minor or new.reason <> old.reason
    or new.order_version <> old.order_version or new.created_at <> old.created_at
    or old.status <> 'pending' or new.status not in ('approved', 'rejected', 'withdrawn')
    or new.version <> old.version + 1
  then
    raise exception 'Talebin bağlamı değişmez; karar yalnız bir kez verilir' using errcode = '23514';
  end if;

  if new.status = 'withdrawn' then
    if not tenant_customer_actor(new.business_id, new.business_customer_id)
      or new.member_id is not null or new.decision_reason is not null
    then
      raise exception 'Açık talebi yalnız müşteri geri çeker' using errcode = '23514';
    end if;
  elsif new.decision_reason is null then
    raise exception 'Karar gerekçesi zorunludur' using errcode = '23514';
  elsif new.member_id is null then
    -- Kabulden önce, ödemesiz siparişte müşterinin kendi iptali: talep aynı işlemde onaylanır.
    if new.status <> 'approved' or new.kind <> 'cancel' or new.amount_minor <> 0 or paid <> 0
      or parent.status <> 'cancelled' or parent.version <> new.order_version + 1
      or not tenant_customer_actor(new.business_id, new.business_customer_id)
      or not exists (
        select 1 from order_status_history
        where business_id = new.business_id and order_id = new.order_id
          and version = parent.version and from_status = 'placed' and to_status = 'cancelled'
          and business_customer_id = new.business_customer_id
      )
    then
      raise exception 'Müşterinin kendi iptali kabulden önce ve ödemesiz olmalıdır' using errcode = '23514';
    end if;
  else
    if not tenant_member_manages(new.business_id) or not exists (
      select 1 from business_members
      where business_id = new.business_id and id = new.member_id and active
        and role in ('owner', 'manager')
        and user_id = nullif(current_setting('vado.user_id', true), '')::uuid
    ) then
      raise exception 'Kararı işletme sahibi ya da yöneticisi kendi adıyla verir' using errcode = '23514';
    end if;
    if new.status = 'approved' and (
      (new.kind = 'cancel' and parent.status <> 'cancelled')
      or ((new.amount_minor > 0 or new.kind = 'refund') and not exists (
        select 1 from order_refunds
        where business_id = new.business_id and request_id = new.id
          and amount_minor = new.amount_minor
      ))
    ) then
      raise exception 'Onay, gerçekleşmiş iptal ya da kayıtlı geri ödeme ister' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger return_request_check before insert or update on order_return_requests
  for each row execute function protect_return_request();
create trigger return_request_no_delete before delete on order_return_requests
  for each row execute function vado_no_delete();

-- Kim iptal edebilir: sahip/yönetici her zaman (teslimden önce); müşteri yalnız kabulden önce ve
-- ödeme alınmamışken. İade paketi açıksa iptal, gerekçeli güncel bir talebe bağlanır.
create function check_order_cancellation_actor() returns trigger language plpgsql as $$
declare
  paid bigint;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    select coalesce(sum(amount_minor), 0) into paid from order_payments
    where business_id = old.business_id and order_id = old.id;
    if not tenant_member_manages(old.business_id) and (
      old.status <> 'placed' or paid <> 0
      or not tenant_customer_actor(old.business_id, old.business_customer_id)
    ) then
      raise exception 'Müşteri yalnız kabulden önce iptal eder' using errcode = '23514';
    end if;
    if ordering_capabilities_for_instance(old.business_id, old.app_instance_id)
        ? 'ordering.returns@1.0.0'
      and not exists (
        select 1 from order_return_requests
        where business_id = old.business_id and order_id = old.id and kind = 'cancel'
          and status = 'pending' and order_version = old.version
      )
    then
      raise exception 'İptal, gerekçeli güncel bir talebe bağlanmalıdır' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger order_cancellation_actor before update of status on orders
  for each row execute function check_order_cancellation_actor();

-- Tahsilatı olan sipariş, alınan tutarın tamamı geri verilmeden iptal edilemez; reddedilemez.
create or replace function protect_restaurant_order() returns trigger language plpgsql as $$
declare
  source carts;
begin
  if tg_op = 'INSERT' then
    if new.fulfilment = 'dine_in' then
      perform 1 from table_sessions
      where business_id = new.business_id and id = new.table_session_id and status = 'open'
      for share;
      if not found then raise exception 'Masa oturumu kapalı' using errcode = '23514'; end if;
    end if;
    select * into source from carts where business_id = new.business_id and id = new.cart_id;
    if new.table_session_id is distinct from source.table_session_id
      or new.scheduled_at is distinct from source.scheduled_at
      or not restaurant_fulfilment_allowed(
        new.business_id, new.app_instance_id, new.branch_id, new.fulfilment, new.scheduled_at,
        new.table_session_id, new.business_customer_id
      )
      or (
        new.capabilities ?| array[
          'ordering.kitchen@1.0.0', 'ordering.table_service@1.0.0', 'ordering.pickup@1.0.0',
          'ordering.scheduling@1.0.0'
        ]
        and not branch_is_open(new.business_id, new.branch_id, now())
      )
      or new.preparation_minutes is not null or new.rejection_reason is not null
    then
      raise exception 'Sipariş bağlamı açık şubeden ve sepetten alınmalıdır' using errcode = '23514';
    end if;
    return new;
  end if;

  if (new.status = 'rejected' and exists (
      select 1 from order_payments where business_id = new.business_id and order_id = new.id
    ))
    or (new.status = 'cancelled' and
      (select coalesce(sum(amount_minor), 0) from order_payments
        where business_id = new.business_id and order_id = new.id)
      > (select coalesce(sum(amount_minor), 0) from order_refunds
        where business_id = new.business_id and order_id = new.id))
  then
    raise exception 'Tahsil edilmiş sipariş, tutar geri verilmeden iptal edilemez' using errcode = '23514';
  end if;
  if new.table_session_id is distinct from old.table_session_id
    or new.scheduled_at is distinct from old.scheduled_at
    or (old.preparation_minutes is not null and (
      new.preparation_minutes is distinct from old.preparation_minutes
      or new.estimated_ready_at is distinct from old.estimated_ready_at
    ))
    or (old.rejection_reason is not null and new.rejection_reason is distinct from old.rejection_reason)
  then
    raise exception 'Siparişin bağlamı ve karar bilgisi değiştirilemez' using errcode = '23514';
  end if;
  if new.capabilities ? 'ordering.kitchen@1.0.0' and (
    (new.status = 'accepted' and (new.preparation_minutes is null or new.estimated_ready_at < now()))
    or (new.status = 'rejected' and new.rejection_reason is null)
  ) then
    raise exception 'Kabul süresi ve ret gerekçesi zorunludur' using errcode = '23514';
  end if;
  if old.status <> 'placed' and (
    new.preparation_minutes is distinct from old.preparation_minutes
    or new.estimated_ready_at is distinct from old.estimated_ready_at
    or new.rejection_reason is distinct from old.rejection_reason
  ) then
    raise exception 'Karar bilgisi yalnız ilk kabul ya da retle eklenir' using errcode = '23514';
  end if;
  return new;
end $$;
