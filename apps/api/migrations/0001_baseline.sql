-- VADO 2.0 temel şeması.
-- Şema değişiklikleri bu dosya düzenlenerek değil, sıradaki numarayla yeni dosya eklenerek yapılır.

-- ---------------------------------------------------------------------------
-- Kullanıcılar ve medya
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key default gen_random_uuid(),
  -- E.164 biçiminde; hesap silindiğinde boşaltılır, böylece numara yeniden kayıt olabilir.
  phone text unique,
  display_name text,
  username text unique,
  bio text not null default '',
  avatar_media_id uuid,
  discoverable_by_phone boolean not null default true,
  status text not null default 'active',
  terms_version text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_status_check check (status in ('active', 'suspended', 'deleted')),
  constraint users_username_check check (username ~ '^[a-z][a-z0-9_]{2,23}$')
);

create table media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users (id) on delete cascade,
  content_type text not null,
  byte_size integer not null,
  storage_key text not null unique,
  created_at timestamptz not null default now(),
  constraint media_content_type_check
    check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint media_byte_size_check check (byte_size > 0)
);

create index media_owner_idx on media (owner_id, created_at desc);

alter table users
  add constraint users_avatar_media_fk
  foreign key (avatar_media_id) references media (id) on delete set null;

-- Bir görselin hâlâ kullanılıp kullanılmadığı bu dizinle (ve aşağıdaki benzerleriyle) sorulur.
create index users_avatar_media_idx on users (avatar_media_id) where avatar_media_id is not null;

-- Bir kullanıcının başkalarına görünen özeti; sorgular kullanıcı bilgisini buradan alır.
create view user_refs as
select
  u.id,
  u.display_name,
  u.status,
  m.storage_key as avatar_key
from users u
left join media m on m.id = u.avatar_media_id;

-- ---------------------------------------------------------------------------
-- Kimlik doğrulama
-- ---------------------------------------------------------------------------

create table otp_challenges (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  request_ip text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index otp_challenges_phone_idx on otp_challenges (phone, created_at desc);
create index otp_challenges_ip_idx on otp_challenges (request_ip, created_at desc);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  -- Belirtecin kendisi saklanmaz; yalnızca SHA-256 özeti tutulur.
  token_hash text not null unique,
  device_name text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint sessions_platform_check check (platform in ('android', 'ios', 'web'))
);

create index sessions_user_idx on sessions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Kişiler
-- ---------------------------------------------------------------------------

-- Kişilik karşılıklıdır: her ilişki iki satırla (A→B ve B→A) tutulur.
create table contacts (
  user_id uuid not null references users (id) on delete cascade,
  contact_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_id),
  constraint contacts_not_self_check check (user_id <> contact_id)
);

-- Yalnızca bekleyen istekler tutulur; kabul, ret ve iptalde satır silinir.
create table contact_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references users (id) on delete cascade,
  to_user_id uuid not null references users (id) on delete cascade,
  message text not null default '',
  created_at timestamptz not null default now(),
  constraint contact_requests_pair_key unique (from_user_id, to_user_id),
  constraint contact_requests_not_self_check check (from_user_id <> to_user_id)
);

create index contact_requests_to_idx on contact_requests (to_user_id, created_at desc);

create table blocks (
  user_id uuid not null references users (id) on delete cascade,
  blocked_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  constraint blocks_not_self_check check (user_id <> blocked_id)
);

create index blocks_blocked_idx on blocks (blocked_id);

-- ---------------------------------------------------------------------------
-- Sohbet
-- ---------------------------------------------------------------------------

create table conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text,
  -- Birebir sohbette iki kullanıcı kimliğinin sıralı birleşimi; aynı çift için ikinci sohbet açılamaz.
  direct_key text unique,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint conversations_kind_check check (kind in ('direct', 'group')),
  constraint conversations_shape_check check (
    (kind = 'direct' and direct_key is not null and title is null)
    or (kind = 'group' and direct_key is null and title is not null)
  )
);

create table conversation_members (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null default 'member',
  last_read_seq bigint not null default 0,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  constraint conversation_members_role_check check (role in ('owner', 'member'))
);

create index conversation_members_user_idx on conversation_members (user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  -- Tüm sohbetlerde ortak artan sıra numarası; sıralama, sayfalama ve okundu bilgisi buna dayanır.
  seq bigint generated always as identity unique,
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid references users (id) on delete set null,
  kind text not null,
  body text not null default '',
  -- Sistem mesajının anlattığı olay. Metin saklanmaz; okunurken kullanıcıların güncel adlarıyla üretilir.
  system_event jsonb,
  media_id uuid references media (id) on delete set null,
  client_id text,
  created_at timestamptz not null default now(),
  constraint messages_kind_check check (kind in ('text', 'image', 'system')),
  constraint messages_system_event_check check ((kind = 'system') = (system_event is not null)),
  constraint messages_client_key unique (sender_id, client_id)
);

create index messages_conversation_idx on messages (conversation_id, seq desc);
create index messages_media_idx on messages (media_id) where media_id is not null;

-- ---------------------------------------------------------------------------
-- Anlar
-- ---------------------------------------------------------------------------

create table moments (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  author_id uuid not null references users (id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now()
);

create index moments_author_idx on moments (author_id, seq desc);

create table moment_media (
  moment_id uuid not null references moments (id) on delete cascade,
  position smallint not null,
  media_id uuid not null references media (id) on delete cascade,
  primary key (moment_id, position)
);

create index moment_media_media_idx on moment_media (media_id);

create table moment_likes (
  moment_id uuid not null references moments (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (moment_id, user_id)
);

create table moment_comments (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references moments (id) on delete cascade,
  author_id uuid not null references users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index moment_comments_moment_idx on moment_comments (moment_id, created_at);

-- ---------------------------------------------------------------------------
-- İşletmeler ve mini uygulamalar
-- ---------------------------------------------------------------------------

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users (id) on delete restrict,
  name text not null,
  slug text not null unique,
  category text not null,
  description text not null default '',
  city text not null,
  tax_number text,
  verified boolean not null default false,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_status_check check (status in ('pending', 'active', 'suspended'))
);

create index businesses_owner_idx on businesses (owner_id);
create index businesses_listing_idx on businesses (status, verified, name);

create table mini_apps (
  id text primary key,
  name text not null,
  description text not null,
  icon_url text,
  entry_url text not null,
  allowed_origins text[] not null,
  capabilities text[] not null default '{}',
  version text not null,
  category text not null,
  developer_name text not null,
  -- Kullanıcılar yalnızca hem doğrulanmış hem de açık olan mini uygulamaları görür.
  verified boolean not null default false,
  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mini_apps_listing_idx on mini_apps (enabled, verified, sort_order, name);

-- Bir satıcının bir mini uygulama üzerinden ödeme alabilmesi için gereken eşleştirme.
create table mini_app_merchants (
  mini_app_id text not null references mini_apps (id) on delete cascade,
  merchant_id text not null,
  display_name text not null,
  business_id uuid references businesses (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (mini_app_id, merchant_id)
);

create index mini_app_merchants_business_idx on mini_app_merchants (business_id);

-- ---------------------------------------------------------------------------
-- Ödemeler
-- ---------------------------------------------------------------------------

-- Kart verisi hiçbir zaman burada tutulmaz; yalnızca ödeme oturumunun kaydıdır.
create table payments (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  user_id uuid not null references users (id) on delete restrict,
  mini_app_id text not null,
  merchant_id text not null,
  order_id text not null,
  description text not null,
  amount_minor integer not null,
  currency text not null default 'TRY',
  status text not null default 'created',
  provider text not null,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint payments_merchant_fk
    foreign key (mini_app_id, merchant_id)
    references mini_app_merchants (mini_app_id, merchant_id) on delete restrict,
  -- Aynı sipariş için ikinci ödeme oturumu açılamaz.
  constraint payments_order_key unique (user_id, mini_app_id, merchant_id, order_id),
  constraint payments_amount_check check (amount_minor > 0),
  constraint payments_currency_check check (currency = 'TRY'),
  constraint payments_status_check check (status in ('created', 'paid', 'cancelled'))
);

create index payments_user_idx on payments (user_id, seq desc);

-- ---------------------------------------------------------------------------
-- Şikayetler ve denetim kaydı
-- ---------------------------------------------------------------------------

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users (id) on delete cascade,
  target_type text not null,
  target_id text not null,
  reason text not null,
  note text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reports_status_check check (status in ('open', 'resolved'))
);

create index reports_status_idx on reports (status, created_at desc);

create table audit_log (
  id bigint generated always as identity primary key,
  -- 'admin' (yönetim paneli) veya işlemi yapan kullanıcının kimliği.
  actor text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
