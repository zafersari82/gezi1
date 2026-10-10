-- A2-2c: Operasyon cihazlarını sipariş motorunda sektörlerden bağımsız tutar.
-- Yayımlanmış 0001-0034 dosyaları değişmeden kalır; ilişkiler aynı nesnelere işaret eder.
alter table kitchen_devices rename to operation_devices;
alter table kitchen_pairings rename to operation_device_pairings;
alter table kitchen_socket_tickets rename to operation_device_tickets;

-- PostgreSQL tablo değiştirince bağlı indis/kısıt adlarını kendiliğinden değiştirmez.
do $$
declare item record; target_name text;
begin
  for item in
    select c.conrelid::regclass as table_name, c.conname as old_name
    from pg_constraint c
    where c.conrelid in ('operation_devices'::regclass,
      'operation_device_pairings'::regclass, 'operation_device_tickets'::regclass)
      and c.conname like '%kitchen%'
  loop
    target_name := replace(replace(replace(item.old_name,
      'kitchen_socket_tickets', 'operation_device_tickets'),
      'kitchen_pairings', 'operation_device_pairings'),
      'kitchen_devices', 'operation_devices');
    execute format('alter table %s rename constraint %I to %I',
      item.table_name, item.old_name, target_name);
  end loop;
  for item in
    select indexrelid::regclass as index_name, relname as old_name
    from pg_index join pg_class on pg_class.oid = pg_index.indexrelid
    where indrelid in ('operation_devices'::regclass,
      'operation_device_pairings'::regclass, 'operation_device_tickets'::regclass)
      and relname like '%kitchen%'
  loop
    target_name := replace(replace(replace(item.old_name,
      'kitchen_socket_tickets', 'operation_device_tickets'),
      'kitchen_pairings', 'operation_device_pairings'),
      'kitchen_devices', 'operation_devices');
    execute format('alter index %s rename to %I', item.index_name, target_name);
  end loop;
end $$;

alter trigger kitchen_device_check on operation_devices rename to operation_device_check;
alter trigger kitchen_ticket_check on operation_device_tickets rename to operation_device_ticket_check;
alter function lookup_kitchen_pairing(text,uuid,uuid) rename to lookup_device_pairing;
alter function approve_kitchen_pairing(uuid,uuid,uuid,uuid) rename to approve_device_pairing;
alter function protect_kitchen_device() rename to protect_operation_device;
alter function protect_kitchen_ticket() rename to protect_device_ticket;

alter table capability_catalog add column device_statuses text[] not null default '{}';
-- Durum adları sözleşmedeki orderStateSchema ile aynı biçimde olmalıdır.
-- Dizi içindeki NULL ve boş öğeleri de reddet; array_to_string bunları atlayabilir.
alter table capability_catalog add constraint capability_device_statuses_valid check (
  cardinality(device_statuses) <= 20
  and array_position(device_statuses, null) is null
  and (
    cardinality(device_statuses) = 0
    or array_to_string(device_statuses, ',') ~ '^[a-z][a-z0-9_]{1,39}(,[a-z][a-z0-9_]{1,39})*$'
  )
);
revoke insert, update, delete, truncate on capability_catalog from vado_app, vado_platform;


create or replace function lookup_device_pairing(code text,business uuid,actor uuid) returns table(id uuid,poll_hash text)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if nullif(current_setting('vado.business_id',true),'')::uuid is distinct from business or not exists(
    select 1 from public.business_members m join public.users u on u.id=m.user_id
    where m.business_id=business and m.user_id=actor and m.role in ('owner','manager') and m.active and u.status='active'
  ) then raise exception 'Eşleştirme yöneticiye ve kapsamına aittir' using errcode='42501'; end if;
  return query select p.id,p.poll_hash from public.operation_device_pairings p where p.code_hash=code and p.status='pending' and p.expires_at>now() and p.attempts<5 for update;
end $$;

create or replace function approve_device_pairing(pairing uuid,business uuid,device uuid,actor uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if nullif(current_setting('vado.business_id',true),'')::uuid is distinct from business or not exists(
    select 1 from public.operation_devices d join public.business_members m on m.business_id=d.business_id and m.id=d.approved_by
    join public.users u on u.id=m.user_id where d.business_id=business and d.id=device and m.user_id=actor and m.active and m.role in ('owner','manager') and u.status='active'
  ) then raise exception 'Eşleştirme onayı kapsamı doğrulanmalıdır' using errcode='42501'; end if;
  update public.operation_device_pairings set status='approved',business_id=business,device_id=device where id=pairing and status='pending' and expires_at>now() and attempts<5;
  if not found then raise exception 'Eşleştirme süresi doldu veya kullanıldı' using errcode='23514'; end if;
end $$;

create or replace function protect_operation_device() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'Operasyon cihazı silinmez; kapatılır' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.business_id<>old.business_id or new.branch_id<>old.branch_id or new.app_instance_id<>old.app_instance_id
      or new.label<>old.label or new.token_hash<>old.token_hash or new.approved_by<>old.approved_by or new.created_at<>old.created_at or new.expires_at<>old.expires_at
      or old.revoked_at is not null or new.revoked_at is null then raise exception 'Cihaz kimliği değişmez; yalnız bir kez kapatılır' using errcode='23514'; end if;
  else
    perform 1 from app_instances where business_id=new.business_id and id=new.app_instance_id and active for share;
    if not found or not exists (
      select 1 from capability_catalog c
      where c.engine = 'ordering' and cardinality(c.device_statuses) > 0
        and ordering_capabilities_for_instance(new.business_id,new.app_instance_id)
          ? (c.id || '@' || c.version)
    ) then
      raise exception 'Cihaz yalnız operasyon cihazı destekleyen pakete bağlanır' using errcode='23514'; end if;
    perform 1 from branches where business_id=new.business_id and id=new.branch_id and active for share;
    if not found then raise exception 'Cihaz şubesi etkin olmalıdır' using errcode='23503'; end if;
    perform 1 from business_members m join users u on u.id=m.user_id where m.business_id=new.business_id and m.id=new.approved_by and m.active and m.role in ('owner','manager') and u.status='active' for share of m,u;
    if not found then raise exception 'Cihazı etkin yönetici onaylar' using errcode='23514'; end if;
    if new.revoked_at is not null or new.created_at>statement_timestamp()+interval '1 second' then raise exception 'Cihaz etkin ve güncel zamanda doğmalıdır' using errcode='23514'; end if;
  end if;
  return new;
end $$;

create or replace function protect_device_ticket() returns trigger language plpgsql as $$
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.business_id<>old.business_id or new.device_id<>old.device_id or new.token_hash<>old.token_hash or new.created_at<>old.created_at or new.expires_at<>old.expires_at or old.used_at is not null or new.used_at is null then
      raise exception 'Cihaz bileti yalnız bir kez tüketilir' using errcode='23514'; end if;
  else
    -- Cihaz bileti yalnız doğrulanmış cihaz kapsamından verilir. Aynı işletmedeki
    -- başka bir cihazın veya kişisel üyenin doğrudan SQL ile bilet üretmesini engelle.
    if nullif(current_setting('vado.tenant_device_id',true),'')::uuid is distinct from new.device_id
      or nullif(current_setting('vado.user_id',true),'') is not null
      or nullif(current_setting('vado.business_id',true),'')::uuid is distinct from new.business_id then
      raise exception 'Cihaz bileti doğrulanmış cihaz kapsamına aittir' using errcode='23514';
    end if;
    perform 1 from operation_devices where business_id=new.business_id and id=new.device_id and revoked_at is null and expires_at>now() for share;
    if not found or new.created_at>statement_timestamp()+interval '1 second' or new.used_at is not null then raise exception 'Cihaz bileti etkin cihaza aittir' using errcode='23514'; end if;
  end if;
  return new;
end $$;

create or replace function append_order_change() returns trigger language plpgsql as $$
declare actor text;actor_id uuid;
begin
  actor:=coalesce(nullif(current_setting('vado.order_actor_kind',true),''),'system');actor_id:=nullif(current_setting('vado.order_actor_id',true),'')::uuid;
  if actor='device' then
    -- Cihaz aktörü yalnız gerçekten doğrulanmış cihaz kapsamından gelir;
    -- üye/müşteri SQL bağlamı bir cihaz kimliğine bürünemez.
    if actor_id is distinct from nullif(current_setting('vado.tenant_device_id',true),'')::uuid
      or nullif(current_setting('vado.user_id',true),'') is not null then
      raise exception 'Cihaz aktörü doğrulanmış cihaz kapsamıyla eşleşmelidir' using errcode='23514';
    end if;
    perform 1 from operation_devices where business_id=new.business_id and id=actor_id and branch_id=new.branch_id and app_instance_id=new.app_instance_id and revoked_at is null and expires_at>now() for share;
    if not found or not exists (
      select 1 from capability_catalog c where c.engine='ordering'
        and new.capabilities ? (c.id || '@' || c.version)
        and new.status=any(c.device_statuses)
    ) then raise exception 'Cihaz bu sipariş durumunu değiştiremez' using errcode='23514'; end if;
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

-- Eski teşvik işlevi yeni operasyon cihazı tablosuna bakmalıdır.
create or replace function incentive_lifecycle(business uuid,target_order uuid,stage text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.orders;s public.incentive_settlements;cfg public.incentive_settings;r public.incentive_rules;wallet public.loyalty_wallets;snap jsonb;chosen jsonb;
 weights bigint[];remaining bigint[];allocated bigint[];discounts bigint[];amount bigint;goods bigint;spent bigint;earned bigint;count_total integer;count_customer integer;actor uuid;customer_actor boolean;manager_actor boolean;member_actor boolean;refunded bigint;full_return boolean;restore bigint;reverse bigint;item_ids uuid[];i integer;
begin
 if business is distinct from nullif(current_setting('vado.business_id',true),'')::uuid or stage not in ('reserve','complete','cancel','refund') then return jsonb_build_object('error','forbidden');end if;
 actor:=nullif(current_setting('vado.user_id',true),'')::uuid;
 select * into o from public.orders where business_id=business and id=target_order for update;
 if o.id is null or o.incentive_snapshot is null then return '{}'::jsonb;end if;
 if not exists(select 1 from public.businesses b join public.users u on u.id=b.owner_id where b.id=business and b.status='active' and b.verified and u.status='active') then return jsonb_build_object('error','forbidden');end if;
 customer_actor:=public.incentive_customer_actor(business,o.business_customer_id);
 manager_actor:=exists(select 1 from public.business_members m join public.users u on u.id=m.user_id where m.business_id=business and m.user_id=actor and m.active and m.role in ('owner','manager','staff') and u.status='active');
 member_actor:=manager_actor or exists(select 1 from public.courier_jobs j join public.business_members m on m.business_id=j.business_id and m.id=j.member_id join public.users u on u.id=m.user_id where j.business_id=business and j.order_id=o.id and m.user_id=actor and m.active and m.role='courier' and u.status='active' and j.status in ('in_transit','completed'));
 if (stage='reserve' and not customer_actor) or (stage in ('complete','cancel') and not(customer_actor or member_actor or (nullif(current_setting('vado.order_actor_kind',true),'')='device'
  and nullif(current_setting('vado.user_id',true),'') is null
  and nullif(current_setting('vado.order_actor_id',true),'')::uuid is not distinct from nullif(current_setting('vado.tenant_device_id',true),'')::uuid
  and nullif(current_setting('vado.tenant_device_id',true),'') is not null
  and exists(select 1 from public.operation_devices where business_id=business and id=nullif(current_setting('vado.order_actor_id',true),'')::uuid and branch_id=o.branch_id and app_instance_id=o.app_instance_id and revoked_at is null and expires_at>now()
   and exists(select 1 from public.capability_catalog c
      where c.engine='ordering' and o.capabilities ? (c.id || '@' || c.version)
        and o.status=any(c.device_statuses)))))) or (stage='refund' and not public.location_business_writer(business)) then return jsonb_build_object('error','forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended(business::text||':incentives',731));
 select * into s from public.incentive_settlements where business_id=business and order_id=o.id for update;
 snap:=o.incentive_snapshot;
 if stage='reserve' then
  if s.order_id is not null then return '{}'::jsonb;end if;
  if o.status<>'placed' or o.created_txid<>txid_current() then return jsonb_build_object('error','order_state_invalid');end if;
  select * into cfg from public.incentive_settings where business_id=business;
  if (snap->>'settingsVersion')::integer<>coalesce(cfg.version,0) or (snap->>'earnBasisPoints')::integer<>coalesce(cfg.earn_basis_points,0) then return jsonb_build_object('error','incentive_unavailable');end if;
  select array_agg(unit_price_minor*quantity order by position),array_agg(item_id order by position) into remaining,item_ids from public.order_lines where business_id=business and order_id=o.id;
  remaining:=coalesce(remaining,'{}');discounts:=array_fill(0::bigint,array[cardinality(remaining)]);
  if snap->'campaign'<>'null'::jsonb and snap->'coupon'<>'null'::jsonb and not coalesce(cfg.stack_campaign_coupon,false) then return jsonb_build_object('error','incentive_stack_forbidden');end if;
  for chosen in select value from jsonb_array_elements(jsonb_build_array(snap->'campaign',snap->'coupon')) where value<>'null'::jsonb loop
   select * into r from public.incentive_rules where business_id=business and id=(chosen->>'id')::uuid for update;
   if r.id is null or not r.active or now()<r.starts_at or now()>=r.ends_at or r.version<>(chosen->>'version')::integer or (r.branch_id is not null and r.branch_id<>o.branch_id) or (r.kind='campaign' and snap->'campaign'->>'id'<>r.id::text) or (r.kind='coupon' and (snap->'coupon'->>'id'<>r.id::text or not exists(select 1 from public.carts where business_id=business and id=o.cart_id and incentive_choice->>'couponCode'=r.code))) then return jsonb_build_object('error','incentive_unavailable');end if;
   select count(*),count(*) filter(where business_customer_id=o.business_customer_id) into count_total,count_customer from public.incentive_uses where business_id=business and rule_id=r.id and status<>'released';
   if (r.total_limit is not null and count_total>=r.total_limit) or (r.per_customer_limit is not null and count_customer>=r.per_customer_limit) then return jsonb_build_object('error','incentive_unavailable');end if;
   select coalesce(sum(x),0) into goods from unnest(remaining) x;
   if goods<r.minimum_minor then return jsonb_build_object('error','incentive_unavailable');end if;
   weights:=remaining;for i in 1..cardinality(weights) loop if cardinality(r.item_ids)>0 and not(item_ids[i]=any(r.item_ids)) then weights[i]:=0;end if;end loop;
   select coalesce(sum(x),0) into goods from unnest(weights) x;
   amount:=case when r.discount_type='fixed' then least(r.value,goods) else floor(goods::numeric*r.value/10000)::bigint end;
   if amount<=0 or amount<>(chosen->>'amountMinor')::bigint then return jsonb_build_object('error','incentive_unavailable');end if;
   allocated:=public.incentive_allocate(weights,amount);
   for i in 1..cardinality(remaining) loop remaining[i]:=remaining[i]-allocated[i];discounts[i]:=discounts[i]+allocated[i];end loop;
   insert into public.incentive_uses(business_id,rule_id,order_id,business_customer_id,status,amount_minor) values(business,r.id,o.id,o.business_customer_id,'reserved',amount);
  end loop;
  spent:=(snap->>'pointsSpent')::bigint;
  if spent is null or spent<0 or spent<>(select (incentive_choice->>'pointsToSpend')::bigint from public.carts where business_id=business and id=o.cart_id) then return jsonb_build_object('error','validation_failed');end if;
  insert into public.loyalty_wallets(business_id,business_customer_id) values(business,o.business_customer_id) on conflict do nothing;
  select * into wallet from public.loyalty_wallets where business_id=business and business_customer_id=o.business_customer_id for update;
  select coalesce(sum(x),0) into goods from unnest(remaining) x;
  if spent>greatest(wallet.balance,0) or spent>goods then return jsonb_build_object('error','loyalty_insufficient');end if;
  allocated:=public.incentive_allocate(remaining,spent);
  for i in 1..cardinality(remaining) loop remaining[i]:=remaining[i]-allocated[i];discounts[i]:=discounts[i]+allocated[i];end loop;
  select coalesce(sum(x),0) into goods from unnest(remaining) x;
  if to_jsonb(discounts)<>snap->'allocations' or (select coalesce(sum(x),0) from unnest(discounts) x)<>(snap->>'discountMinor')::bigint or goods+o.delivery_fee_minor<>o.total_minor or floor(goods::numeric*coalesce(cfg.earn_basis_points,0)/10000)::bigint<>(snap->>'pointsToEarn')::bigint then return jsonb_build_object('error','validation_failed');end if;
  insert into public.incentive_settlements(business_id,order_id,business_customer_id,status,points_spent) values(business,o.id,o.business_customer_id,'reserved',spent);
  perform public.incentive_ledger_write(business,o.business_customer_id,o.id,'spend',1,-spent);
 elsif s.order_id is not null then
  if stage='complete' and s.status='reserved' then
   if o.status<>'completed' then return jsonb_build_object('error','order_state_invalid');end if;
   if o.total_minor>0 and not exists(select 1 from public.order_payments where business_id=business and order_id=o.id) then return '{}'::jsonb;end if;
   earned:=(snap->>'pointsToEarn')::bigint;
   update public.incentive_settlements set status='redeemed',version=version+1,points_earned=earned where business_id=business and order_id=o.id;
   update public.incentive_uses set status='redeemed' where business_id=business and order_id=o.id;
   perform public.incentive_ledger_write(business,o.business_customer_id,o.id,'earn',s.version+1,earned);
  elsif stage='cancel' and s.status='reserved' then
   if o.status not in ('cancelled','rejected') then return jsonb_build_object('error','order_state_invalid');end if;
   update public.incentive_settlements set status='released',version=version+1,restored_spent=points_spent where business_id=business and order_id=o.id;
   update public.incentive_uses set status='released' where business_id=business and order_id=o.id;
   perform public.incentive_ledger_write(business,o.business_customer_id,o.id,'restore_spent',s.version+1,s.points_spent-s.restored_spent);
  elsif stage='refund' then
   select coalesce(sum(amount_minor),0),coalesce(bool_or(full_refund),false) into refunded,full_return from public.order_refunds where business_id=business and order_id=o.id;
   restore:=case when o.total_minor=0 then case when full_return then s.points_spent else 0 end else floor(s.points_spent::numeric*refunded/o.total_minor)::bigint end;
   reverse:=case when o.total_minor=0 then case when full_return then s.points_earned else 0 end else floor(s.points_earned::numeric*refunded/o.total_minor)::bigint end;
   if restore>s.restored_spent or reverse>s.reversed_earned then
    update public.incentive_settlements set version=version+1,restored_spent=greatest(restored_spent,restore),reversed_earned=greatest(reversed_earned,reverse) where business_id=business and order_id=o.id;
    perform public.incentive_ledger_write(business,o.business_customer_id,o.id,'restore_spent',s.version+1,greatest(0,restore-s.restored_spent));
    perform public.incentive_ledger_write(business,o.business_customer_id,o.id,'reverse_earned',s.version+1,-greatest(0,reverse-s.reversed_earned));
   end if;
  end if;
 end if;return '{}'::jsonb;
end $$;
