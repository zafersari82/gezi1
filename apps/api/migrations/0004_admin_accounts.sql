-- Yönetim panelinin hesapları, oturumları ve iki adımlı doğrulaması.
--
-- 2.3.1'e kadar panelde tek, paylaşılan bir kullanıcı adı ve şifre vardı; işlemi yapan kişi
-- kayıtlarda 'admin' olarak görünür. Bu dosyadan sonra her yönetici kendi hesabıyla girer ve
-- kayıtlara hesabın kimliği yazılır. Eski kayıtlar olduğu gibi kalır.

create table admin_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  display_name text not null,
  role text not null,
  status text not null default 'active',
  -- scrypt ile türetilmiş parola özeti; parametreleri ve tuzu özetin içinde yazılıdır.
  password_hash text not null,
  -- Parolayı başkası belirledi (ilk hesap, sıfırlama); hesap ilk girişte parolasını değiştirir.
  must_change_password boolean not null default true,
  password_changed_at timestamptz not null default now(),
  -- RFC 6238 sırrı (base32). Kurulum doğrulanana kadar totp_enabled_at boştur.
  totp_secret text,
  totp_enabled_at timestamptz,
  -- Kabul edilen son kodun zaman adımı: aynı kod (ve daha eskisi) ikinci kez kabul edilmez.
  totp_last_step bigint not null default 0,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_accounts_username_key unique (username),
  constraint admin_accounts_username_check check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  constraint admin_accounts_role_check
    check (role in ('owner', 'reviewer', 'operator', 'support', 'auditor')),
  constraint admin_accounts_status_check check (status in ('active', 'disabled')),
  constraint admin_accounts_totp_check check (totp_enabled_at is null or totp_secret is not null),
  constraint admin_accounts_failed_attempts_check check (failed_attempts >= 0)
);

-- Panel oturumu. Parola doğrulandığında 'second_factor' aşamasında açılır ve yalnızca ikinci
-- adım için kullanılabilir; ikinci adım geçilince belirteci değişir ve 'active' olur.
create table admin_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references admin_accounts (id) on delete cascade,
  -- Belirtecin SHA-256 özeti; belirtecin kendisi saklanmaz.
  token_hash text not null,
  stage text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Kesin bitiş; kullanılmayan oturum ayrıca last_seen_at'e göre kapanır.
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip text,
  user_agent text,
  constraint admin_sessions_token_key unique (token_hash),
  constraint admin_sessions_stage_check check (stage in ('second_factor', 'active'))
);

create index admin_sessions_account_idx on admin_sessions (account_id, last_seen_at desc);

-- Tek kullanımlık kurtarma kodları; yalnızca özetleri saklanır.
create table admin_recovery_codes (
  account_id uuid not null references admin_accounts (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (account_id, code_hash)
);

-- Son etkin sahip hesabı sahiplikten çıkarılamaz, kapatılamaz ve silinemez: hesapları yönetebilecek
-- kimse kalmazsa panelden geri dönülemez. Servis aynı kuralı sahiplerin satırlarını kilitleyerek
-- uygular; tetikleyici elle yazılmış bir SQL'e karşı da korur.
create function admin_accounts_owner_guard() returns trigger
language plpgsql as $$
begin
  if old.role = 'owner'
    and old.status = 'active'
    and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
    and not exists (
      select 1 from admin_accounts
      where role = 'owner' and status = 'active' and id <> old.id
    )
  then
    raise exception 'En az bir etkin sahip hesabı kalmalı: %', old.username;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger admin_accounts_owner_guard
  before update or delete on admin_accounts
  for each row execute function admin_accounts_owner_guard();
