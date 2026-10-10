-- VADO Business Studio: şablon, işletmenin verisinden ve mini uygulama paketinden ayrıdır.
-- Şablon seçimi yalnızca taslak açar; inceleme ve yayın aşamalarını atlamaz.
create table business_studio (
  business_id uuid primary key references businesses (id) on delete cascade,
  template_id text not null check (template_id in (
    'food-fast', 'food-classic', 'food-premium',
    'beauty-solo', 'beauty-team', 'beauty-premium'
  )),
  status text not null default 'draft' check (status in ('draft', 'ready')),
  updated_at timestamptz not null default now()
);

alter table business_studio enable row level security;
alter table business_studio force row level security;
create policy tenant_scope on business_studio
  using (business_id = nullif(current_setting('vado.business_id', true), '')::uuid)
  with check (business_id = nullif(current_setting('vado.business_id', true), '')::uuid);

-- Migration rolü tablonun sahibi, uygulama rolü yalnızca RLS altında veri kullanır.
grant select, insert, update, delete on business_studio to vado_app, vado_platform;
