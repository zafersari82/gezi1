-- Değerlendirme ve favoriler platform servisleridir; hiçbir sektör paketine bağlı değildir.

-- Kalıcı kayıtlar silinmez (değerlendirme, iade talebi gibi).
create function vado_no_delete() returns trigger language plpgsql as $$
begin
  raise exception 'Bu kayıt silinemez' using errcode = '23514';
end $$;

-- Oturumdaki kullanıcı, bu işletmedeki bu müşteri kaydının sahibi mi?
create function tenant_customer_actor(for_business uuid, for_customer uuid)
returns boolean language sql stable as $$
  select for_business = nullif(current_setting('vado.business_id', true), '')::uuid
    and exists (
      select 1
      from business_customers c
      join users u on u.id = c.user_id and u.status = 'active'
      where c.business_id = for_business
        and c.id = for_customer
        and c.user_id = nullif(current_setting('vado.user_id', true), '')::uuid
    )
$$;

-- Değerlendirme yalnız müşterinin kendi tamamlanmış siparişine, sipariş başına bir kez yapılır.
-- Şube, siparişin şubesidir; şube kapsamlı "değerlendirmelere yanıt" izni buna göre çözülür.
create table reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  branch_id uuid not null,
  order_id uuid not null,
  business_customer_id uuid not null,
  seq bigint generated always as identity unique,
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) <= 1000),
  reply text check (char_length(reply) between 1 and 1000),
  visibility text not null default 'published' check (visibility in ('published', 'hidden')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, order_id),
  foreign key (business_id, order_id) references orders (business_id, id),
  foreign key (business_id, branch_id) references branches (business_id, id),
  foreign key (business_id, business_customer_id) references business_customers (business_id, id)
);
create index reviews_published on reviews (business_id, seq desc) where visibility = 'published';

alter table reviews enable row level security;
alter table reviews force row level security;
create policy review_read on reviews for select using (
  business_id = nullif(current_setting('vado.business_id', true), '')::uuid
  and (
    visibility = 'published'
    or tenant_member_can(business_id, 'reviews.reply', branch_id)
    or tenant_customer_actor(business_id, business_customer_id)
  )
);
create policy review_insert on reviews for insert
  with check (tenant_customer_actor(business_id, business_customer_id));
create policy review_update on reviews for update
  using (
    tenant_customer_actor(business_id, business_customer_id)
    or tenant_member_can(business_id, 'reviews.reply', branch_id)
  )
  with check (
    tenant_customer_actor(business_id, business_customer_id)
    or tenant_member_can(business_id, 'reviews.reply', branch_id)
  );
create policy courier_denied on reviews as restrictive
  using (current_user = 'vado_owner' or not courier_actor(business_id))
  with check (current_user = 'vado_owner' or not courier_actor(business_id));

create function protect_review() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.version <> 1 or new.visibility <> 'published' or new.reply is not null
      or not tenant_customer_actor(new.business_id, new.business_customer_id)
      or not exists (
        select 1 from orders
        where business_id = new.business_id and id = new.order_id and branch_id = new.branch_id
          and business_customer_id = new.business_customer_id and status = 'completed'
      )
    then
      raise exception 'Değerlendirme yalnız kendi tamamlanmış siparişine yapılır' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.id <> old.id or new.business_id <> old.business_id or new.branch_id <> old.branch_id
    or new.order_id <> old.order_id or new.business_customer_id <> old.business_customer_id
    or new.created_at <> old.created_at or new.version <> old.version + 1
  then
    raise exception 'Değerlendirmenin bağlamı değişmez' using errcode = '23514';
  end if;
  if (new.rating <> old.rating or new.comment <> old.comment)
    and not tenant_customer_actor(new.business_id, new.business_customer_id)
  then
    raise exception 'Değerlendirmeyi yalnız müşteri düzenler' using errcode = '23514';
  end if;
  if new.reply is distinct from old.reply
    and not tenant_member_can(new.business_id, 'reviews.reply', new.branch_id)
  then
    raise exception 'Yanıtı yalnız yetkili işletme üyesi yazar' using errcode = '23514';
  end if;
  if new.visibility <> old.visibility and current_user not in ('vado_platform', 'vado_owner') then
    raise exception 'Yayın durumu yalnız VADO moderasyonuyla değişir' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger review_guard before insert or update on reviews
  for each row execute function protect_review();
create trigger review_no_delete before delete on reviews
  for each row execute function vado_no_delete();

-- Kişisel favoriler: işletme ya da ürün. Kayıt kullanıcınındır; işletme göremez.
-- `value = false` favoriden çıkarmadır; satır kalır, sürüm başka cihazın kaydını ezmeyi önler.
create table user_favorites (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  user_id uuid not null references users (id),
  business_id uuid not null references businesses (id),
  item_id uuid,
  value boolean not null,
  version integer not null default 1 check (version > 0),
  unique nulls not distinct (user_id, business_id, item_id),
  foreign key (business_id, item_id) references catalog_items (business_id, id)
);
create index user_favorites_user on user_favorites (user_id, seq desc) where value;

alter table user_favorites enable row level security;
alter table user_favorites force row level security;
create policy favorite_owner on user_favorites
  using (
    user_id = nullif(current_setting('vado.user_id', true), '')::uuid
    and exists (select 1 from users where id = user_id and status = 'active')
  )
  with check (
    user_id = nullif(current_setting('vado.user_id', true), '')::uuid
    and business_id = nullif(current_setting('vado.business_id', true), '')::uuid
  );

create function protect_favorite() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.version <> 1
    or tg_op = 'UPDATE' and (
      new.id <> old.id or new.user_id <> old.user_id or new.business_id <> old.business_id
      or new.item_id is distinct from old.item_id or new.version <> old.version + 1
    )
  then
    raise exception 'Favorinin bağlamı ve sürümü korunmalıdır' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger favorite_guard before insert or update on user_favorites
  for each row execute function protect_favorite();
create trigger favorite_no_delete before delete on user_favorites
  for each row execute function vado_no_delete();

-- Şikâyet edilebilen kayıt türleri; değerlendirme moderasyonu var olan şikâyet akışından geçer.
alter table reports add constraint reports_target_type check (
  target_type in ('user', 'message', 'moment', 'miniapp', 'business', 'review')
);
