-- Kişisel hesabı olmayan tablet, kullanıcı üyeliği yerine dar bir cihaz aktörü taşır.
create table kitchen_devices (
  id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),branch_id uuid not null,app_instance_id uuid not null,
  label text not null check(length(btrim(label)) between 1 and 40),token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  approved_by uuid not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days',revoked_at timestamptz,
  unique(business_id,id),foreign key(business_id,branch_id) references branches(business_id,id),foreign key(business_id,app_instance_id) references app_instances(business_id,id),
  foreign key(business_id,approved_by) references business_members(business_id,id),check(expires_at>created_at and expires_at<=created_at+interval '30 days')
);
create table kitchen_pairings (
  id uuid primary key default gen_random_uuid(),code_hash text not null unique check(code_hash ~ '^[0-9a-f]{64}$'),poll_hash text not null check(poll_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check(status in ('pending','approved')),attempts integer not null default 0 check(attempts between 0 and 5),
  business_id uuid,device_id uuid,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '5 minutes',
  foreign key(business_id,device_id) references kitchen_devices(business_id,id),
  check(expires_at>created_at and expires_at<=created_at+interval '5 minutes'),
  check((status='pending' and business_id is null and device_id is null) or (status='approved' and business_id is not null and device_id is not null))
);
alter table kitchen_pairings enable row level security;
alter table kitchen_pairings force row level security;
create policy pairing_schema_owner on kitchen_pairings to vado_owner using(true) with check(true);
revoke insert,update,delete on kitchen_pairings from vado_app;
-- API rolü yalnız doğrulanmış yöneticinin tek bir kodunu kilitler; global kuyruk görünmez.
create function lookup_kitchen_pairing(code text,business uuid,actor uuid) returns table(id uuid,poll_hash text)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if nullif(current_setting('vado.business_id',true),'')::uuid is distinct from business or not exists(
    select 1 from public.business_members m join public.users u on u.id=m.user_id
    where m.business_id=business and m.user_id=actor and m.role in ('owner','manager') and m.active and u.status='active'
  ) then raise exception 'Eşleştirme yöneticiye ve kapsamına aittir' using errcode='42501'; end if;
  return query select p.id,p.poll_hash from public.kitchen_pairings p where p.code_hash=code and p.status='pending' and p.expires_at>now() and p.attempts<5 for update;
end $$;
revoke all on function lookup_kitchen_pairing(text,uuid,uuid) from public;
grant execute on function lookup_kitchen_pairing(text,uuid,uuid) to vado_app;
create function approve_kitchen_pairing(pairing uuid,business uuid,device uuid,actor uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if nullif(current_setting('vado.business_id',true),'')::uuid is distinct from business or not exists(
    select 1 from public.kitchen_devices d join public.business_members m on m.business_id=d.business_id and m.id=d.approved_by
    join public.users u on u.id=m.user_id where d.business_id=business and d.id=device and m.user_id=actor and m.active and m.role in ('owner','manager') and u.status='active'
  ) then raise exception 'Eşleştirme onayı kapsamı doğrulanmalıdır' using errcode='42501'; end if;
  update public.kitchen_pairings set status='approved',business_id=business,device_id=device where id=pairing and status='pending' and expires_at>now() and attempts<5;
  if not found then raise exception 'Eşleştirme süresi doldu veya kullanıldı' using errcode='23514'; end if;
end $$;
revoke all on function approve_kitchen_pairing(uuid,uuid,uuid,uuid) from public;
grant execute on function approve_kitchen_pairing(uuid,uuid,uuid,uuid) to vado_app;
create function protect_kitchen_device() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'Mutfak cihazı silinmez; kapatılır' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.business_id<>old.business_id or new.branch_id<>old.branch_id or new.app_instance_id<>old.app_instance_id
      or new.label<>old.label or new.token_hash<>old.token_hash or new.approved_by<>old.approved_by or new.created_at<>old.created_at or new.expires_at<>old.expires_at
      or old.revoked_at is not null or new.revoked_at is null then raise exception 'Cihaz kimliği değişmez; yalnız bir kez kapatılır' using errcode='23514'; end if;
  else
    perform 1 from app_instances where business_id=new.business_id and id=new.app_instance_id and active for share;
    if not found or not ordering_capabilities_for_instance(new.business_id,new.app_instance_id) ? 'ordering.kitchen@1.0.0' then
      raise exception 'Cihaz yalnız açık mutfak paketine bağlanır' using errcode='23514'; end if;
    perform 1 from branches where business_id=new.business_id and id=new.branch_id and active for share;
    if not found then raise exception 'Cihaz şubesi etkin olmalıdır' using errcode='23503'; end if;
    perform 1 from business_members m join users u on u.id=m.user_id where m.business_id=new.business_id and m.id=new.approved_by and m.active and m.role in ('owner','manager') and u.status='active' for share of m,u;
    if not found then raise exception 'Cihazı etkin yönetici onaylar' using errcode='23514'; end if;
    if new.revoked_at is not null or new.created_at>statement_timestamp()+interval '1 second' then raise exception 'Cihaz etkin ve güncel zamanda doğmalıdır' using errcode='23514'; end if;
  end if;
  return new;
end $$;
create trigger kitchen_device_check before insert or update or delete on kitchen_devices for each row execute function protect_kitchen_device();
create table kitchen_socket_tickets (
  id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),device_id uuid not null,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '60 seconds',used_at timestamptz,
  foreign key(business_id,device_id) references kitchen_devices(business_id,id),check(expires_at>created_at and expires_at<=created_at+interval '60 seconds')
);
create function protect_kitchen_ticket() returns trigger language plpgsql as $$
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.business_id<>old.business_id or new.device_id<>old.device_id or new.token_hash<>old.token_hash or new.created_at<>old.created_at or new.expires_at<>old.expires_at or old.used_at is not null or new.used_at is null then
      raise exception 'Mutfak bileti yalnız bir kez tüketilir' using errcode='23514'; end if;
  else
    perform 1 from kitchen_devices where business_id=new.business_id and id=new.device_id and revoked_at is null and expires_at>now() for share;
    if not found or new.created_at>statement_timestamp()+interval '1 second' or new.used_at is not null then raise exception 'Mutfak bileti etkin cihaza aittir' using errcode='23514'; end if;
  end if;
  return new;
end $$;
create trigger kitchen_ticket_check before insert or update on kitchen_socket_tickets for each row execute function protect_kitchen_ticket();
do $$ declare name text; begin
  foreach name in array array['kitchen_devices','kitchen_socket_tickets'] loop
    execute format('alter table %I enable row level security',name);execute format('alter table %I force row level security',name);
    execute format('create policy tenant_scope on %I using (business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid) with check (business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid)',name);
  end loop;
end $$;

alter table order_status_history drop constraint order_status_history_actor_kind_check;
alter table order_status_history drop constraint order_status_history_check;
alter table order_status_history add column device_id uuid;
alter table order_status_history add constraint order_history_device_fk foreign key(business_id,device_id) references kitchen_devices(business_id,id);
alter table order_status_history add constraint order_actor_kind_known check(actor_kind in ('customer','business','system','device'));
alter table order_status_history add constraint order_actor_required check (
  (actor_kind='customer' and business_customer_id is not null and member_id is null and device_id is null)
  or (actor_kind='business' and member_id is not null and business_customer_id is null and device_id is null)
  or (actor_kind='system' and member_id is null and business_customer_id is null and device_id is null)
  or (actor_kind='device' and device_id is not null and member_id is null and business_customer_id is null)
);
create or replace function append_order_change() returns trigger language plpgsql as $$
declare actor text;actor_id uuid;
begin
  actor:=coalesce(nullif(current_setting('vado.order_actor_kind',true),''),'system');actor_id:=nullif(current_setting('vado.order_actor_id',true),'')::uuid;
  if actor='device' then
    perform 1 from kitchen_devices where business_id=new.business_id and id=actor_id and branch_id=new.branch_id and app_instance_id=new.app_instance_id and revoked_at is null and expires_at>now() for share;
    if not found or not new.capabilities ? 'ordering.kitchen@1.0.0' then raise exception 'Cihaz siparişin etkin mutfağına aittir' using errcode='23514'; end if;
  end if;
  insert into order_status_history(business_id,order_id,version,from_status,to_status,actor_kind,member_id,business_customer_id,device_id)
    values(new.business_id,new.id,new.version,case when tg_op='INSERT' then null else old.status end,new.status,actor,
      case when actor='business' then actor_id else null end,case when actor='customer' then actor_id else null end,case when actor='device' then actor_id else null end);
  insert into outbox_events(business_id,aggregate_id,order_id,sequence,type,payload)
    values(new.business_id,new.id,new.id,new.version,case when tg_op='INSERT' then 'order.placed' else 'order.status_changed' end,
      jsonb_build_object('orderId',new.id,'branchId',new.branch_id,'appInstanceId',new.app_instance_id,'status',new.status,'version',new.version,'totalMinor',new.total_minor,
        'preparationMinutes',new.preparation_minutes,'estimatedReadyAt',new.estimated_ready_at,'rejectionReason',new.rejection_reason));
  return new;
end $$;
create function protect_kitchen_capability() returns trigger language plpgsql as $$
begin
  if old.capability_id='ordering.kitchen' and old.enabled and (tg_op='DELETE' or not new.enabled) and exists(
    select 1 from kitchen_devices where business_id=old.business_id and app_instance_id=old.app_instance_id and revoked_at is null and expires_at>now()) then
    raise exception 'Etkin mutfak cihazı varken paket kapatılamaz' using errcode='23514'; end if;
  if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger kitchen_capability_check before update or delete on app_instance_capabilities for each row execute function protect_kitchen_capability();
