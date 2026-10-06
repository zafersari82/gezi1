-- Yalnızca bu sürümle incelenip yayımlanan paketler ve veri ayarları saklanır.
create function check_business_member_user() returns trigger language plpgsql as $$
begin
  if new.active then
    perform 1 from users where id=new.user_id and status='active' for share;
    if not found then raise exception 'Etkin üyelik yalnızca etkin hesaba bağlanabilir' using errcode='23514'; end if;
  end if;
  return new;
end $$;
create trigger business_member_user_check before insert or update of user_id,active on business_members
  for each row execute function check_business_member_user();

create table app_instance_capabilities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  app_instance_id uuid not null,
  capability_id text not null check (capability_id='ordering.preparation'),
  version text not null check (version='1.0.0'),
  enabled boolean not null default false,
  config jsonb not null default '{"stationLabel":"Hazırlık"}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(business_id,id), unique(business_id,app_instance_id,capability_id),
  foreign key(business_id,app_instance_id) references app_instances(business_id,id),
  check (jsonb_typeof(config)='object' and config-'stationLabel'='{}'::jsonb
    and config ? 'stationLabel' and jsonb_typeof(config->'stationLabel')='string'
    and length(btrim(config->>'stationLabel')) between 1 and 40 and length(config->>'stationLabel')<=40)
);
alter table app_instance_capabilities enable row level security;
alter table app_instance_capabilities force row level security;
create policy tenant_scope on app_instance_capabilities
  using (business_id = nullif(current_setting('vado.business_id',true),'')::uuid)
  with check (business_id = nullif(current_setting('vado.business_id',true),'')::uuid);

create function check_instance_capability() returns trigger language plpgsql as $$
declare context_business uuid; context_instance uuid;
begin
  context_business:=case when tg_op='DELETE' then old.business_id else new.business_id end;
  context_instance:=case when tg_op='DELETE' then old.app_instance_id else new.app_instance_id end;
  perform 1 from app_instances where business_id=context_business and id=context_instance and engine='ordering' for update;
  if not found then raise exception 'Paket örneği aynı işletmedeki motoru kullanmalıdır' using errcode='23503'; end if;
  if tg_op='UPDATE' and (new.id<>old.id or new.business_id<>old.business_id
    or new.app_instance_id<>old.app_instance_id or new.capability_id<>old.capability_id) then
    raise exception 'Paket ayarının kimliği değişmez' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  new.updated_at:=now();
  return new;
end $$;
create trigger instance_capability_check before insert or update or delete on app_instance_capabilities
  for each row execute function check_instance_capability();

create function ordering_preparation_graph() returns jsonb language sql immutable as $$
  select '{"placed":["accepted","rejected","cancelled"],"accepted":["preparing","cancelled"],"preparing":["ready","cancelled"],"ready":["completed","cancelled"],"rejected":[],"completed":[],"cancelled":[]}'::jsonb
$$;
create or replace function ordering_graph_allowed(graph jsonb, capabilities jsonb) returns boolean language sql immutable as $$
  select (graph=ordering_core_graph() and capabilities='[]'::jsonb)
    or (graph=ordering_preparation_graph() and capabilities='["ordering.preparation@1.0.0"]'::jsonb)
$$;
create or replace function ordering_capabilities_for_instance(business uuid, instance uuid) returns jsonb language sql stable as $$
  select case when exists(select 1 from app_instance_capabilities where business_id=business and app_instance_id=instance
    and capability_id='ordering.preparation' and version='1.0.0' and enabled)
    then '["ordering.preparation@1.0.0"]'::jsonb else '[]'::jsonb end
$$;
create or replace function ordering_workflow_for_instance(business uuid, instance uuid) returns jsonb language sql stable as $$
  select case when ordering_capabilities_for_instance(business,instance)='[]'::jsonb
    then ordering_core_graph() else ordering_preparation_graph() end
$$;
