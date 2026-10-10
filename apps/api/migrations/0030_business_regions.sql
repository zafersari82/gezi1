-- Each active business may organise its branches in regions. Assignments and operator
-- permissions are tenant scoped. Region operators are staff, never global managers.
create table business_regions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  unique (business_id,id),
  unique (business_id,name)
);
create table business_region_branches (
  business_id uuid not null,
  branch_id uuid not null,
  region_id uuid not null,
  primary key (business_id,branch_id),
  foreign key (business_id,branch_id) references branches(business_id,id) on delete cascade,
  foreign key (business_id,region_id) references business_regions(business_id,id) on delete cascade
);
create index business_region_branches_region on business_region_branches(business_id,region_id,branch_id);
create table business_region_operators (
  business_id uuid not null,
  region_id uuid not null,
  user_id uuid not null,
  granted_at timestamptz not null default now(),
  primary key (business_id,region_id,user_id),
  foreign key (business_id,region_id) references business_regions(business_id,id) on delete cascade,
  foreign key (business_id,user_id) references business_members(business_id,user_id) on delete cascade
);
create index business_region_operators_user on business_region_operators(business_id,user_id,region_id);
-- Automatic updates on region assignments revoke/grant operational access immediately:
-- no materialised branch permissions to become stale.
do $$
declare item text;
begin
  foreach item in array array['business_regions','business_region_branches','business_region_operators'] loop
    execute format('alter table %I enable row level security', item);
    execute format('alter table %I force row level security', item);
    execute format('create policy tenant_scope on %I using (business_id = nullif(current_setting(''vado.business_id'',true),'''')::uuid) with check (business_id = nullif(current_setting(''vado.business_id'',true),'''')::uuid)', item);
    execute format('grant select,insert,update,delete on %I to vado_app,vado_platform', item);
  end loop;
end $$;
