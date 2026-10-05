-- Anlık bildirimler (2.5): cihazların bildirim adresleri ve kullanıcının bildirim ayarları.
--
-- Bildirim adresi (Expo push belirteci) bir oturuma bağlıdır: oturum kapanınca o cihaza bildirim
-- gitmez. Adres VADO'nun değil telefonun işletim sisteminin ürettiği bir değerdir; gizli değildir
-- ama başka bir hesaba bildirim göndermeye yaramasın diye yalnızca sahibinin oturumunda durur.

create table push_tokens (
  session_id uuid primary key references sessions (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Aynı cihaz adresi tek bir oturumda durur; cihazda başka hesapla giriş yapılınca adres yeni
  -- oturuma taşınır, önceki hesabın bildirimleri o cihaza gitmez.
  constraint push_tokens_token_key unique (token),
  constraint push_tokens_token_check
    check (token ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{1,200}\]$')
);

create index push_tokens_user_idx on push_tokens (user_id);

-- Oturumun sahibi dışında bir kullanıcıya adres yazılamaz.
create function push_tokens_owner_guard() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from sessions s
    where s.id = new.session_id and s.user_id = new.user_id and s.revoked_at is null
  ) then
    raise exception 'Bildirim adresi açık ve kullanıcıya ait bir oturuma bağlanmalı: %', new.session_id;
  end if;
  return new;
end;
$$;

create trigger push_tokens_owner_guard
  before insert or update on push_tokens
  for each row execute function push_tokens_owner_guard();

-- Oturum kapatılınca (çıkış, uzaktan kapatma, hesabın askıya alınması) adresi de silinir.
create function sessions_revoke_push_tokens() returns trigger
language plpgsql as $$
begin
  delete from push_tokens where session_id = new.id;
  return new;
end;
$$;

create trigger sessions_revoke_push_tokens
  after update of revoked_at on sessions
  for each row when (old.revoked_at is null and new.revoked_at is not null)
  execute function sessions_revoke_push_tokens();

-- Bildirim ayarları. Mesaj bildirimleri açık başlar; mesajın içeriği (gönderen ve metin) kilit
-- ekranında görünmesin diye önizleme kapalı başlar. Yeni cihaz bildirimi güvenlik içindir ve
-- kapatılamaz.
alter table users
  add column push_messages boolean not null default true,
  add column push_preview boolean not null default false;
