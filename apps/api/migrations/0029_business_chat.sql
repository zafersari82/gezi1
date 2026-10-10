-- VADO Business Chat S2: kişisel sohbet ile aynı conversations/messages çekirdeği.
-- İşletme çalışanları kişisel sohbet üyesi yapılmaz; erişim güncel işletme üyeliğinden hesaplanır.
alter table conversations drop constraint conversations_kind_check;
alter table conversations add constraint conversations_kind_check
  check (kind in ('direct', 'group', 'business'));
alter table conversations drop constraint conversations_shape_check;
alter table conversations add constraint conversations_shape_check check (
  (kind = 'direct' and direct_key is not null and title is null)
  or (kind in ('group', 'business') and direct_key is null and title is not null)
);

create table business_chat_threads (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references users(id) on delete cascade,
  last_business_read_seq bigint not null default 0 check (last_business_read_seq >= 0),
  created_at timestamptz not null default now(),
  constraint business_chat_customer_unique unique (business_id, customer_id)
);
create index business_chat_threads_inbox on business_chat_threads(business_id, created_at desc);

-- Thread ilişkisi sonradan değiştirilemez; müşteri ve konuşma kimliği birbirine bağlıdır.
create function validate_business_chat_thread() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.conversation_id <> old.conversation_id
    or new.business_id <> old.business_id or new.customer_id <> old.customer_id
    or new.created_at <> old.created_at) then
    raise exception 'İşletme sohbeti değiştirilemez' using errcode='23514';
  end if;
  if not exists (select 1 from conversations c where c.id=new.conversation_id
    and c.kind='business' and c.created_by=new.customer_id) then
    raise exception 'İşletme sohbeti geçersiz' using errcode='23514';
  end if;
  return new;
end $$;
create trigger business_chat_thread_guard before insert or update on business_chat_threads
  for each row execute function validate_business_chat_thread();

alter table business_chat_threads enable row level security;
alter table business_chat_threads force row level security;
create policy business_chat_thread_read on business_chat_threads for select using (
  customer_id = nullif(current_setting('vado.user_id',true),'')::uuid
  or (business_id = nullif(current_setting('vado.business_id',true),'')::uuid
    and exists (select 1 from business_members m join users u on u.id=m.user_id
      where m.business_id=business_chat_threads.business_id
        and m.user_id=nullif(current_setting('vado.user_id',true),'')::uuid
        and m.active and m.role in ('owner','manager') and u.status='active'))
);
create policy business_chat_thread_insert on business_chat_threads for insert with check (
  customer_id = nullif(current_setting('vado.user_id',true),'')::uuid
  and exists(select 1 from businesses b join users owner on owner.id=b.owner_id
    where b.id=business_chat_threads.business_id and b.status='active'
      and b.verified and owner.status='active')
);
create policy business_chat_thread_read_state on business_chat_threads for update using (
  business_id = nullif(current_setting('vado.business_id',true),'')::uuid
  and exists(select 1 from business_members m where m.business_id=business_chat_threads.business_id
    and m.user_id=nullif(current_setting('vado.user_id',true),'')::uuid and m.active
    and m.role in ('owner','manager'))
) with check (business_id = nullif(current_setting('vado.business_id',true),'')::uuid);
revoke delete on business_chat_threads from vado_app;
