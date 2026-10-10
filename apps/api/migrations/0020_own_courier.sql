-- Kendi kurye sağlayıcısı, sipariş çekirdeğine kurye kimliği eklemeden dar erişim sağlar.
alter table business_members drop constraint business_members_role_check;
alter table business_members add constraint business_members_role_check check(role in ('owner','manager','staff','courier'));
alter table business_members add column version integer not null default 1 constraint business_member_version check(version>0);
create policy courier_schema_member_lookup on business_members for select to vado_owner using(true);
create function courier_actor(business uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.business_members m where m.user_id=nullif(current_setting('vado.user_id',true),'')::uuid and m.role='courier' and (business is null or m.business_id=business))
$$;
revoke all on function courier_actor(uuid) from public;
grant execute on function courier_actor(uuid) to vado_app;
-- Üyelik kapatılsa da rolün geçmiş yolları yeniden açılmaz; yalnız güncel gerçek rol belirleyicidir.
do $$ declare name text; begin
 foreach name in array array['business_members','business_customers','orders','order_lines','order_line_options','order_status_history','order_payments','carts','cart_lines','outbox_events','event_deliveries','idempotency_keys','delivery_order_snapshots','business_live_events','business_live_offsets','business_socket_tickets'] loop
  execute format('create policy courier_legacy_denied on %I as restrictive using(case when current_user=''vado_owner'' then true else not courier_actor(business_id) end) with check(case when current_user=''vado_owner'' then true else not courier_actor(business_id) end)',name);
 end loop;
end $$;
alter table users enable row level security;
alter table users force row level security;
create policy users_existing_access on users using(true) with check(true);
create policy courier_other_users_denied on users as restrictive using(case when current_user='vado_owner' then true else not courier_actor(null) or id=nullif(current_setting('vado.user_id',true),'')::uuid end) with check(case when current_user='vado_owner' then true else not courier_actor(null) or id=nullif(current_setting('vado.user_id',true),'')::uuid end);

create function courier_current_member(business uuid) returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare member uuid;
begin
 if business is distinct from nullif(current_setting('vado.business_id',true),'')::uuid then return null; end if;
 select m.id into member from public.business_members m join public.users u on u.id=m.user_id join public.businesses b on b.id=m.business_id join public.users owner on owner.id=b.owner_id
 where m.business_id=business and m.user_id=nullif(current_setting('vado.user_id',true),'')::uuid and m.role='courier' and m.active and u.status='active' and b.status='active' and b.verified and owner.status='active';
 return member;
end $$;
revoke all on function courier_current_member(uuid) from public;
grant execute on function courier_current_member(uuid) to vado_app;
create table courier_jobs (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id) on delete restrict,order_id uuid not null,member_id uuid not null,
 version integer not null default 1 constraint courier_job_version check(version>0),status text not null default 'assigned' constraint courier_job_status check(status in ('assigned','in_transit','completed','cancelled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(business_id,id),unique(business_id,order_id),
 foreign key(business_id,order_id) references orders(business_id,id) on delete restrict,foreign key(business_id,member_id) references business_members(business_id,id) on delete restrict
);
create unique index courier_one_active_job on courier_jobs(business_id,member_id) where status in ('assigned','in_transit');
create function courier_job_active(business uuid,job uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.courier_jobs j join public.orders o on o.business_id=j.business_id and o.id=j.order_id where j.business_id=business and j.id=job and j.member_id=public.courier_current_member(business) and j.status in ('assigned','in_transit') and o.status not in ('completed','rejected','cancelled') and o.fulfilment='delivery')
$$;
revoke all on function courier_job_active(uuid,uuid) from public;
grant execute on function courier_job_active(uuid,uuid) to vado_app;
alter table courier_jobs enable row level security;
alter table courier_jobs force row level security;
create policy courier_job_schema on courier_jobs to vado_owner using(business_id=nullif(current_setting('vado.business_id',true),'')::uuid) with check(business_id=nullif(current_setting('vado.business_id',true),'')::uuid);
create policy courier_job_manager on courier_jobs using(location_business_writer(business_id)) with check(location_business_writer(business_id));
create policy courier_job_assignee on courier_jobs for select using(courier_job_active(business_id,id));
revoke insert,update,delete on courier_jobs from vado_app;
create table courier_job_history (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id) on delete restrict,job_id uuid not null,member_id uuid not null,actor_id uuid not null references users(id) on delete restrict,
 version integer not null,status text not null,created_at timestamptz not null default now(),unique(business_id,job_id,version),foreign key(business_id,job_id) references courier_jobs(business_id,id) on delete restrict,foreign key(business_id,member_id) references business_members(business_id,id) on delete restrict
);
alter table courier_job_history enable row level security;
alter table courier_job_history force row level security;
create policy courier_history_manager on courier_job_history using(location_business_writer(business_id)) with check(location_business_writer(business_id));
create policy courier_history_schema on courier_job_history to vado_owner using(business_id=nullif(current_setting('vado.business_id',true),'')::uuid) with check(business_id=nullif(current_setting('vado.business_id',true),'')::uuid);
revoke insert,update,delete on courier_job_history from vado_app;
create trigger courier_history_immutable before update or delete on courier_job_history for each row execute function protect_delivery_record();
create function courier_job_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'Kurye işi silinmez' using errcode='23514'; end if;
 if tg_op='UPDATE' and (old.status in ('completed','cancelled') or new.id<>old.id or new.business_id<>old.business_id or new.order_id<>old.order_id or new.created_at<>old.created_at or new.version<>old.version+1 or (new.member_id<>old.member_id and (old.status<>'assigned' or new.status<>'assigned')) or (new.status<>old.status and not ((old.status='assigned' and new.status in ('in_transit','cancelled')) or (old.status='in_transit' and new.status in ('completed','cancelled'))))) then raise exception 'Kurye işi sürüm ve izinli akışla ilerler' using errcode='23514'; end if;
 if tg_op='INSERT' and (new.status<>'assigned' or new.version<>1) then raise exception 'Kurye işi atamayla başlar' using errcode='23514'; end if;
 new.updated_at:=now(); return new;
end $$;
create trigger courier_job_check before insert or update or delete on courier_jobs for each row execute function courier_job_guard();
create function append_courier_change() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into public.courier_job_history(business_id,job_id,member_id,actor_id,version,status) values(new.business_id,new.id,new.member_id,nullif(current_setting('vado.user_id',true),'')::uuid,new.version,new.status);
 insert into public.outbox_events(business_id,aggregate_id,order_id,sequence,type,payload) values(new.business_id,new.id,new.order_id,new.version,'delivery.'||case new.status when 'assigned' then 'assigned' when 'in_transit' then 'departed' else new.status end,jsonb_build_object('jobId',new.id,'orderId',new.order_id,'status',new.status,'version',new.version));
 return new;
end $$;
create trigger courier_job_event after insert or update on courier_jobs for each row execute function append_courier_change();
create function courier_job_view(job public.courier_jobs) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',job.id,'businessId',job.business_id,'orderId',job.order_id,'memberId',job.member_id,'version',job.version,'status',job.status,'orderVersion',o.version,'totalMinor',o.total_minor,'paymentVersion',case when exists(select 1 from public.order_payments p where p.business_id=o.business_id and p.order_id=o.id) then 1 else 0 end,'paid',o.total_minor=0 or exists(select 1 from public.order_payments p where p.business_id=o.business_id and p.order_id=o.id)) from public.orders o where o.business_id=job.business_id and o.id=job.order_id
$$;
revoke all on function courier_job_view(public.courier_jobs) from public;
create function courier_read_job(business uuid,job uuid,include_contact boolean) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.courier_jobs;result jsonb;
begin
 if public.courier_lock_actor(business) is null or not public.courier_job_active(business,job) then return null; end if;
 perform 1 from public.orders o join public.courier_jobs job_row on job_row.business_id=o.business_id and job_row.order_id=o.id where job_row.business_id=business and job_row.id=job for share of o,job_row;
 if not public.courier_job_active(business,job) then return null; end if;
 select * into j from public.courier_jobs where business_id=business and id=job;
 result:=public.courier_job_view(j);
 if include_contact then select result||jsonb_build_object('contact',s.snapshot->'address') into result from public.delivery_order_snapshots s where s.business_id=business and s.order_id=j.order_id; end if;
 return result;
end $$;
revoke all on function courier_read_job(uuid,uuid,boolean) from public;
grant execute on function courier_read_job(uuid,uuid,boolean) to vado_app;
-- Eski tahsilat tablosu korunur; kurye de aynı gerçek tahsilat kaydını ve aktörü kullanır.
alter table order_payments drop constraint order_payments_place_check;
alter table order_payments add constraint order_payments_place_check check(place in ('table','counter','delivery'));
alter table order_payments add column reference text constraint order_payment_reference check(reference is null or length(btrim(reference)) between 1 and 120);
create function courier_assign(business uuid,target_order uuid,member uuid,expected integer,expected_order integer) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.orders;j public.courier_jobs;
begin
 if expected is null or expected<0 or expected_order is null or expected_order<1 then return jsonb_build_object('error','validation_failed'); end if;
 if not public.location_business_writer(business) then return jsonb_build_object('error','forbidden'); end if;
 perform 1 from public.business_members m join public.users u on u.id=m.user_id where m.business_id=business and m.id=member and m.role='courier' and m.active and u.status='active' for share of m,u;
 if not found then return jsonb_build_object('error','not_found'); end if;
 select * into o from public.orders where business_id=business and id=target_order for update;
 if o.id is null then return jsonb_build_object('error','not_found'); end if;
 if o.version<>expected_order then return jsonb_build_object('error','order_version_conflict'); end if;
 if o.fulfilment<>'delivery' or o.status in ('in_transit','completed','cancelled','rejected') then return jsonb_build_object('error','order_state_invalid'); end if;
 select * into j from public.courier_jobs where business_id=business and order_id=target_order for update;
 if coalesce(j.version,0)<>expected then return jsonb_build_object('error','settings_version_conflict'); end if;
 if exists(select 1 from public.courier_jobs where business_id=business and member_id=member and status in ('assigned','in_transit') and order_id<>target_order) then return jsonb_build_object('error','courier_busy'); end if;
 if j.id is null then insert into public.courier_jobs(business_id,order_id,member_id) values(business,target_order,member) returning * into j;
 else update public.courier_jobs set member_id=member,version=version+1 where business_id=business and id=j.id returning * into j; end if;
 return public.courier_job_view(j);
exception when unique_violation then return jsonb_build_object('error','courier_busy');
end $$;
revoke all on function courier_assign(uuid,uuid,uuid,integer,integer) from public;
grant execute on function courier_assign(uuid,uuid,uuid,integer,integer) to vado_app;
create function courier_finish_order() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.status in ('completed','cancelled','rejected') then update public.courier_jobs set status=case when new.status='completed' then 'completed' else 'cancelled' end,version=version+1 where business_id=new.business_id and order_id=new.id and status in ('assigned','in_transit'); end if;
 return new;
end $$;
create trigger courier_order_terminal after update of status on orders for each row when(old.status is distinct from new.status) execute function courier_finish_order();
create table courier_mutations (
 business_id uuid not null references businesses(id) on delete restrict,user_id uuid not null references users(id) on delete restrict,job_id uuid not null,operation text not null check(operation in ('depart','deliver','payment')),key text not null check(key ~ '^[A-Za-z0-9._:-]{1,128}$'),body_hash text not null check(body_hash ~ '^[0-9a-f]{64}$'),response_body jsonb not null,
 primary key(business_id,user_id,job_id,operation,key),foreign key(business_id,job_id) references courier_jobs(business_id,id) on delete restrict
);
alter table courier_mutations enable row level security;
alter table courier_mutations force row level security;
create policy courier_mutation_schema on courier_mutations to vado_owner using(business_id=nullif(current_setting('vado.business_id',true),'')::uuid) with check(business_id=nullif(current_setting('vado.business_id',true),'')::uuid);
revoke all on courier_mutations from vado_app;
create trigger courier_mutation_immutable before update or delete on courier_mutations for each row execute function protect_delivery_record();
create function courier_mutate(business uuid,job uuid,operation text,key text,body_hash text,body jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.courier_jobs;o public.orders;actor uuid;stored public.courier_mutations;result jsonb;payment_version integer;
begin
 if key is null or key !~ '^[A-Za-z0-9._:-]{1,128}$' or body_hash is null or body_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(body)<>'object' or not coalesce((body->>'expectedVersion') ~ '^[1-9][0-9]{0,8}$',false) or (operation in ('depart','deliver') and not coalesce((body->>'expectedOrderVersion') ~ '^[1-9][0-9]{0,8}$',false)) or (operation='payment' and (not coalesce(body->>'expectedPaymentVersion' in ('0','1'),false) or not coalesce(body->>'method' in ('cash','card'),false) or not coalesce(length(btrim(body->>'reference')) between 1 and 120,false))) then return jsonb_build_object('error','validation_failed'); end if;
 actor:=public.courier_current_member(business);
 if actor is null then return jsonb_build_object('error','not_found'); end if;
 perform 1 from public.business_members m join public.users u on u.id=m.user_id join public.businesses b on b.id=m.business_id join public.users owner on owner.id=b.owner_id where m.business_id=business and m.id=actor and m.active and m.role='courier' and u.status='active' and owner.status='active' and b.status='active' and b.verified for share of m,u,b,owner;
 if not found then return jsonb_build_object('error','not_found'); end if;
 select * into j from public.courier_jobs where business_id=business and id=job;
 select * into o from public.orders where business_id=business and id=j.order_id for update;
 select * into j from public.courier_jobs where business_id=business and id=job for update;
 if not public.courier_job_active(business,job) then
  if operation='deliver' and j.status='completed' and j.member_id=actor then
   select * into stored from public.courier_mutations m where m.business_id=business and m.user_id=nullif(current_setting('vado.user_id',true),'')::uuid and m.job_id=job and m.operation='deliver' and m.key=courier_mutate.key;
   if stored.key is not null then
    if stored.body_hash<>courier_mutate.body_hash then return jsonb_build_object('error','idempotency_conflict'); end if;
    return stored.response_body||jsonb_build_object('applied',false);
   end if;
  end if;
  return jsonb_build_object('error','not_found');
 end if;
 select * into stored from public.courier_mutations m where m.business_id=business and m.user_id=nullif(current_setting('vado.user_id',true),'')::uuid and m.job_id=job and m.operation=courier_mutate.operation and m.key=courier_mutate.key;
 if stored.key is not null then if stored.body_hash<>courier_mutate.body_hash then return jsonb_build_object('error','idempotency_conflict'); end if; return stored.response_body||jsonb_build_object('applied',false); end if;
 if j.version<>(body->>'expectedVersion')::integer then return jsonb_build_object('error','settings_version_conflict'); end if;
 perform set_config('vado.order_actor_kind','business',true);perform set_config('vado.order_actor_id',actor::text,true);
 if operation='payment' then
  select count(*) into payment_version from public.order_payments where business_id=business and order_id=o.id;
  if payment_version<>(body->>'expectedPaymentVersion')::integer or payment_version>0 or o.total_minor=0 then return jsonb_build_object('error','payment_version_conflict'); end if;
  if j.status<>'in_transit' or body->>'method' not in ('cash','card') or length(btrim(body->>'reference')) not between 1 and 120 then return jsonb_build_object('error','order_state_invalid'); end if;
  insert into public.order_payments(business_id,order_id,amount_minor,place,method,member_id,reference) values(business,o.id,o.total_minor,'delivery',body->>'method',actor,body->>'reference');
 elsif operation in ('depart','deliver') then
  if o.version<>(body->>'expectedOrderVersion')::integer then return jsonb_build_object('error','order_version_conflict'); end if;
  if operation='depart' then
   if j.status<>'assigned' or o.status<>'ready' then return jsonb_build_object('error','order_state_invalid'); end if;
   update public.orders set status='in_transit',version=version+1 where business_id=business and id=o.id;
   update public.courier_jobs set status='in_transit',version=version+1 where business_id=business and id=job returning * into j;
  else
   if j.status<>'in_transit' or o.status<>'in_transit' or (o.total_minor>0 and not exists(select 1 from public.order_payments where business_id=business and order_id=o.id)) then return jsonb_build_object('error','order_state_invalid'); end if;
   update public.orders set status='completed',version=version+1 where business_id=business and id=o.id;
   select * into j from public.courier_jobs where business_id=business and id=job;
  end if;
 else return jsonb_build_object('error','validation_failed'); end if;
 result:=public.courier_job_view(j);
 insert into public.courier_mutations(business_id,user_id,job_id,operation,key,body_hash,response_body) values(business,nullif(current_setting('vado.user_id',true),'')::uuid,job,operation,key,body_hash,result);
 insert into public.audit_log(actor,action,target_type,target_id,metadata) values(current_setting('vado.user_id',true),'delivery.'||operation,'courier_job',job::text,jsonb_build_object('businessId',business,'version',j.version));
 return result||jsonb_build_object('applied',true);
end $$;
revoke all on function courier_mutate(uuid,uuid,text,text,text,jsonb) from public;
grant execute on function courier_mutate(uuid,uuid,text,text,text,jsonb) to vado_app;
-- Ertelenmiş bütünlük tetikleyicisi sağlayıcı işlevi döndükten sonra da gerçek satırları denetler.
alter function check_order_totals() security definer;
alter function check_order_totals() set search_path=pg_catalog,public;
create function courier_lock_actor(business uuid) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare member uuid;
begin
 member:=public.courier_current_member(business);if member is null then return null; end if;
 perform 1 from public.business_members m join public.users u on u.id=m.user_id join public.businesses b on b.id=m.business_id join public.users owner on owner.id=b.owner_id where m.business_id=business and m.id=member and m.active and m.role='courier' and u.status='active' and owner.status='active' and b.status='active' and b.verified for share of m,u,b,owner;
 if not found then return null; end if;return member;
end $$;
revoke all on function courier_lock_actor(uuid) from public;
grant execute on function courier_lock_actor(uuid) to vado_app;

create table courier_socket_tickets (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id) on delete restrict,user_id uuid not null,session_id uuid not null references sessions(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '60 seconds',used_at timestamptz,
 foreign key(business_id,user_id) references business_members(business_id,user_id) on delete cascade,check(expires_at>created_at and expires_at<=created_at+interval '60 seconds')
);
alter table courier_socket_tickets enable row level security;
alter table courier_socket_tickets force row level security;
create policy courier_ticket_owner on courier_socket_tickets using(business_id=nullif(current_setting('vado.business_id',true),'')::uuid and user_id=nullif(current_setting('vado.user_id',true),'')::uuid and courier_current_member(business_id) is not null) with check(business_id=nullif(current_setting('vado.business_id',true),'')::uuid and user_id=nullif(current_setting('vado.user_id',true),'')::uuid and courier_current_member(business_id) is not null);
create function courier_ticket_guard() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.business_id<>old.business_id or new.user_id<>old.user_id or new.session_id<>old.session_id or new.token_hash<>old.token_hash or new.created_at<>old.created_at or new.expires_at<>old.expires_at or old.used_at is not null or new.used_at is null) then raise exception 'Kurye bileti yalnız bir kez tüketilir' using errcode='23514'; end if;
 if tg_op='INSERT' and (new.created_at>now()+interval '1 second' or new.used_at is not null or not exists(select 1 from sessions s where s.id=new.session_id and s.user_id=new.user_id and s.revoked_at is null and s.expires_at>now())) then raise exception 'Kurye bileti etkin oturuma aittir' using errcode='23514'; end if;return new;
end $$;
create trigger courier_ticket_check before insert or update on courier_socket_tickets for each row execute function courier_ticket_guard();
create table courier_live_offsets(business_id uuid primary key references businesses(id) on delete restrict,value bigint not null default 0 check(value>=0));
create table courier_live_events (
 business_id uuid not null references businesses(id) on delete restrict,cursor bigint not null check(cursor>0),event_id uuid not null,job_id uuid not null,member_id uuid not null,version integer not null check(version>0),type text not null,created_at timestamptz not null default now(),primary key(business_id,cursor),unique(business_id,event_id),
 foreign key(business_id,job_id) references courier_jobs(business_id,id) on delete restrict,foreign key(business_id,member_id) references business_members(business_id,id) on delete restrict
);
do $$ declare name text;begin foreach name in array array['courier_live_offsets','courier_live_events'] loop
 execute format('alter table %I enable row level security',name);execute format('alter table %I force row level security',name);
 execute format('create policy courier_live_schema on %I to vado_owner using(business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid) with check(business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid)',name);
end loop;end $$;
create policy courier_live_actor on courier_live_offsets for select using(courier_current_member(business_id) is not null);
create policy courier_live_assignee on courier_live_events for select using(member_id=courier_current_member(business_id) and courier_job_active(business_id,job_id));
revoke insert,update,delete on courier_live_offsets,courier_live_events from vado_app;
create function append_courier_live() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.courier_jobs;next_cursor bigint;
begin
 if new.order_id is null or new.type not in ('order.status_changed','order.payment_recorded','delivery.assigned','delivery.departed','delivery.completed','delivery.cancelled') then return new; end if;
 select * into j from public.courier_jobs where business_id=new.business_id and order_id=new.order_id;
 if j.id is null then return new; end if;
 insert into public.courier_live_offsets(business_id,value) values(new.business_id,1) on conflict(business_id) do update set value=courier_live_offsets.value+1 returning value into next_cursor;
 insert into public.courier_live_events(business_id,cursor,event_id,job_id,member_id,version,type) values(new.business_id,next_cursor,new.id,j.id,j.member_id,j.version,new.type);return new;
end $$;
create trigger courier_live_append after insert on outbox_events for each row execute function append_courier_live();
