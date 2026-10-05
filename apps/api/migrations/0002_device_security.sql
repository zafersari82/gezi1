-- Cihaz tanıma ve hassas işlemlerden önce yeniden doğrulama.

alter table sessions
  -- Uygulamanın o kuruluma özel ürettiği rastgele kimlik; aynı cihazdan yeniden girişte değişmez.
  add column device_id text,
  -- Hesabın daha önce giriş yapmadığı bir cihazdan açıldı.
  add column new_device boolean not null default false,
  add column created_ip text,
  add column last_ip text,
  -- Kimliğin en son kanıtlandığı an: giriş kodu, cihaz anahtarı ya da yeniden doğrulama kodu.
  add column verified_at timestamptz,
  -- Cihazda saklanan anahtarın SHA-256 özeti; anahtarın kendisi saklanmaz.
  add column device_key_hash text;

create index sessions_device_idx on sessions (user_id, device_id);

alter table otp_challenges
  -- login: giriş kodu. verify: açık oturumda hassas işlemden önce istenen kod.
  -- Biri diğerinin yerine kullanılamaz.
  add column purpose text not null default 'login',
  add constraint otp_challenges_purpose_check check (purpose in ('login', 'verify'));
