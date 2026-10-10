-- Order permissions are independent of product availability and NEVER imply business-wide manager status.
-- A person can be a branch or region order viewer/operator without receiving global rights.
create table business_branch_order_grants (
  business_id uuid not null,
  branch_id uuid not null,
  user_id uuid not null,
  can_manage boolean not null default false,
  granted_at timestamptz not null default now(),
  primary key (business_id,branch_id,user_id),
  foreign key (business_id,branch_id) references branches(business_id,id) on delete cascade,
  foreign key (business_id,user_id) references business_members(business_id,user_id) on delete cascade
);
create index business_branch_order_grants_user on business_branch_order_grants(business_id,user_id,branch_id);
create table business_region_order_grants (
  business_id uuid not null,
  region_id uuid not null,
  user_id uuid not null,
  can_manage boolean not null default false,
  granted_at timestamptz not null default now(),
  primary key (business_id,region_id,user_id),
  foreign key (business_id,region_id) references business_regions(business_id,id) on delete cascade,
  foreign key (business_id,user_id) references business_members(business_id,user_id) on delete cascade
);
create index business_region_order_grants_user on business_region_order_grants(business_id,user_id,region_id);
do $$
declare item text;
begin
  foreach item in array array['business_branch_order_grants','business_region_order_grants'] loop
    execute format('alter table %I enable row level security', item);
    execute format('alter table %I force row level security', item);
    execute format('create policy tenant_scope on %I using (business_id = nullif(current_setting(''vado.business_id'',true),'''')::uuid) with check (business_id = nullif(current_setting(''vado.business_id'',true),'''')::uuid)', item);
    execute format('grant select,insert,update,delete on %I to vado_app,vado_platform', item);
  end loop;
end $$;
