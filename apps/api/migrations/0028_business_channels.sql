-- VADO Business Channels: işletme duyurularını açıkça takip etmeyi sağlar.
-- Kişisel Anlar'dan bağımsızdır; takip otomatik toplu SMS/push izni vermez.

create table business_channel_follows (
  user_id uuid not null references users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (user_id, business_id)
);
create index business_channel_follows_business on business_channel_follows (business_id);

alter table business_channel_follows enable row level security;
alter table business_channel_follows force row level security;
create policy channel_follow_select on business_channel_follows for select
  using (user_id = nullif(current_setting('vado.user_id', true), '')::uuid);
create policy channel_follow_insert on business_channel_follows for insert
  with check (user_id = nullif(current_setting('vado.user_id', true), '')::uuid);
create policy channel_follow_delete on business_channel_follows for delete
  using (user_id = nullif(current_setting('vado.user_id', true), '')::uuid);
revoke update on business_channel_follows from vado_app;

create table business_channel_posts (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  business_id uuid not null references businesses(id) on delete cascade,
  created_by uuid not null references users(id),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  status text not null default 'published' check (status in ('published', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (business_id, id)
);
create index business_channel_posts_visible on business_channel_posts (business_id, seq desc)
  where status = 'published';

alter table business_channel_posts enable row level security;
alter table business_channel_posts force row level security;
-- Kamu yalnız etkin/doğrulanmış işletmenin yayımlanmış duyurusunu okuyabilir.
-- İşletme yöneticisi, duyuruyu geri çekmek için kendi kayıtlarına da erişebilir.
create policy channel_posts_select on business_channel_posts for select using (
  (status = 'published' and exists (
    select 1 from businesses b join users u on u.id = b.owner_id
    where b.id = business_channel_posts.business_id and b.status = 'active' and b.verified and u.status = 'active'
  ))
  or (business_id = nullif(current_setting('vado.business_id', true), '')::uuid
    and exists (
      select 1 from business_members m
      where m.business_id = business_channel_posts.business_id and m.user_id = nullif(current_setting('vado.user_id', true), '')::uuid
        and m.role in ('owner', 'manager') and m.active
    ))
);
create policy channel_posts_insert on business_channel_posts for insert with check (
  status = 'published'
  and created_by = nullif(current_setting('vado.user_id', true), '')::uuid
  and business_id = nullif(current_setting('vado.business_id', true), '')::uuid
  and exists (select 1 from businesses b join users owner on owner.id = b.owner_id
    where b.id = business_channel_posts.business_id and b.status = 'active'
      and b.verified and owner.status = 'active')
  and exists (select 1 from business_members m
    where m.business_id = business_channel_posts.business_id and m.user_id = created_by
      and m.role in ('owner', 'manager') and m.active)
);
create policy channel_posts_update on business_channel_posts for update
  using (
    business_id = nullif(current_setting('vado.business_id', true), '')::uuid
    and exists (select 1 from business_members m
      where m.business_id = business_channel_posts.business_id and m.user_id = nullif(current_setting('vado.user_id', true), '')::uuid
      and m.role in ('owner', 'manager') and m.active)
  )
  with check (business_id = nullif(current_setting('vado.business_id', true), '')::uuid);

-- Oluşturanın kimliği ve metnin geçmişi değiştirilemez; yalnız geri çekme mümkündür.
create function protect_channel_post() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.seq <> old.seq or new.business_id <> old.business_id
    or new.created_by <> old.created_by or new.body <> old.body
    or new.created_at <> old.created_at or old.status <> 'published'
    or new.status <> 'withdrawn'
  then
    raise exception 'Duyuru yalnız geri çekilebilir' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger channel_post_guard before update on business_channel_posts
  for each row execute function protect_channel_post();
revoke delete on business_channel_posts from vado_app;
