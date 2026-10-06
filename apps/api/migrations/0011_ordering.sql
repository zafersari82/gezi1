-- Sepet sürümü, fiyat görüntüsü ve sipariş olayı tek SQL işleminde korunur.
create function ordering_core_graph() returns jsonb language sql immutable as $$
  select '{"placed":["accepted","rejected","cancelled"],"accepted":["completed","cancelled"],"rejected":[],"completed":[],"cancelled":[]}'::jsonb
$$;
create function ordering_graph_allowed(graph jsonb, capabilities jsonb) returns boolean language sql immutable as $$
  select graph = ordering_core_graph() and capabilities = '[]'::jsonb
$$;
create function ordering_workflow_for_instance(business uuid, instance uuid) returns jsonb language sql stable as $$
  select ordering_core_graph()
$$;
create function ordering_capabilities_for_instance(business uuid, instance uuid) returns jsonb language sql stable as $$
  select '[]'::jsonb
$$;

create table carts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  app_instance_id uuid not null,
  business_customer_id uuid not null,
  fulfilment text not null default 'pickup' check (fulfilment = 'pickup'),
  status text not null default 'open' check (status in ('open','checked_out','expired')),
  version integer not null default 1 check (version > 0),
  edit_txid bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  unique (business_id,id),
  unique (business_id,id,branch_id,app_instance_id,business_customer_id,fulfilment),
  foreign key (business_id,branch_id) references branches(business_id,id),
  foreign key (business_id,app_instance_id) references app_instances(business_id,id),
  foreign key (business_id,business_customer_id) references business_customers(business_id,id),
  check (expires_at = created_at + interval '24 hours')
);
create unique index carts_open_customer on carts(business_id,app_instance_id,business_customer_id,branch_id) where status='open';
create index carts_expiry on carts(expires_at) where status in ('open','expired');
create table cart_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  cart_id uuid not null,
  item_id uuid not null,
  quantity integer not null check (quantity between 1 and 99),
  option_ids uuid[] not null default '{}',
  seen_unit_price_minor bigint not null check (seen_unit_price_minor between 0 and 100000000),
  seen_vat_basis_points integer not null check (seen_vat_basis_points between 0 and 10000),
  position integer not null check (position between 0 and 99),
  unique (business_id,id), unique (business_id,cart_id,position),
  foreign key (business_id,cart_id) references carts(business_id,id) on delete cascade,
  foreign key (business_id,item_id) references catalog_items(business_id,id),
  check (cardinality(option_ids) <= 100)
);

create function protect_cart() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then
    if old.status <> 'expired' then raise exception 'Yalnızca süresi dolmuş sepet temizlenebilir' using errcode='23514'; end if;
    return old;
  end if;
  if old.status <> 'open' or new.id<>old.id or new.business_id<>old.business_id or new.branch_id<>old.branch_id
    or new.app_instance_id<>old.app_instance_id or new.business_customer_id<>old.business_customer_id
    or new.created_at<>old.created_at or new.expires_at<>old.expires_at or new.version<>old.version+1 then
    raise exception 'Sepetin bağlamı, bitişi ve sürümü korunmalıdır' using errcode='23514';
  end if;
  new.edit_txid:=txid_current();
  return new;
end $$;
create trigger cart_change_check before update or delete on carts for each row execute function protect_cart();

create function check_cart_line() returns trigger language plpgsql as $$
declare parent carts; context_business uuid; context_cart uuid; choices integer;
begin
  if tg_op='DELETE' then context_business:=old.business_id; context_cart:=old.cart_id;
  else context_business:=new.business_id; context_cart:=new.cart_id; end if;
  select * into parent from carts where business_id=context_business and id=context_cart for update;
  if parent.id is null and tg_op='DELETE' then return old; end if;
  if parent.id is null or parent.status<>'open' or parent.edit_txid<>txid_current() or parent.expires_at<=now() then
    raise exception 'Sepet satırı yalnızca açık sepetin sürüm işlemi içinde değişebilir' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and (new.id<>old.id or new.business_id<>old.business_id or new.cart_id<>old.cart_id) then
    raise exception 'Sepet satırı taşınamaz' using errcode='23514';
  end if;
  select count(distinct id) into choices from unnest(new.option_ids) id;
  if choices<>cardinality(new.option_ids) then raise exception 'Aynı seçenek tekrarlanamaz' using errcode='23514'; end if;
  if exists (select 1 from unnest(new.option_ids) selected(id) where not exists (
    select 1 from options o join item_option_groups g on g.business_id=o.business_id and g.group_id=o.group_id
    where o.business_id=new.business_id and o.id=selected.id and g.item_id=new.item_id
  )) then raise exception 'Seçenek ürünün işletmesine bağlı olmalıdır' using errcode='23503'; end if;
  return new;
end $$;
create trigger cart_line_check before insert or update or delete on cart_lines for each row execute function check_cart_line();

create table orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  cart_id uuid not null,
  branch_id uuid not null,
  app_instance_id uuid not null,
  business_customer_id uuid not null,
  fulfilment text not null check (fulfilment='pickup'),
  status text not null default 'placed',
  version integer not null default 1 check (version > 0),
  total_minor bigint not null check (total_minor between 0 and 100000000),
  vat_minor bigint not null check (vat_minor between 0 and total_minor),
  currency text not null default 'TRY' check (currency='TRY'),
  state_graph jsonb not null default ordering_core_graph(),
  capabilities jsonb not null default '[]',
  created_txid bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id), unique (business_id,cart_id),
  foreign key (business_id,cart_id,branch_id,app_instance_id,business_customer_id,fulfilment)
    references carts(business_id,id,branch_id,app_instance_id,business_customer_id,fulfilment),
  foreign key (business_id,branch_id) references branches(business_id,id),
  foreign key (business_id,app_instance_id) references app_instances(business_id,id),
  foreign key (business_id,business_customer_id) references business_customers(business_id,id),
  check (ordering_graph_allowed(state_graph,capabilities)), check (state_graph ? status)
);
create index orders_business_list on orders(business_id,created_at desc,id desc);
create index orders_customer_list on orders(business_id,business_customer_id,app_instance_id,created_at desc);
create table order_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  order_id uuid not null,
  item_id uuid not null,
  name text not null check (length(name) between 1 and 80),
  quantity integer not null check (quantity between 1 and 99),
  base_price_minor bigint not null check (base_price_minor between 0 and 100000000),
  unit_price_minor bigint not null check (unit_price_minor between 0 and 100000000),
  total_minor bigint not null check (total_minor=unit_price_minor*quantity and total_minor<=100000000),
  vat_basis_points integer not null check (vat_basis_points between 0 and 10000),
  vat_minor bigint not null check (vat_minor=round(total_minor::numeric*vat_basis_points/(10000+vat_basis_points))),
  position integer not null check (position between 0 and 99),
  unique (business_id,id), unique (business_id,order_id,position),
  foreign key (business_id,order_id) references orders(business_id,id),
  foreign key (business_id,item_id) references catalog_items(business_id,id)
);
create table order_line_options (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  order_line_id uuid not null,
  option_id uuid not null,
  name text not null check (length(name) between 1 and 80),
  price_delta_minor bigint not null check (price_delta_minor between 0 and 100000000),
  unique (business_id,id), unique (business_id,order_line_id,option_id),
  foreign key (business_id,order_line_id) references order_lines(business_id,id),
  foreign key (business_id,option_id) references options(business_id,id)
);
create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  order_id uuid not null,
  version integer not null check (version>0),
  from_status text,
  to_status text not null,
  actor_kind text not null check (actor_kind in ('customer','business','system')),
  member_id uuid,
  business_customer_id uuid,
  created_at timestamptz not null default now(),
  unique (business_id,id), unique (business_id,order_id,version),
  foreign key (business_id,order_id) references orders(business_id,id),
  foreign key (business_id,member_id) references business_members(business_id,id),
  foreign key (business_id,business_customer_id) references business_customers(business_id,id),
  check ((actor_kind='customer' and business_customer_id is not null and member_id is null)
    or (actor_kind='business' and member_id is not null and business_customer_id is null)
    or (actor_kind='system' and member_id is null and business_customer_id is null))
);
alter table outbox_events add constraint outbox_order_fk foreign key (business_id,order_id) references orders(business_id,id);

create function protect_order() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'Sipariş silinemez' using errcode='23514'; end if;
  if tg_op='INSERT' then
    if new.status<>'placed' or new.version<>1 or new.created_txid<>txid_current()
      or new.state_graph<>ordering_workflow_for_instance(new.business_id,new.app_instance_id)
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
create trigger order_change_check before insert or update or delete on orders for each row execute function protect_order();

create function protect_order_snapshot() returns trigger language plpgsql as $$
declare parent orders; line order_lines; product catalog_items; chosen prices; selected options;
begin
  if tg_op<>'INSERT' then raise exception 'Sipariş fiyat görüntüsü değiştirilemez' using errcode='23514'; end if;
  if tg_table_name='order_lines' then
    select * into parent from orders where business_id=new.business_id and id=new.order_id for update;
    select * into product from catalog_items where business_id=new.business_id and id=new.item_id;
    select * into chosen from prices where business_id=new.business_id and item_id=new.item_id
      and (branch_id=parent.branch_id or branch_id is null) order by (branch_id is null) limit 1;
    if product.id is null or not product.active or not product.available or chosen.id is null
      or (product.category_id is not null and not exists(select 1 from catalog_categories where business_id=new.business_id and id=product.category_id and active))
      or new.name<>product.name or new.base_price_minor<>chosen.amount_minor or new.vat_basis_points<>chosen.vat_basis_points then
      raise exception 'Fiyat görüntüsü güncel katalogla eşleşmelidir' using errcode='23514';
    end if;
  else
    select * into line from order_lines where business_id=new.business_id and id=new.order_line_id;
    select * into parent from orders where business_id=new.business_id and id=line.order_id for update;
    select * into selected from options where business_id=new.business_id and id=new.option_id;
    if selected.id is null or not selected.active or new.name<>selected.name or new.price_delta_minor<>selected.price_delta_minor
      or not exists(select 1 from item_option_groups g join option_groups og on og.business_id=g.business_id and og.id=g.group_id
        where g.business_id=new.business_id and g.item_id=line.item_id and g.group_id=selected.group_id and og.active) then
      raise exception 'Seçenek görüntüsü ürünün güncel seçeneğiyle eşleşmelidir' using errcode='23514';
    end if;
  end if;
  if parent.id is null or parent.created_txid<>txid_current() or parent.version<>1 then
    raise exception 'Siparişe sonradan fiyat satırı eklenemez' using errcode='23514';
  end if;
  return new;
end $$;
create trigger order_line_snapshot_check before insert or update or delete on order_lines for each row execute function protect_order_snapshot();
create trigger order_option_snapshot_check before insert or update or delete on order_line_options for each row execute function protect_order_snapshot();

create function check_order_totals() returns trigger language plpgsql as $$
declare parent orders; line order_lines; context_id uuid; context_line uuid; gross bigint; vat bigint; count_lines integer;
begin
  if tg_table_name='orders' then context_id:=new.id;
  elsif tg_table_name='order_lines' then context_id:=new.order_id; context_line:=new.id;
  else context_line:=new.order_line_id; select order_id into context_id from order_lines where business_id=new.business_id and id=new.order_line_id; end if;
  select * into parent from orders where business_id=new.business_id and id=context_id;
  select sum(total_minor),sum(vat_minor),count(*) into gross,vat,count_lines from order_lines where business_id=new.business_id and order_id=context_id;
  if count_lines<1 or gross<>parent.total_minor or vat<>parent.vat_minor then
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
create constraint trigger order_totals_check after insert or update on orders deferrable initially deferred for each row execute function check_order_totals();
create constraint trigger order_lines_totals_check after insert on order_lines deferrable initially deferred for each row execute function check_order_totals();
create constraint trigger order_options_totals_check after insert on order_line_options deferrable initially deferred for each row execute function check_order_totals();

create function append_order_change() returns trigger language plpgsql as $$
declare actor text; actor_id uuid;
begin
  actor:=coalesce(nullif(current_setting('vado.order_actor_kind',true),''),'system');
  actor_id:=nullif(current_setting('vado.order_actor_id',true),'')::uuid;
  insert into order_status_history(business_id,order_id,version,from_status,to_status,actor_kind,member_id,business_customer_id)
    values(new.business_id,new.id,new.version,case when tg_op='INSERT' then null else old.status end,new.status,actor,
      case when actor='business' then actor_id else null end,case when actor='customer' then actor_id else null end);
  insert into outbox_events(business_id,aggregate_id,order_id,sequence,type,payload)
    values(new.business_id,new.id,new.id,new.version,case when tg_op='INSERT' then 'order.placed' else 'order.status_changed' end,
      jsonb_build_object('orderId',new.id,'branchId',new.branch_id,'appInstanceId',new.app_instance_id,'status',new.status,'version',new.version,'totalMinor',new.total_minor));
  return new;
end $$;
create trigger order_event_append after insert or update on orders for each row execute function append_order_change();
create trigger order_history_append_only before update or delete on order_status_history for each row execute function protect_delivery_record();
create function check_order_history() returns trigger language plpgsql as $$
begin
  if not exists(select 1 from orders where business_id=new.business_id and id=new.order_id and version=new.version and status=new.to_status) then
    raise exception 'Sipariş geçmişi gerçek sürümle eşleşmelidir' using errcode='23514';
  end if;
  return new;
end $$;
create trigger order_history_check before insert on order_status_history for each row execute function check_order_history();
create function check_closed_cart() returns trigger language plpgsql as $$
begin
  if new.status='checked_out' and not exists(select 1 from orders where business_id=new.business_id and cart_id=new.id) then
    raise exception 'Kapanan sepette sipariş olmalıdır' using errcode='23514';
  end if;
  return null;
end $$;
create constraint trigger cart_order_check after insert or update on carts deferrable initially deferred for each row execute function check_closed_cart();

do $$
declare table_name text;
begin
  foreach table_name in array array['carts','cart_lines','orders','order_lines','order_line_options','order_status_history'] loop
    execute format('alter table %I enable row level security',table_name);
    execute format('alter table %I force row level security',table_name);
    execute format('create policy tenant_scope on %I using (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)
      with check (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)',table_name);
  end loop;
end $$;
