-- Restoran, çekirdeğin fiyat görüntüsü ve değişmez bitiş durumlarını kullanır.
alter table app_instance_capabilities drop constraint app_instance_capabilities_capability_id_check;
alter table app_instance_capabilities drop constraint app_instance_capabilities_config_check;
alter table app_instance_capabilities add constraint capability_id_known check (capability_id in ('ordering.preparation','ordering.table_service','ordering.pickup','ordering.scheduling','ordering.kitchen'));
alter table app_instance_capabilities add constraint capability_config_known check (
  (capability_id='ordering.preparation' and jsonb_typeof(config)='object' and config-'stationLabel'='{}'::jsonb
    and config ? 'stationLabel' and jsonb_typeof(config->'stationLabel')='string'
    and length(btrim(config->>'stationLabel')) between 1 and 40 and length(config->>'stationLabel')<=40)
  or (capability_id<>'ordering.preparation' and config='{}'::jsonb)
);
create or replace function ordering_capabilities_for_instance(business uuid,instance uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(capability_id||'@'||version order by capability_id),'[]'::jsonb)
    from app_instance_capabilities where business_id=business and app_instance_id=instance and enabled
$$;
create or replace function ordering_workflow_for_instance(business uuid,instance uuid) returns jsonb language sql stable as $$
  select case when ordering_capabilities_for_instance(business,instance) ?| array['ordering.preparation@1.0.0','ordering.kitchen@1.0.0']
    then ordering_preparation_graph() else ordering_core_graph() end
$$;
create or replace function ordering_graph_allowed(graph jsonb,capabilities jsonb) returns boolean language plpgsql immutable as $$
declare entry text;
begin
  if jsonb_typeof(capabilities)<>'array' then return false; end if;
  if (select count(*) from jsonb_array_elements(capabilities))<>(select count(distinct value) from jsonb_array_elements(capabilities)) then return false; end if;
  for entry in select jsonb_array_elements_text(capabilities) loop
    if entry not in ('ordering.preparation@1.0.0','ordering.table_service@1.0.0','ordering.pickup@1.0.0','ordering.scheduling@1.0.0','ordering.kitchen@1.0.0') then return false; end if;
  end loop;
  if capabilities ? 'ordering.scheduling@1.0.0' and not capabilities ? 'ordering.pickup@1.0.0' then return false; end if;
  if capabilities ? 'ordering.kitchen@1.0.0' and capabilities ? 'ordering.preparation@1.0.0' then return false; end if;
  return graph=case when capabilities ?| array['ordering.preparation@1.0.0','ordering.kitchen@1.0.0'] then ordering_preparation_graph() else ordering_core_graph() end;
end $$;

create table restaurant_tables (
  id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),
  branch_id uuid not null,app_instance_id uuid not null,label text not null check (length(btrim(label)) between 1 and 40),
  active boolean not null default true,version integer not null default 1 check(version>0),
  unique(business_id,id),unique(business_id,branch_id,app_instance_id,id),unique(business_id,branch_id,app_instance_id,label),
  foreign key(business_id,branch_id) references branches(business_id,id),
  foreign key(business_id,app_instance_id) references app_instances(business_id,id)
);
create table table_sessions (
  id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),table_id uuid not null,
  branch_id uuid not null,app_instance_id uuid not null,status text not null default 'open' check(status in ('open','closed')),
  version integer not null default 1 check(version>0),created_at timestamptz not null default now(),closed_at timestamptz,
  unique(business_id,id),unique(business_id,id,branch_id,app_instance_id),
  foreign key(business_id,branch_id,app_instance_id,table_id) references restaurant_tables(business_id,branch_id,app_instance_id,id),
  check ((status='open' and closed_at is null) or (status='closed' and closed_at is not null))
);
create unique index table_open_session on table_sessions(business_id,table_id) where status='open';
create table table_session_members (
  business_id uuid not null references businesses(id),table_session_id uuid not null,business_customer_id uuid not null,
  joined_at timestamptz not null default now(),primary key(business_id,table_session_id,business_customer_id),
  foreign key(business_id,table_session_id) references table_sessions(business_id,id),
  foreign key(business_id,business_customer_id) references business_customers(business_id,id)
);
create table table_service_requests (
  id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),table_session_id uuid not null,
  business_customer_id uuid not null,kind text not null check(kind in ('waiter','bill')),
  status text not null default 'open' check(status in ('open','resolved')),version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),resolved_at timestamptz,
  unique(business_id,id),foreign key(business_id,table_session_id,business_customer_id) references table_session_members(business_id,table_session_id,business_customer_id),
  check ((status='open' and resolved_at is null) or (status='resolved' and resolved_at is not null))
);
create unique index table_request_pending on table_service_requests(business_id,table_session_id,business_customer_id,kind) where status='open';
alter table carts drop constraint carts_fulfilment_check;
alter table carts add constraint carts_fulfilment_check check(fulfilment in ('pickup','dine_in'));
alter table carts add column table_session_id uuid;
alter table carts add column scheduled_at timestamptz;
alter table carts add constraint cart_table_fk foreign key(business_id,table_session_id,branch_id,app_instance_id) references table_sessions(business_id,id,branch_id,app_instance_id);
alter table carts add constraint cart_restaurant_context check ((fulfilment='pickup' and table_session_id is null) or (fulfilment='dine_in' and table_session_id is not null and scheduled_at is null));
alter table cart_lines add column note text not null default '' check(length(note)<=500);
alter table orders drop constraint orders_fulfilment_check;
alter table orders add constraint orders_fulfilment_check check(fulfilment in ('pickup','dine_in'));
alter table orders add column table_session_id uuid;
alter table orders add column scheduled_at timestamptz;
alter table orders add column preparation_minutes integer check(preparation_minutes between 1 and 240);
alter table orders add column estimated_ready_at timestamptz;
alter table orders add column rejection_reason text check(length(btrim(rejection_reason)) between 3 and 500);
alter table orders add constraint order_table_fk foreign key(business_id,table_session_id,branch_id,app_instance_id) references table_sessions(business_id,id,branch_id,app_instance_id);
alter table orders add constraint order_restaurant_context check ((fulfilment='pickup' and table_session_id is null) or (fulfilment='dine_in' and table_session_id is not null and scheduled_at is null));
alter table orders add constraint order_estimate_pair check ((preparation_minutes is null)=(estimated_ready_at is null));
alter table order_lines add column note text not null default '' check(length(note)<=500);
create table order_payments (
  id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),order_id uuid not null,
  amount_minor bigint not null check(amount_minor between 0 and 100000000),place text not null check(place in ('table','counter')),
  method text not null check(method in ('cash','card')),member_id uuid not null,created_at timestamptz not null default now(),
  unique(business_id,id),unique(business_id,order_id),
  foreign key(business_id,order_id) references orders(business_id,id),foreign key(business_id,member_id) references business_members(business_id,id)
);
create trigger payment_append_only before update or delete on order_payments for each row execute function protect_delivery_record();
create function check_order_payment() returns trigger language plpgsql as $$
declare parent orders;
begin
  select * into parent from orders where business_id=new.business_id and id=new.order_id for update;
  if parent.id is null or parent.status in ('placed','rejected','cancelled') or parent.total_minor<>new.amount_minor
    or (new.place='table' and parent.fulfilment<>'dine_in') then
    raise exception 'Tahsilat kabul edilmiş siparişin tam tutarına ve ödeme yerine uymalıdır' using errcode='23514';
  end if;
  perform 1 from business_members m join users u on u.id=m.user_id where m.business_id=new.business_id and m.id=new.member_id and m.active and u.status='active' for share of m,u;
  if not found then raise exception 'Tahsilat etkin işletme üyesi tarafından kaydedilir' using errcode='23514'; end if;
  return new;
end $$;
create trigger payment_check before insert on order_payments for each row execute function check_order_payment();

create function restaurant_fulfilment_allowed(business uuid,instance uuid,branch uuid,mode text,scheduled timestamptz,seating uuid,customer uuid) returns boolean language plpgsql stable as $$
declare caps jsonb; prep integer; step integer; advance integer; zone text; local_day date; local_minute numeric;
begin
  caps:=ordering_capabilities_for_instance(business,instance);
  if mode='dine_in' then
    return caps ? 'ordering.table_service@1.0.0' and exists (
      select 1 from table_sessions s join table_session_members m on m.business_id=s.business_id and m.table_session_id=s.id
      join restaurant_tables t on t.business_id=s.business_id and t.id=s.table_id
      where s.business_id=business and s.id=seating and s.branch_id=branch and s.app_instance_id=instance and s.status='open' and t.active
        and m.business_customer_id=customer and scheduled is null);
  end if;
  if mode<>'pickup' or seating is not null then return false; end if;
  if scheduled is null then return caps='[]'::jsonb or caps='["ordering.preparation@1.0.0"]'::jsonb or caps ? 'ordering.pickup@1.0.0'; end if;
  if not caps ? 'ordering.scheduling@1.0.0' then return false; end if;
  select coalesce(s.preparation_minutes,20),coalesce(s.slot_minutes,15),coalesce(s.advance_days,7),b.timezone
    into prep,step,advance,zone from branches b left join branch_ordering_settings s on s.business_id=b.business_id and s.branch_id=b.id
    where b.business_id=business and b.id=branch and b.active;
  if zone is null or scheduled<now()+make_interval(mins=>prep) or scheduled>now()+make_interval(days=>advance) then return false; end if;
  local_day:=(scheduled at time zone zone)::date;
  local_minute:=extract(hour from scheduled at time zone zone)*60+extract(minute from scheduled at time zone zone);
  return mod(local_minute,step)=0 and extract(second from scheduled at time zone zone)=0
    and exists(select 1 from generate_series(0,1) previous_day cross join lateral branch_open_intervals(business,branch,local_day-previous_day) h
      where scheduled>=h.opens_at+make_interval(mins=>prep) and scheduled<h.closes_at);
end $$;
create function protect_restaurant_cart() returns trigger language plpgsql as $$
begin
  if new.fulfilment='dine_in' and new.status='open' then
    perform 1 from table_sessions where business_id=new.business_id and id=new.table_session_id and status='open' for share;
    if not found then raise exception 'Masa oturumu kapalı' using errcode='23514'; end if;
  end if;
  if new.status='open' and not restaurant_fulfilment_allowed(new.business_id,new.app_instance_id,new.branch_id,new.fulfilment,new.scheduled_at,new.table_session_id,new.business_customer_id) then
    raise exception 'Sipariş biçimi, masa veya teslim saati geçersiz' using errcode='23514';
  end if;
  return new;
end $$;
create trigger restaurant_cart_check before insert or update on carts for each row execute function protect_restaurant_cart();
create function protect_restaurant_order() returns trigger language plpgsql as $$
declare source carts;
begin
  if tg_op='INSERT' then
    if new.fulfilment='dine_in' then
      perform 1 from table_sessions where business_id=new.business_id and id=new.table_session_id and status='open' for share;
      if not found then raise exception 'Masa oturumu kapalı' using errcode='23514'; end if;
    end if;
    select * into source from carts where business_id=new.business_id and id=new.cart_id;
    if new.table_session_id is distinct from source.table_session_id or new.scheduled_at is distinct from source.scheduled_at
      or not restaurant_fulfilment_allowed(new.business_id,new.app_instance_id,new.branch_id,new.fulfilment,new.scheduled_at,new.table_session_id,new.business_customer_id)
      or ((new.capabilities ?| array['ordering.kitchen@1.0.0','ordering.table_service@1.0.0','ordering.pickup@1.0.0','ordering.scheduling@1.0.0']) and not branch_is_open(new.business_id,new.branch_id,now()))
      or new.preparation_minutes is not null or new.rejection_reason is not null then
      raise exception 'Restoran sipariş bağlamı açık şubeden ve sepetten alınmalıdır' using errcode='23514';
    end if;
  else
    if new.status in ('rejected','cancelled') and exists(select 1 from order_payments where business_id=new.business_id and order_id=new.id) then
      raise exception 'Tahsil edilmiş sipariş iptal edilemez' using errcode='23514';
    end if;
    if new.table_session_id is distinct from old.table_session_id or new.scheduled_at is distinct from old.scheduled_at
      or (old.preparation_minutes is not null and (new.preparation_minutes is distinct from old.preparation_minutes or new.estimated_ready_at is distinct from old.estimated_ready_at))
      or (old.rejection_reason is not null and new.rejection_reason is distinct from old.rejection_reason) then
      raise exception 'Restoran siparişinin bağlamı ve karar bilgisi değiştirilemez' using errcode='23514';
    end if;
    if new.capabilities ? 'ordering.kitchen@1.0.0' and ((new.status='accepted' and (new.preparation_minutes is null or new.estimated_ready_at < now()))
      or (new.status='rejected' and new.rejection_reason is null)) then
      raise exception 'Kabul süresi ve ret gerekçesi zorunludur' using errcode='23514';
    end if;
    if old.status<>'placed' and (new.preparation_minutes is distinct from old.preparation_minutes or new.estimated_ready_at is distinct from old.estimated_ready_at or new.rejection_reason is distinct from old.rejection_reason) then
      raise exception 'Karar bilgisi yalnızca ilk kabul veya retle eklenebilir' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger restaurant_order_check before insert or update on orders for each row execute function protect_restaurant_order();
create function check_restaurant_line() returns trigger language plpgsql as $$
declare parent orders;
begin
  select * into parent from orders where business_id=new.business_id and id=new.order_id;
  if not catalog_item_served_at(new.business_id,parent.branch_id,new.item_id,coalesce(parent.scheduled_at,now()))
    or not exists(select 1 from cart_lines where business_id=new.business_id and cart_id=parent.cart_id and position=new.position and item_id=new.item_id and note=new.note) then
    raise exception 'Restoran fiyat görüntüsü menü saatini ve sepet notunu korumalıdır' using errcode='23514';
  end if;
  return new;
end $$;
create trigger restaurant_line_check before insert on order_lines for each row execute function check_restaurant_line();

create function check_table_session() returns trigger language plpgsql as $$
begin
  perform 1 from restaurant_tables where business_id=new.business_id and id=new.table_id and active for update;
  if not found then raise exception 'Masa etkin olmalıdır' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if old.status<>'open' or new.id<>old.id or new.business_id<>old.business_id or new.table_id<>old.table_id or new.branch_id<>old.branch_id
      or new.app_instance_id<>old.app_instance_id or new.created_at<>old.created_at or new.version<>old.version+1 or new.status<>'closed' then
      raise exception 'Masa oturumu yalnızca bir kez kapatılır' using errcode='23514';
    end if;
    if exists(select 1 from orders o left join order_payments p on p.business_id=o.business_id and p.order_id=o.id
      where o.business_id=new.business_id and o.table_session_id=new.id and (o.status not in ('completed','rejected','cancelled') or (o.status='completed' and o.total_minor>0 and p.id is null))) then
      raise exception 'Açık veya ödenmemiş sipariş varken masa kapatılamaz' using errcode='23514';
    end if;
    new.closed_at:=now();
  end if;
  return new;
end $$;
create trigger table_session_check before insert or update on table_sessions for each row execute function check_table_session();
create function check_table_member() returns trigger language plpgsql as $$
begin
  perform 1 from table_sessions where business_id=new.business_id and id=new.table_session_id and status='open' for share;
  if not found then raise exception 'Kapalı masaya müşteri eklenemez' using errcode='23514'; end if;
  return new;
end $$;
create trigger table_member_check before insert on table_session_members for each row execute function check_table_member();
create trigger table_member_append_only before update or delete on table_session_members for each row execute function protect_delivery_record();
create function check_table_request() returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' then
    perform 1 from table_sessions where business_id=new.business_id and id=new.table_session_id and status='open' for share;
    if not found then raise exception 'Kapalı masaya çağrı eklenemez' using errcode='23514'; end if;
  else
    if old.status<>'open' or new.status<>'resolved' or new.id<>old.id or new.business_id<>old.business_id or new.table_session_id<>old.table_session_id
      or new.business_customer_id<>old.business_customer_id or new.kind<>old.kind or new.created_at<>old.created_at or new.version<>old.version+1 then
      raise exception 'Masa çağrısı yalnızca karşılandı olarak işaretlenir' using errcode='23514';
    end if;
    new.resolved_at:=now();
  end if;
  return new;
end $$;
create trigger table_request_check before insert or update on table_service_requests for each row execute function check_table_request();
create trigger table_request_no_delete before delete on table_service_requests for each row execute function protect_delivery_record();
create trigger table_session_no_delete before delete on table_sessions for each row execute function protect_delivery_record();

-- Bağımlılıklar işlem sonunda denetlenir; aktif sipariş ve masa kapatmayı engeller.
create function check_restaurant_capability() returns trigger language plpgsql as $$
declare business uuid; instance uuid; caps jsonb;
begin
  business:=case when tg_op='DELETE' then old.business_id else new.business_id end;
  instance:=case when tg_op='DELETE' then old.app_instance_id else new.app_instance_id end;
  caps:=ordering_capabilities_for_instance(business,instance);
  if not ordering_graph_allowed(ordering_workflow_for_instance(business,instance),caps) then
    raise exception 'Paket bağımlılıkları ve mutfak akışı uyumsuz' using errcode='23514';
  end if;
  if tg_op<>'INSERT' and old.capability_id<>'ordering.preparation' and old.enabled and (tg_op='DELETE' or not new.enabled) then
    if exists(select 1 from orders where business_id=business and app_instance_id=instance and status not in ('completed','rejected','cancelled') and capabilities ? (old.capability_id||'@'||old.version))
      or (old.capability_id='ordering.table_service' and exists(select 1 from table_sessions where business_id=business and app_instance_id=instance and status='open')) then
      raise exception 'Aktif sipariş veya masa varken paket kapatılamaz' using errcode='23514';
    end if;
  end if;
  return null;
end $$;
create constraint trigger restaurant_capability_check after insert or update or delete on app_instance_capabilities
  deferrable initially deferred for each row execute function check_restaurant_capability();
do $$
declare name text;
begin
  foreach name in array array['restaurant_tables','table_sessions','table_session_members','table_service_requests','order_payments'] loop
    execute format('alter table %I enable row level security',name);
    execute format('alter table %I force row level security',name);
    execute format('create policy tenant_scope on %I using (business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid) with check (business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid)',name);
  end loop;
end $$;

create function protect_restaurant_table() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'Masa kaydı silinmez; devre dışı bırakılır' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.business_id<>old.business_id or new.branch_id<>old.branch_id or new.app_instance_id<>old.app_instance_id then
      raise exception 'Masa başka işletme, şube veya uygulamaya taşınamaz' using errcode='23514';
    end if;
    if not new.active and exists(select 1 from table_sessions where business_id=new.business_id and table_id=new.id and status='open') then
      raise exception 'Açık oturumlu masa kapatılamaz' using errcode='23514';
    end if;
    new.version:=old.version+1;
  end if;
  return new;
end $$;
create trigger restaurant_table_check before update or delete on restaurant_tables for each row execute function protect_restaurant_table();
