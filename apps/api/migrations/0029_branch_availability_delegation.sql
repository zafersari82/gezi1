-- Delegated branch operators may only change product availability in assigned branches.
-- Other business permissions continue to require the existing owner/manager roles.
create table branch_availability_grants (
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null,
  user_id uuid not null,
  granted_at timestamptz not null default now(),
  primary key (business_id, branch_id, user_id),
  foreign key (business_id, branch_id) references branches(business_id, id) on delete cascade,
  foreign key (business_id, user_id) references business_members(business_id, user_id) on delete cascade
);
create index branch_availability_grants_user on branch_availability_grants(business_id,user_id,branch_id);
alter table branch_availability_grants enable row level security;
alter table branch_availability_grants force row level security;
create policy tenant_scope on branch_availability_grants
  using (business_id = nullif(current_setting('vado.business_id', true), '')::uuid)
  with check (business_id = nullif(current_setting('vado.business_id', true), '')::uuid);
grant select, insert, update, delete on branch_availability_grants to vado_app, vado_platform;
