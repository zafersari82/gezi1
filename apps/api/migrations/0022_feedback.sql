-- Değerlendirme ve favori platformları sektör paketlerinden bağımsızdır.
create table reviews (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),order_id uuid not null,business_customer_id uuid not null,
 seq bigint generated always as identity unique,rating integer not null check(rating between 1 and 5),comment text not null check(length(comment)<=1000),reply text check(length(reply) between 1 and 1000),
 visibility text not null default 'published' check(visibility in ('published','hidden')),version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,id),unique(business_id,order_id),foreign key(business_id,order_id) references orders(business_id,id),foreign key(business_id,business_customer_id) references business_customers(business_id,id)
);
alter table reviews enable row level security;alter table reviews force row level security;
create policy review_read on reviews for select using(business_id=nullif(current_setting('vado.business_id',true),'')::uuid and location_business_reader(business_id) and (visibility='published' or location_business_writer(business_id) or incentive_customer_actor(business_id,business_customer_id)));
create policy review_insert on reviews for insert with check(incentive_customer_actor(business_id,business_customer_id));
create policy review_edit on reviews for update using(incentive_customer_actor(business_id,business_customer_id) or location_business_writer(business_id)) with check(incentive_customer_actor(business_id,business_customer_id) or location_business_writer(business_id));
create function protect_review() returns trigger language plpgsql as $$ begin
 if tg_op='INSERT' then
  if new.version<>1 or new.visibility<>'published' or new.reply is not null or not incentive_customer_actor(new.business_id,new.business_customer_id) or not exists(select 1 from orders where business_id=new.business_id and id=new.order_id and business_customer_id=new.business_customer_id and status='completed') then raise exception 'Değerlendirme yalnız kendi tamamlanmış siparişine yapılır' using errcode='23514';end if;
 else
  if new.id<>old.id or new.business_id<>old.business_id or new.order_id<>old.order_id or new.business_customer_id<>old.business_customer_id or new.created_at<>old.created_at or new.seq<>old.seq or new.version<>old.version+1 then raise exception 'Değerlendirme bağlamı değişmez' using errcode='23514';end if;
  if new.rating<>old.rating or new.comment<>old.comment then
   if not incentive_customer_actor(new.business_id,new.business_customer_id) then raise exception 'Yalnız müşteri değerlendirmesini düzenler' using errcode='23514';end if;
  end if;
  if new.reply is distinct from old.reply then
   if not location_business_writer(new.business_id) then raise exception 'Yalnız sahip veya yönetici cevap verir' using errcode='23514';end if;
  end if;
  if new.visibility<>old.visibility and current_user not in ('vado_platform','vado_owner') then raise exception 'Yayın durumu yalnız moderasyonla değişir' using errcode='23514';end if;
  new.updated_at:=now();
 end if;return new;
end $$;
create trigger review_guard before insert or update on reviews for each row execute function protect_review();
create trigger review_no_delete before delete on reviews for each row execute function protect_delivery_record();
create table user_favorites (
 id uuid primary key default gen_random_uuid(),seq bigint generated always as identity,user_id uuid not null references users(id),business_id uuid not null references businesses(id),item_id uuid,value boolean not null,version integer not null default 1 check(version>0),
 unique nulls not distinct(user_id,business_id,item_id),foreign key(business_id,item_id) references catalog_items(business_id,id)
);
alter table user_favorites enable row level security;alter table user_favorites force row level security;
create policy favorite_owner on user_favorites using(user_id=nullif(current_setting('vado.user_id',true),'')::uuid and exists(select 1 from users where id=user_id and status='active')) with check(user_id=nullif(current_setting('vado.user_id',true),'')::uuid and location_business_reader(business_id));
create function protect_favorite() returns trigger language plpgsql as $$ begin
 if tg_op='INSERT' and new.version<>1 or tg_op='UPDATE' and (new.id<>old.id or new.user_id<>old.user_id or new.business_id<>old.business_id or new.item_id is distinct from old.item_id or new.seq<>old.seq or new.version<>old.version+1) then raise exception 'Favori bağlamı ve sürümü korunmalıdır' using errcode='23514';end if;return new;
end $$;
create trigger favorite_guard before insert or update on user_favorites for each row execute function protect_favorite();
create trigger favorite_no_delete before delete on user_favorites for each row execute function protect_delivery_record();
alter table reports add constraint reports_target_type_check check(target_type in ('user','message','moment','miniapp','business','review'));
