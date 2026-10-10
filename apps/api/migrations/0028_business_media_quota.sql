-- Each tenant owns an independent quota. Larger plans may be assigned a different
-- limit by authorised operations; no SKU/plan assumptions enter the media service.
alter table businesses
  add column media_quota_bytes bigint not null default 268435456,
  add constraint businesses_media_quota_valid
    check (media_quota_bytes between 1048576 and 1099511627776);

-- Physical deletion is retried after DB commit; a storage outage must not lose
-- the keys that still need removal. Orphans may be drained on later cleanups.
create table business_media_deletions (
  storage_key text primary key,
  business_id uuid references businesses(id) on delete set null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0
);
alter table business_media_deletions enable row level security;
alter table business_media_deletions force row level security;
create policy tenant_scope on business_media_deletions
  using (business_id = nullif(current_setting('vado.business_id', true), '')::uuid)
  with check (business_id = nullif(current_setting('vado.business_id', true), '')::uuid);
grant select, insert, update, delete on business_media_deletions to vado_app, vado_platform;
