-- A phone-bound, expiring invitation grants only staff membership and selected branch permissions.
-- The bearer token is never persisted; only its SHA-256 digest is stored.
create table business_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  recipient_phone text not null check (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  invited_by uuid not null references users(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  order_access text not null check (order_access in ('none','view','manage')),
  can_manage_availability boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references users(id),
  revoked_at timestamptz,
  unique (business_id,id),
  check (expires_at > created_at),
  check (not (accepted_at is not null and revoked_at is not null)),
  check ((accepted_at is null) = (accepted_by is null)),
  check (order_access <> 'none' or can_manage_availability)
);
create index staff_invitations_business_idx on business_staff_invitations (business_id,created_at desc);
create table business_staff_invitation_branches (
  business_id uuid not null,
  invitation_id uuid not null,
  branch_id uuid not null,
  primary key (business_id,invitation_id,branch_id),
  foreign key (business_id,invitation_id) references business_staff_invitations(business_id,id) on delete cascade,
  foreign key (business_id,branch_id) references branches(business_id,id) on delete cascade
);
create index staff_invitation_branches_branch_idx on business_staff_invitation_branches (business_id,branch_id);
do $$
declare item text;
begin
  foreach item in array array['business_staff_invitations','business_staff_invitation_branches'] loop
    execute format('alter table %I enable row level security', item);
    execute format('alter table %I force row level security', item);
    execute format('create policy tenant_scope on %I using (business_id = nullif(current_setting(''vado.business_id'',true),'''')::uuid) with check (business_id = nullif(current_setting(''vado.business_id'',true),'''')::uuid)', item);
    execute format('grant select,insert,update,delete on %I to vado_app,vado_platform', item);
  end loop;
end $$;
