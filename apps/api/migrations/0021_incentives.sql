-- Teşvik platformu: para ve puan hareketleri siparişle aynı işlemde kesinleşir.
create table platform_mutations (
 user_id uuid not null references users(id) on delete restrict,business_id uuid references businesses(id) on delete restrict,
 operation text not null,key text not null check(key ~ '^[A-Za-z0-9._:-]{1,128}$'),body_hash text not null check(body_hash ~ '^[0-9a-f]{64}$'),response_body jsonb,
 created_at timestamptz not null default now(),primary key(user_id,operation,key)
);
alter table platform_mutations enable row level security;
alter table platform_mutations force row level security;
create policy platform_mutation_actor on platform_mutations using(user_id=nullif(current_setting('vado.user_id',true),'')::uuid and (business_id is null or business_id=nullif(current_setting('vado.business_id',true),'')::uuid)) with check(user_id=nullif(current_setting('vado.user_id',true),'')::uuid and (business_id is null or business_id=nullif(current_setting('vado.business_id',true),'')::uuid));
create table incentive_settings (
 business_id uuid primary key references businesses(id) on delete restrict,version integer not null default 1 check(version>0),stack_campaign_coupon boolean not null default false,earn_basis_points integer not null default 0 check(earn_basis_points between 0 and 10000)
);
create table incentive_rules (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id) on delete restrict,
 name text not null check(length(name) between 1 and 120),kind text not null check(kind in ('campaign','coupon')),code text,
 discount_type text not null check(discount_type in ('fixed','percentage')),value bigint not null check(value between 1 and 100000000 and (discount_type<>'percentage' or value<=10000)),minimum_minor bigint not null check(minimum_minor between 0 and 100000000),
 branch_id uuid,item_ids uuid[] not null default '{}',starts_at timestamptz not null,ends_at timestamptz not null,total_limit integer check(total_limit between 1 and 10000000),per_customer_limit integer check(per_customer_limit between 1 and 100000),active boolean not null default true,
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(business_id,id),unique(business_id,code),foreign key(business_id,branch_id) references branches(business_id,id) on delete restrict,
 constraint incentive_code_kind check((kind='coupon' and code is not null and code ~ '^[A-Z0-9_-]{3,30}$') or (kind='campaign' and code is null)),constraint incentive_period check(ends_at>starts_at),constraint incentive_item_limit check(cardinality(item_ids)<=100)
);
create index incentive_rules_active on incentive_rules(business_id,active,starts_at,ends_at);
create function incentive_config_guard() returns trigger language plpgsql as $$ begin
 perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':incentives',731));
 if tg_op='UPDATE' and (new.business_id<>old.business_id or new.version<>old.version+1) then raise exception 'Teşvik kimliği ve sürümü korunmalıdır' using errcode='23514'; end if;
 if tg_table_name='incentive_rules' then
  if tg_op='UPDATE' and (new.id<>old.id or new.kind<>old.kind or new.created_at<>old.created_at) then raise exception 'Kural kimliği ve türü değişmez' using errcode='23514'; end if;
  if exists(select 1 from unnest(new.item_ids) x(id) where not exists(select 1 from catalog_items i where i.business_id=new.business_id and i.id=x.id)) or cardinality(new.item_ids)<>(select count(distinct id) from unnest(new.item_ids) x(id)) then raise exception 'Teşvik ürünleri aynı işletmenin benzersiz ürünleri olmalıdır' using errcode='23503'; end if;
  new.updated_at:=now();
 end if;return new;
end $$;
create trigger incentive_rule_check before insert or update on incentive_rules for each row execute function incentive_config_guard();
create trigger incentive_setting_check before insert or update on incentive_settings for each row execute function incentive_config_guard();
create table incentive_uses (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,rule_id uuid not null,order_id uuid not null,business_customer_id uuid not null,status text not null check(status in ('reserved','redeemed','released')),
 amount_minor bigint not null check(amount_minor between 0 and 100000000),created_at timestamptz not null default now(),unique(business_id,order_id,rule_id),foreign key(business_id,rule_id) references incentive_rules(business_id,id) on delete restrict,foreign key(business_id,order_id) references orders(business_id,id) on delete restrict,foreign key(business_id,business_customer_id) references business_customers(business_id,id) on delete restrict
);
create index incentive_usage_limit on incentive_uses(business_id,rule_id,status,business_customer_id);
create table loyalty_wallets (
 business_id uuid not null,business_customer_id uuid not null,balance bigint not null default 0 check(balance between -1000000000000 and 1000000000000),version integer not null default 0 check(version>=0),primary key(business_id,business_customer_id),foreign key(business_id,business_customer_id) references business_customers(business_id,id) on delete restrict
);
create table incentive_settlements (
 business_id uuid not null,order_id uuid not null,business_customer_id uuid not null,status text not null check(status in ('reserved','redeemed','released')),version integer not null default 1 check(version>0),points_spent bigint not null check(points_spent between 0 and 100000000),points_earned bigint not null default 0 check(points_earned between 0 and 100000000),restored_spent bigint not null default 0,reversed_earned bigint not null default 0,
 primary key(business_id,order_id),foreign key(business_id,order_id) references orders(business_id,id) on delete restrict,foreign key(business_id,business_customer_id) references business_customers(business_id,id) on delete restrict,check(restored_spent between 0 and points_spent),check(reversed_earned between 0 and points_earned)
);
create table loyalty_ledger (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,business_customer_id uuid not null,order_id uuid not null,kind text not null check(kind in ('spend','earn','restore_spent','reverse_earned')),ordinal integer not null check(ordinal>0),delta bigint not null check(delta<>0),balance_after bigint not null,created_at timestamptz not null default now(),unique(business_id,order_id,kind,ordinal),foreign key(business_id,order_id) references orders(business_id,id) on delete restrict,foreign key(business_id,business_customer_id) references loyalty_wallets(business_id,business_customer_id) on delete restrict
);
create function incentive_customer_actor(business uuid,customer uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select business=nullif(current_setting('vado.business_id',true),'')::uuid and exists(select 1 from public.business_customers c join public.users u on u.id=c.user_id and u.status='active' where c.business_id=business and c.id=customer and c.user_id=nullif(current_setting('vado.user_id',true),'')::uuid) $$;
revoke all on function incentive_customer_actor(uuid,uuid) from public;
grant execute on function incentive_customer_actor(uuid,uuid) to vado_app;
do $$ declare name text;begin
 foreach name in array array['incentive_rules','incentive_settings'] loop
  execute format('alter table %I enable row level security',name);execute format('alter table %I force row level security',name);
  execute format('create policy incentive_config_read on %I for select using(location_business_reader(business_id))',name);
  execute format('create policy incentive_config_write on %I for all using(location_business_writer(business_id)) with check(location_business_writer(business_id))',name);
  execute format('create policy incentive_config_internal on %I for all using(current_user=''vado_owner'' and business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid) with check(current_user=''vado_owner'' and business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid)',name);
 end loop;
 foreach name in array array['incentive_uses','loyalty_wallets','loyalty_ledger','incentive_settlements'] loop
  execute format('alter table %I enable row level security',name);execute format('alter table %I force row level security',name);
  execute format('create policy incentive_owned_read on %I for select using(business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid and (current_user=''vado_owner'' or location_business_writer(business_id) or incentive_customer_actor(business_id,business_customer_id)))',name);
  execute format('create policy incentive_internal_write on %I for all using(business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid and current_user=''vado_owner'') with check(business_id=nullif(current_setting(''vado.business_id'',true),'''')::uuid and current_user=''vado_owner'')',name);
  execute format('revoke insert,update,delete on %I from vado_app',name);
 end loop;
end $$;
create trigger loyalty_ledger_immutable before update or delete on loyalty_ledger for each row execute function protect_delivery_record();
alter table carts add column incentive_choice jsonb not null default '{"couponCode":null,"pointsToSpend":0}' constraint cart_incentive_choice check(jsonb_typeof(incentive_choice)='object' and incentive_choice ?& array['couponCode','pointsToSpend'] and incentive_choice-array['couponCode','pointsToSpend']='{}' and (incentive_choice->>'couponCode' is null or incentive_choice->>'couponCode' ~ '^[A-Z0-9_-]{3,30}$') and (incentive_choice->>'pointsToSpend') ~ '^[0-9]{1,9}$' and (incentive_choice->>'pointsToSpend')::bigint between 0 and 100000000);
alter table orders add column incentive_snapshot jsonb constraint order_incentive_object check(incentive_snapshot is null or jsonb_typeof(incentive_snapshot)='object');
alter table order_lines add column discount_minor bigint not null default 0;
alter table order_lines drop constraint order_lines_check;
alter table order_lines add constraint order_line_discount_total check(discount_minor between 0 and unit_price_minor*quantity and total_minor=unit_price_minor*quantity-discount_minor and total_minor between 0 and 100000000);
create function incentive_snapshot_guard() returns trigger language plpgsql as $$ declare expected bigint;begin
 if tg_table_name='orders' then
  if tg_op='UPDATE' and new.incentive_snapshot is distinct from old.incentive_snapshot then raise exception 'Teşvik görüntüsü değişmez' using errcode='23514'; end if;
 else
  select coalesce((incentive_snapshot->'allocations'->>new.position)::bigint,0) into expected from orders where business_id=new.business_id and id=new.order_id;
  if new.discount_minor<>expected then raise exception 'Satır indirimi sipariş görüntüsüyle eşleşmelidir' using errcode='23514'; end if;
 end if;return new;
end $$;
create trigger incentive_order_snapshot_check before update on orders for each row execute function incentive_snapshot_guard();
create trigger incentive_line_snapshot_check before insert on order_lines for each row execute function incentive_snapshot_guard();

-- Fiziksel geri ödeme kanıtı Teşvik'in değil ödeme altyapısının kaydıdır; talep arayüzü sonraki pakettedir.
create table order_refunds (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,order_id uuid not null,sequence integer not null check(sequence>0),amount_minor bigint not null check(amount_minor between 0 and 100000000),full_refund boolean not null default false,
 method text not null check(method in ('cash','card')),reference text not null check(length(btrim(reference)) between 1 and 120),member_id uuid not null,created_at timestamptz not null default now(),unique(business_id,order_id,sequence),foreign key(business_id,order_id) references orders(business_id,id) on delete restrict,foreign key(business_id,member_id) references business_members(business_id,id) on delete restrict
);
alter table order_refunds enable row level security;
alter table order_refunds force row level security;
create policy order_refund_read on order_refunds for select using(business_id=nullif(current_setting('vado.business_id',true),'')::uuid and (location_business_writer(business_id) or exists(select 1 from orders o where o.business_id=order_refunds.business_id and o.id=order_refunds.order_id and incentive_customer_actor(o.business_id,o.business_customer_id))));
create policy order_refund_write on order_refunds for insert with check(location_business_writer(business_id));
create trigger order_refund_immutable before update or delete on order_refunds for each row execute function protect_delivery_record();
create function order_refund_guard() returns trigger language plpgsql as $$ declare parent orders; paid bigint;refunded bigint;last integer;begin
 select * into parent from orders where business_id=new.business_id and id=new.order_id for update;
 select coalesce(sum(amount_minor),0) into paid from order_payments where business_id=new.business_id and order_id=new.order_id;
 select coalesce(sum(amount_minor),0),coalesce(max(sequence),0) into refunded,last from order_refunds where business_id=new.business_id and order_id=new.order_id;
 if parent.id is null or parent.status not in ('accepted','preparing','ready','in_transit','completed','cancelled') or (parent.total_minor>0 and paid<>parent.total_minor) or new.sequence<>last+1 or refunded+new.amount_minor>paid or (new.amount_minor=0 and not(parent.total_minor=0 and new.full_refund and last=0)) or (new.full_refund and refunded+new.amount_minor<>parent.total_minor) or not exists(select 1 from business_members m where m.business_id=new.business_id and m.id=new.member_id and m.user_id=nullif(current_setting('vado.user_id',true),'')::uuid and m.active and m.role in ('owner','manager')) then raise exception 'İade güncel ödeme, yetki ve sıra ile eşleşmelidir' using errcode='23514'; end if;
 return new;
end $$;
create trigger order_refund_check before insert on order_refunds for each row execute function order_refund_guard();

create function incentive_allocate(weights bigint[],amount bigint) returns bigint[] language plpgsql immutable as $$ declare total bigint;i integer;leftover bigint;values bigint[];begin
 select coalesce(sum(x),0) into total from unnest(weights) x;
 if amount<0 or amount>total or exists(select 1 from unnest(weights) x where x<0) then raise exception 'İndirim aralığı geçersiz' using errcode='23514'; end if;
 values:=array_fill(0::bigint,array[coalesce(cardinality(weights),0)]);if total=0 then return values;end if;
 for i in 1..cardinality(weights) loop values[i]:=floor(weights[i]::numeric*amount/total)::bigint;end loop;
 select amount-coalesce(sum(x),0) into leftover from unnest(values) x;
 for i in select ordinal::integer from unnest(weights) with ordinality w(value,ordinal) order by mod(value::numeric*amount,total) desc,ordinal loop
  exit when leftover=0;values[i]:=values[i]+1;leftover:=leftover-1;
 end loop;return values;
end $$;
create function incentive_ledger_write(business uuid,customer uuid,target_order uuid,kind text,ordinal integer,delta bigint) returns void language plpgsql security definer set search_path=pg_catalog,public as $$ declare current_balance bigint;current_version integer;begin
 if delta=0 then return;end if;
 update public.loyalty_wallets set balance=balance+delta,version=version+1 where business_id=business and business_customer_id=customer returning balance,version into current_balance,current_version;
 insert into public.loyalty_ledger(business_id,business_customer_id,order_id,kind,ordinal,delta,balance_after) values(business,customer,target_order,kind,ordinal,delta,current_balance);
 insert into public.outbox_events(business_id,aggregate_id,order_id,sequence,type,payload) values(business,customer,target_order,current_version,'loyalty.changed',jsonb_build_object('businessCustomerId',customer,'version',current_version));
 insert into public.audit_log(actor,action,target_type,target_id,metadata) values(current_setting('vado.user_id',true),'loyalty.'||kind,'order',target_order::text,jsonb_build_object('businessId',business,'delta',delta,'version',current_version));
end $$;
revoke all on function incentive_ledger_write(uuid,uuid,uuid,text,integer,bigint) from public,vado_app,vado_platform;

create function incentive_lifecycle(business uuid,target_order uuid,stage text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
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
 if (stage='reserve' and not customer_actor) or (stage in ('complete','cancel') and not(customer_actor or member_actor or (nullif(current_setting('vado.order_actor_kind',true),'')='device' and exists(select 1 from public.kitchen_devices where business_id=business and id=nullif(current_setting('vado.order_actor_id',true),'')::uuid and branch_id=o.branch_id and app_instance_id=o.app_instance_id and revoked_at is null and expires_at>now())))) or (stage='refund' and not public.location_business_writer(business)) then return jsonb_build_object('error','forbidden');end if;
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
revoke all on function incentive_lifecycle(uuid,uuid,text) from public;
grant execute on function incentive_lifecycle(uuid,uuid,text) to vado_app;

create function incentive_order_finalise() returns trigger language plpgsql as $$ declare result jsonb;begin
 if tg_table_name='order_refunds' then result:=incentive_lifecycle(new.business_id,new.order_id,'refund');
 elsif tg_table_name='order_payments' then if not exists(select 1 from orders where business_id=new.business_id and id=new.order_id and status='completed') then return null;end if;result:=incentive_lifecycle(new.business_id,new.order_id,'complete');
 elsif tg_op='INSERT' then result:=incentive_lifecycle(new.business_id,new.id,'reserve');
 elsif new.status='completed' and old.status<>'completed' then result:=incentive_lifecycle(new.business_id,new.id,'complete');
 elsif new.status in ('cancelled','rejected') and new.status<>old.status then result:=incentive_lifecycle(new.business_id,new.id,'cancel');
 else return null;end if;
 if result ? 'error' then raise exception 'Teşvik işlem koruması: %',result->>'error' using errcode='23514';end if;return null;
end $$;
create constraint trigger incentive_order_reserved after insert on orders deferrable initially deferred for each row execute function incentive_order_finalise();
create trigger incentive_order_finished after update on orders for each row execute function incentive_order_finalise();
create trigger incentive_refund_finished after insert on order_refunds for each row execute function incentive_order_finalise();
create trigger incentive_payment_finished after insert on order_payments for each row execute function incentive_order_finalise();

create function incentive_usage_count(business uuid,rule uuid,customer uuid,cart uuid) returns table(total bigint,personal bigint) language sql stable security definer set search_path=pg_catalog,public as $$
 select count(*),count(*) filter(where u.business_customer_id=customer) from public.incentive_uses u where u.business_id=business and u.rule_id=rule and u.status<>'released' and (public.incentive_customer_actor(business,customer) or public.location_business_writer(business)) and not exists(select 1 from public.orders o where o.business_id=business and o.id=u.order_id and o.cart_id=cart)
$$;
revoke all on function incentive_usage_count(uuid,uuid,uuid,uuid) from public;
grant execute on function incentive_usage_count(uuid,uuid,uuid,uuid) to vado_app;
create function incentive_snapshot_shape(snapshot jsonb) returns boolean language plpgsql immutable as $$ declare key text;part jsonb;begin
 if jsonb_typeof(snapshot)<>'object' or not(snapshot ?& array['settingsVersion','earnBasisPoints','campaign','coupon','pointsSpent','pointsToEarn','discountMinor','allocations','issues']) or snapshot-array['settingsVersion','earnBasisPoints','campaign','coupon','pointsSpent','pointsToEarn','discountMinor','allocations','issues']<>'{}' then return false;end if;
 foreach key in array array['settingsVersion','earnBasisPoints','pointsSpent','pointsToEarn','discountMinor'] loop if not coalesce(snapshot->>key ~ '^[0-9]{1,9}$',false) then return false;end if;end loop;
 if (snapshot->>'earnBasisPoints')::bigint>10000 or (snapshot->>'pointsSpent')::bigint>100000000 or (snapshot->>'pointsToEarn')::bigint>100000000 or (snapshot->>'discountMinor')::bigint>100000000 or jsonb_typeof(snapshot->'allocations')<>'array' or jsonb_array_length(snapshot->'allocations')>100 or snapshot->'issues'<>'[]'::jsonb then return false;end if;
 for part in select value from jsonb_array_elements(snapshot->'allocations') loop if jsonb_typeof(part)<>'number' or not(part::text ~ '^[0-9]{1,9}$') or part::text::bigint>100000000 then return false;end if;end loop;
 for part in select value from jsonb_array_elements(jsonb_build_array(snapshot->'campaign',snapshot->'coupon')) where value<>'null'::jsonb loop
  if jsonb_typeof(part)<>'object' or not(part ?& array['id','version','name','amountMinor']) or not coalesce(part->>'id' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',false) or not coalesce(part->>'version' ~ '^[1-9][0-9]{0,8}$',false) or not coalesce(part->>'amountMinor' ~ '^[1-9][0-9]{0,8}$',false) or jsonb_typeof(part->'name')<>'string' then return false;end if;
 end loop;return true;
end $$;
alter table orders add constraint order_incentive_shape check(incentive_snapshot is null or incentive_snapshot_shape(incentive_snapshot));
