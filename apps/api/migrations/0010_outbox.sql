-- İşletme olayları yalıtılır; genel sohbet ve giriş olayları ayrı platform kuyruğundadır.
create table outbox_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  aggregate_id uuid not null,
  order_id uuid,
  sequence bigint not null check (sequence between 1 and 9007199254740991),
  type text not null check (type ~ '^[a-z][a-z0-9._-]{2,100}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 65536),
  status text not null default 'pending' check (status in ('pending', 'leased', 'delivered', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  lock_id uuid,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (business_id, id), unique (business_id, aggregate_id, sequence),
  check ((status = 'leased') = (locked_until is not null and lock_id is not null)),
  check ((status = 'delivered') = (delivered_at is not null))
);
create index outbox_ready on outbox_events(next_attempt_at, created_at) where status in ('pending', 'leased');
create index outbox_sequence on outbox_events(business_id, aggregate_id, sequence) where status <> 'delivered';

create table event_deliveries (
  business_id uuid not null references businesses(id) on delete cascade,
  event_id uuid not null,
  consumer text not null check (consumer ~ '^[a-z][a-z0-9._-]{1,79}$'),
  delivered_at timestamptz not null default now(),
  primary key (business_id, consumer, event_id),
  foreign key (business_id, event_id) references outbox_events(business_id, id)
);

create table idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  app_instance_id uuid not null,
  business_customer_id uuid not null,
  operation text not null check (operation ~ '^[a-z][a-z0-9._-]{1,79}$'),
  key text not null check (key ~ '^[A-Za-z0-9._:-]{1,128}$'),
  body_hash text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  response_status integer check (response_status between 200 and 599),
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  unique (business_id, id),
  unique (business_id, app_instance_id, business_customer_id, operation, key),
  foreign key (business_id, app_instance_id) references app_instances(business_id, id),
  foreign key (business_id, business_customer_id) references business_customers(business_id, id),
  check ((response_status is null) = (response_body is null)),
  check (expires_at = created_at + interval '24 hours')
);
create index idempotency_expiry on idempotency_keys(expires_at);

create table platform_outbox_events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type ~ '^[a-z][a-z0-9._-]{2,100}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 65536),
  status text not null default 'pending' check (status in ('pending', 'leased', 'delivered', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  lock_id uuid,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  check ((status = 'leased') = (locked_until is not null and lock_id is not null)),
  check ((status = 'delivered') = (delivered_at is not null))
);
create index platform_outbox_ready on platform_outbox_events(next_attempt_at, created_at)
  where status in ('pending', 'leased');
create table platform_event_deliveries (
  event_id uuid not null references platform_outbox_events(id),
  consumer text not null check (consumer ~ '^[a-z][a-z0-9._-]{1,79}$'),
  delivered_at timestamptz not null default now(),
  primary key (consumer, event_id)
);

create function protect_outbox_content() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Olay silinemez' using errcode = '23514';
  end if;
  if new.id <> old.id or new.type <> old.type or new.payload <> old.payload
    or new.created_at <> old.created_at then
    raise exception 'Olayın içeriği değiştirilemez' using errcode = '23514';
  end if;
  if tg_table_name = 'outbox_events' then
    if new.business_id <> old.business_id or new.aggregate_id <> old.aggregate_id
      or new.order_id is distinct from old.order_id or new.sequence <> old.sequence
    then raise exception 'Olayın bağlamı ve sırası değiştirilemez' using errcode = '23514'; end if;
  end if;
  if old.status = 'delivered' and new is distinct from old then
    raise exception 'Teslim edilmiş olay değiştirilemez' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger outbox_content_check before update or delete on outbox_events
  for each row execute function protect_outbox_content();
create trigger platform_outbox_content_check before update or delete on platform_outbox_events
  for each row execute function protect_outbox_content();

create function protect_delivery_record() returns trigger language plpgsql as $$
begin raise exception 'Teslim kaydı yalnızca eklenebilir' using errcode = '23514'; end $$;
create trigger event_delivery_append_only before update or delete on event_deliveries
  for each row execute function protect_delivery_record();
create trigger platform_delivery_append_only before update or delete on platform_event_deliveries
  for each row execute function protect_delivery_record();

create function protect_idempotency_response() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.business_id <> old.business_id or new.app_instance_id <> old.app_instance_id
    or new.business_customer_id <> old.business_customer_id or new.operation <> old.operation
    or new.key <> old.key or new.body_hash <> old.body_hash or new.created_at <> old.created_at
    or new.expires_at <> old.expires_at or old.response_status is not null then
    raise exception 'Tekrar korumasının yanıtı ve bağlamı değiştirilemez' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger idempotency_response_check before update on idempotency_keys
  for each row execute function protect_idempotency_response();

do $$
declare table_name text;
begin
  foreach table_name in array array['outbox_events', 'event_deliveries', 'idempotency_keys'] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format('create policy tenant_scope on %I using
      (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)
      with check (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)', table_name);
  end loop;
end $$;
-- Genel kuyruğu yalnızca açık platform yolu okur ve dağıtır; uygulama rolü sadece olay ekler.
revoke select, update, delete on platform_outbox_events, platform_event_deliveries from vado_app;

revoke all on platform_event_deliveries from vado_app;
