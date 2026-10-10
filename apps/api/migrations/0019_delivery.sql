-- Teslimat, mevcut sipariş ve konum görüntülerini aynı işlemde tamamlar.
alter table app_instance_capabilities drop constraint capability_id_known;
alter table app_instance_capabilities add constraint capability_id_known check(capability_id in ('ordering.preparation','ordering.table_service','ordering.pickup','ordering.scheduling','ordering.kitchen','ordering.delivery'));
create function ordering_delivery_graph() returns jsonb language sql immutable as $$ select jsonb_set(ordering_preparation_graph(),'{ready}','["in_transit","cancelled"]') || '{"in_transit":["completed","cancelled"]}'::jsonb $$;
alter function ordering_graph_allowed(jsonb,jsonb) rename to ordering_legacy_graph_allowed;
create function ordering_graph_allowed(graph jsonb,capabilities jsonb) returns boolean language sql immutable as $$
 select case when capabilities ? 'ordering.delivery@1.0.0' then graph in (ordering_delivery_graph(),ordering_preparation_graph()) and capabilities ?| array['ordering.preparation@1.0.0','ordering.kitchen@1.0.0'] and ordering_legacy_graph_allowed(ordering_preparation_graph(),capabilities-'ordering.delivery@1.0.0') else ordering_legacy_graph_allowed(graph,capabilities) end
$$;
alter table orders drop constraint orders_check1;
alter table orders add constraint order_workflow_valid check(ordering_graph_allowed(state_graph,capabilities));
create or replace function ordering_workflow_for_instance(business uuid,instance uuid) returns jsonb language sql stable as $$ select case when ordering_capabilities_for_instance(business,instance) ? 'ordering.delivery@1.0.0' then ordering_delivery_graph() when ordering_capabilities_for_instance(business,instance) ?| array['ordering.preparation@1.0.0','ordering.kitchen@1.0.0'] then ordering_preparation_graph() else ordering_core_graph() end $$;
create function ordering_workflow_for_fulfilment(business uuid,instance uuid,mode text) returns jsonb language sql stable as $$
 select case when mode='delivery' then ordering_delivery_graph() when ordering_capabilities_for_instance(business,instance) ?| array['ordering.preparation@1.0.0','ordering.kitchen@1.0.0'] then ordering_preparation_graph() else ordering_core_graph() end
$$;
alter table orders add constraint order_workflow_fulfilment check((fulfilment='delivery' and state_graph=ordering_delivery_graph()) or (fulfilment<>'delivery' and not(state_graph ? 'in_transit')));
alter table carts drop constraint carts_fulfilment_check;
alter table carts add constraint carts_fulfilment_check check(fulfilment in ('pickup','dine_in','delivery'));
alter table carts drop constraint cart_restaurant_context;
alter table carts add constraint cart_restaurant_context check((fulfilment in ('pickup','delivery') and table_session_id is null) or (fulfilment='dine_in' and table_session_id is not null and scheduled_at is null));
alter table carts add column address_id uuid references location_addresses(id) on delete restrict;
alter table carts add constraint cart_address_pair check((fulfilment='delivery')=(address_id is not null));
alter table orders drop constraint orders_fulfilment_check;
alter table orders add constraint orders_fulfilment_check check(fulfilment in ('pickup','dine_in','delivery'));
alter table orders drop constraint order_restaurant_context;
alter table orders add constraint order_restaurant_context check((fulfilment in ('pickup','delivery') and table_session_id is null) or (fulfilment='dine_in' and table_session_id is not null and scheduled_at is null));
alter table orders add column delivery_fee_minor bigint not null default 0 check(delivery_fee_minor between 0 and 100000000);
create table delivery_regions (
 id uuid not null default gen_random_uuid() unique,
 business_id uuid not null references businesses(id) on delete restrict,branch_id uuid not null,area_id uuid not null,
 version integer not null default 1 constraint delivery_region_version check(version>0),
 fee_minor bigint not null constraint delivery_region_fee check(fee_minor between 0 and 100000000),
 minimum_minor bigint not null constraint delivery_region_minimum check(minimum_minor between 0 and 100000000),
 delivery_minutes integer not null constraint delivery_region_duration check(delivery_minutes between 1 and 240),active boolean not null default true,
 primary key(business_id,branch_id,area_id),foreign key(business_id,branch_id,area_id) references location_service_areas(business_id,branch_id,id) on delete restrict
);
alter table delivery_regions enable row level security;
alter table delivery_regions force row level security;
create policy delivery_region_read on delivery_regions for select using(location_business_reader(business_id));
create policy delivery_region_write on delivery_regions for all using(location_business_writer(business_id)) with check(location_business_writer(business_id));
create function delivery_region_guard() returns trigger language plpgsql as $$ begin
 perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':'||new.branch_id::text,728));
 if tg_op='UPDATE' and (new.business_id<>old.business_id or new.branch_id<>old.branch_id or new.area_id<>old.area_id or new.version<>old.version+1) then raise exception 'Teslimat bölgesi kimliği ve sürümü korunmalıdır' using errcode='23514'; end if; return new; end $$;
create trigger delivery_region_check before insert or update on delivery_regions for each row execute function delivery_region_guard();
create table delivery_order_snapshots (
 business_id uuid not null references businesses(id) on delete restrict,order_id uuid not null, snapshot jsonb not null constraint delivery_snapshot_object check(jsonb_typeof(snapshot)='object'),
 primary key(business_id,order_id),foreign key(business_id,order_id) references orders(business_id,id) on delete restrict
);
alter table delivery_order_snapshots enable row level security;
alter table delivery_order_snapshots force row level security;
create policy tenant_scope on delivery_order_snapshots using(business_id=nullif(current_setting('vado.business_id',true),'')::uuid) with check(business_id=nullif(current_setting('vado.business_id',true),'')::uuid);
create trigger delivery_snapshot_immutable before update or delete on delivery_order_snapshots for each row execute function protect_delivery_record();
create function delivery_time_allowed(business uuid,branch uuid,scheduled timestamptz,delivery integer) returns boolean language plpgsql stable as $$
declare prep integer; step integer; advance integer; zone text; target timestamptz;
begin
 select coalesce(s.preparation_minutes,20),coalesce(s.slot_minutes,15),coalesce(s.advance_days,7),b.timezone into prep,step,advance,zone from branches b left join branch_ordering_settings s on s.business_id=b.business_id and s.branch_id=b.id where b.business_id=business and b.id=branch and b.active;
 if zone is null then return false; end if;
 target:=coalesce(scheduled,now()+make_interval(mins=>prep+delivery));
 if scheduled is not null and (scheduled<now()+make_interval(mins=>prep+delivery) or scheduled>now()+make_interval(days=>advance) or mod(extract(hour from scheduled at time zone zone)*60+extract(minute from scheduled at time zone zone),step)<>0 or extract(second from scheduled)<>0) then return false; end if;
 return branch_is_open(business,branch,target) and branch_is_open(business,branch,target-make_interval(mins=>prep+delivery));
end $$;
alter function restaurant_fulfilment_allowed(uuid,uuid,uuid,text,timestamptz,uuid,uuid) rename to restaurant_legacy_fulfilment_allowed;
create function restaurant_fulfilment_allowed(business uuid,instance uuid,branch uuid,mode text,scheduled timestamptz,seating uuid,customer uuid) returns boolean language sql stable as $$ select case when mode='delivery' then ordering_capabilities_for_instance(business,instance) ? 'ordering.delivery@1.0.0' and seating is null else restaurant_legacy_fulfilment_allowed(business,instance,branch,mode,scheduled,seating,customer) end $$;
create or replace function check_order_totals() returns trigger language plpgsql as $$
declare parent orders; line order_lines; context_id uuid; context_line uuid; gross bigint; vat bigint; count_lines integer;
begin
  if tg_table_name='orders' then context_id:=new.id;
  elsif tg_table_name='order_lines' then context_id:=new.order_id; context_line:=new.id;
  else context_line:=new.order_line_id; select order_id into context_id from order_lines where business_id=new.business_id and id=new.order_line_id; end if;
  select * into parent from orders where business_id=new.business_id and id=context_id;
  select sum(total_minor),sum(vat_minor),count(*) into gross,vat,count_lines from order_lines where business_id=new.business_id and order_id=context_id;
  if count_lines<1 or gross+parent.delivery_fee_minor<>parent.total_minor or vat<>parent.vat_minor then
    raise exception 'Sipariş toplamı satırlarla eşleşmelidir' using errcode='23514';
  end if;
  if parent.created_txid=txid_current() then
    for line in select * from order_lines where business_id=new.business_id and order_id=context_id and (context_line is null or id=context_line) loop
      if line.unit_price_minor<>line.base_price_minor+coalesce((select sum(price_delta_minor) from order_line_options where business_id=new.business_id and order_line_id=line.id),0) then
        raise exception 'Birim fiyat seçenekleri içermelidir' using errcode='23514';
      end if;
      if exists(select 1 from item_option_groups ig join option_groups og on og.business_id=ig.business_id and og.id=ig.group_id
        where ig.business_id=new.business_id and ig.item_id=line.item_id and og.active and (
          (select count(*) from order_line_options chosen join options o on o.business_id=chosen.business_id and o.id=chosen.option_id
            where chosen.business_id=new.business_id and chosen.order_line_id=line.id and o.group_id=og.id) not between og.min_selected and og.max_selected
        )) then raise exception 'Seçenek sayısı grup sınırını karşılamalıdır' using errcode='23514'; end if;
    end loop;
  end if;
  return null;
end $$;

create function delivery_order_guard() returns trigger language plpgsql as $$ begin
 if tg_op='UPDATE' and new.delivery_fee_minor<>old.delivery_fee_minor then raise exception 'Teslimat ücreti değişmez' using errcode='23514'; end if;
 if new.fulfilment<>'delivery' and new.delivery_fee_minor<>0 then raise exception 'Teslimat ücreti yalnız teslimatta alınır' using errcode='23514'; end if;
 if tg_op='INSERT' and new.fulfilment='delivery' and not branch_is_open(new.business_id,new.branch_id,now()) then raise exception 'Şube kapalı' using errcode='23514'; end if;
 return new; end $$;
create trigger delivery_order_check before insert or update on orders for each row execute function delivery_order_guard();
create function check_delivery_snapshot() returns trigger language plpgsql as $$
declare parent orders; source carts; recipient location_addresses; region delivery_regions; area location_service_areas;
begin
 if tg_table_name='orders' then
  if new.fulfilment='delivery' and not exists(select 1 from delivery_order_snapshots where business_id=new.business_id and order_id=new.id) then raise exception 'Teslimat görüntüsü zorunludur' using errcode='23514'; end if; return null;
 end if;
 select * into parent from orders where business_id=new.business_id and id=new.order_id;
 select * into source from carts where business_id=parent.business_id and id=parent.cart_id;
 select * into recipient from location_addresses where id=source.address_id;
 select * into region from delivery_regions where business_id=parent.business_id and branch_id=parent.branch_id and area_id=(new.snapshot->>'areaId')::uuid;
 select * into area from location_service_areas where business_id=region.business_id and branch_id=region.branch_id and id=region.area_id;
 if parent.id is null or parent.fulfilment<>'delivery' or parent.created_txid<>txid_current() or parent.version<>1 or recipient.id is null or recipient.archived
  or not exists(select 1 from business_customers where business_id=parent.business_id and id=parent.business_customer_id and user_id=recipient.user_id)
  or region.area_id is null or not region.active or not area.active
  or not exists(select 1 from location_service_area_neighborhoods where business_id=region.business_id and branch_id=region.branch_id and area_id=region.area_id and neighborhood_id=recipient.neighborhood_id)
  or region.fee_minor<>parent.delivery_fee_minor or (new.snapshot->>'feeMinor')::bigint<>region.fee_minor or (new.snapshot->>'regionVersion')::integer<>region.version
  or parent.total_minor-parent.delivery_fee_minor<region.minimum_minor
  or new.snapshot->'address'->>'id'<>recipient.id::text or new.snapshot->'address'->>'phone'<>recipient.phone
  or new.snapshot->'address'->>'addressLine'<>recipient.address_line
  or not delivery_time_allowed(parent.business_id,parent.branch_id,parent.scheduled_at,region.delivery_minutes)
 then raise exception 'Teslimat görüntüsü geçerli adres, bölge ve tutarla eşleşmelidir' using errcode='23514'; end if; return new;
end $$;
create trigger delivery_snapshot_check before insert on delivery_order_snapshots for each row execute function check_delivery_snapshot();
create constraint trigger delivery_snapshot_required after insert on orders deferrable initially deferred for each row execute function check_delivery_snapshot();

-- Sipariş görüntüsü teslim biçimine göre korunur; eski geçiş dosyaları değişmez.
create or replace function protect_order() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'Sipariş silinemez' using errcode='23514'; end if;
  if tg_op='INSERT' then
    if new.status<>'placed' or new.version<>1 or new.created_txid<>txid_current()
      or new.state_graph<>ordering_workflow_for_fulfilment(new.business_id,new.app_instance_id,new.fulfilment)
      or new.capabilities<>ordering_capabilities_for_instance(new.business_id,new.app_instance_id)
      or not exists(select 1 from carts where business_id=new.business_id and id=new.cart_id and status='checked_out') then
      raise exception 'Sipariş kapatılan sepetten ve doğrulanmış akışla başlamalıdır' using errcode='23514';
    end if;
    perform 1 from branches where business_id=new.business_id and id=new.branch_id and active for share;
    if not found then raise exception 'Şube siparişe açık olmalıdır' using errcode='23514'; end if;
    -- Katalog servisinin kilit sırası; SQL ile yazılan fiyat görüntüsü de araya giren değişime dayanır.
    perform 1 from catalog_categories where business_id=new.business_id order by id for share;
    perform 1 from catalog_items where business_id=new.business_id order by id for share;
    perform 1 from option_groups where business_id=new.business_id order by id for share;
    perform 1 from options where business_id=new.business_id order by id for share;
    perform 1 from item_option_groups where business_id=new.business_id order by item_id,group_id for share;
    perform 1 from prices where business_id=new.business_id order by id for share;
    return new;
  end if;
  if old.status in ('rejected','completed','cancelled') or new.id<>old.id or new.business_id<>old.business_id
    or new.cart_id<>old.cart_id or new.branch_id<>old.branch_id or new.app_instance_id<>old.app_instance_id
    or new.business_customer_id<>old.business_customer_id or new.fulfilment<>old.fulfilment
    or new.total_minor<>old.total_minor or new.vat_minor<>old.vat_minor or new.currency<>old.currency
    or new.state_graph<>old.state_graph or new.capabilities<>old.capabilities
    or new.created_txid<>old.created_txid or new.created_at<>old.created_at or new.version<>old.version+1
    or not ((old.state_graph->old.status) ? new.status) then
    raise exception 'Siparişin fiyatı, bitişi, geçişi ve sürümü korunmalıdır' using errcode='23514';
  end if;
  new.updated_at:=now();
  return new;
end $$;
