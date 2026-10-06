-- Kimlik dizisi işlem kapanış sırasını korumaz; işletme başına kilitlenen sayaç korur.
create table business_live_offsets (business_id uuid primary key references businesses(id),value bigint not null default 0 check(value>=0));
create table business_live_events (
  business_id uuid not null references businesses(id),cursor bigint not null check(cursor>0),event_id uuid not null,
  branch_id uuid not null,app_instance_id uuid not null,business_customer_id uuid,order_id uuid,table_session_id uuid,
  type text not null check(type in ('order.placed','order.status_changed','order.payment_recorded','table.requested','table.request_resolved')),
  created_at timestamptz not null default now(),primary key(business_id,cursor),unique(business_id,event_id),
  foreign key(business_id,branch_id) references branches(business_id,id),foreign key(business_id,app_instance_id) references app_instances(business_id,id),
  foreign key(business_id,business_customer_id) references business_customers(business_id,id),foreign key(business_id,order_id) references orders(business_id,id),
  foreign key(business_id,table_session_id) references table_sessions(business_id,id)
);
create index live_events_customer on business_live_events(business_id,business_customer_id,app_instance_id,cursor);
create index live_events_kitchen on business_live_events(business_id,branch_id,app_instance_id,cursor);
do $$ declare name text; begin
  foreach name in array array['business_live_offsets','business_live_events'] loop
    execute format('alter table %I enable row level security',name);execute format('alter table %I force row level security',name);
    execute format('create policy tenant_scope on %I using (business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid) with check (business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid)',name);
  end loop;
end $$;
revoke insert,update,delete on business_live_offsets,business_live_events from vado_app;
create function append_business_live_event() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare next_cursor bigint;branch uuid;instance uuid;customer uuid;seating uuid;
begin
  if new.type not in ('order.placed','order.status_changed','order.payment_recorded','table.requested','table.request_resolved') then return new;end if;
  if new.business_id is distinct from nullif(current_setting('vado.business_id',true),'')::uuid then raise exception 'Canlı olay kapsamı korunmalıdır' using errcode='42501';end if;
  if new.order_id is not null then
    select o.branch_id,o.app_instance_id,o.business_customer_id,o.table_session_id into branch,instance,customer,seating from public.orders o where o.business_id=new.business_id and o.id=new.order_id;
  else
    select s.branch_id,s.app_instance_id,r.business_customer_id,s.id into branch,instance,customer,seating from public.table_service_requests r join public.table_sessions s on s.business_id=r.business_id and s.id=r.table_session_id
      where r.business_id=new.business_id and r.id=new.aggregate_id;
  end if;
  if branch is null or instance is null then raise exception 'Canlı olay gerçek sipariş veya masa çağrısından alınır' using errcode='23514';end if;
  insert into public.business_live_offsets(business_id,value) values(new.business_id,1) on conflict(business_id) do update set value=business_live_offsets.value+1 returning value into next_cursor;
  insert into public.business_live_events(business_id,cursor,event_id,branch_id,app_instance_id,business_customer_id,order_id,table_session_id,type)
    values(new.business_id,next_cursor,new.id,branch,instance,customer,new.order_id,seating,new.type);
  return new;
end $$;
revoke all on function append_business_live_event() from public;
create trigger live_event_append after insert on outbox_events for each row execute function append_business_live_event();
create function append_payment_event() returns trigger language plpgsql as $$
begin
  insert into outbox_events(business_id,aggregate_id,order_id,sequence,type,payload) values(new.business_id,new.id,new.order_id,1,'order.payment_recorded',jsonb_build_object('orderId',new.order_id,'paymentId',new.id,'amountMinor',new.amount_minor));
  return new;
end $$;
create trigger payment_event_append after insert on order_payments for each row execute function append_payment_event();
create function append_table_request_event() returns trigger language plpgsql as $$
begin
  insert into outbox_events(business_id,aggregate_id,sequence,type,payload) values(new.business_id,new.id,new.version,case when tg_op='INSERT' then 'table.requested' else 'table.request_resolved' end,jsonb_build_object('tableSessionId',new.table_session_id,'requestId',new.id,'kind',new.kind,'status',new.status));return new;
end $$;
create trigger table_request_event_append after insert or update on table_service_requests for each row execute function append_table_request_event();
create function protect_business_live_event() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' and current_user='vado_platform' and old.created_at<now()-interval '30 days' then return old;end if;
  raise exception 'Canlı olay defteri değiştirilemez' using errcode='23514';
end $$;
create trigger live_event_immutable before update or delete on business_live_events for each row execute function protect_business_live_event();
-- 2.6'dan kalan olaylar da imleç akışına bir kez aktarılır; müşteri ve şube alanları kaynaktan gelir.
do $$ declare e record;b record;next_cursor bigint;previous_scope text; begin
  previous_scope:=current_setting('vado.business_id',true);
  for b in select id from businesses loop
    perform set_config('vado.business_id',b.id::text,true);
  for e in select o.business_id,o.id as event_id,o.type,r.branch_id,r.app_instance_id,r.business_customer_id,r.table_session_id,o.order_id
    from outbox_events o join orders r on r.business_id=o.business_id and r.id=o.order_id where o.business_id=b.id and o.type in ('order.placed','order.status_changed') order by o.created_at,o.id loop
    perform set_config('vado.business_id',e.business_id::text,true);
    insert into business_live_offsets(business_id,value) values(e.business_id,1) on conflict(business_id) do update set value=business_live_offsets.value+1 returning value into next_cursor;
    insert into business_live_events(business_id,cursor,event_id,branch_id,app_instance_id,business_customer_id,order_id,table_session_id,type) values(e.business_id,next_cursor,e.event_id,e.branch_id,e.app_instance_id,e.business_customer_id,e.order_id,e.table_session_id,e.type);
  end loop;
  end loop;
  perform set_config('vado.business_id',coalesce(previous_scope,''),true);
end $$;
