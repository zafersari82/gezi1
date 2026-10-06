-- Business biletinin kendisi saklanmaz; 60 saniyelik özet tek kez tüketilir.
alter table sessions add constraint sessions_user_id_unique unique(user_id,id);
create table business_socket_tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null,
  session_id uuid not null,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '60 seconds',
  used_at timestamptz,
  foreign key(business_id,user_id) references business_members(business_id,user_id) on delete cascade,
  foreign key(user_id,session_id) references sessions(user_id,id) on delete cascade,
  check(expires_at>created_at and expires_at<=created_at+interval '60 seconds')
);
create index business_socket_tickets_expiry on business_socket_tickets(expires_at);
alter table business_socket_tickets enable row level security;
alter table business_socket_tickets force row level security;
create policy tenant_scope on business_socket_tickets
  using(business_id=nullif(current_setting('vado.business_id',true),'')::uuid)
  with check(business_id=nullif(current_setting('vado.business_id',true),'')::uuid);

create function check_business_socket_ticket() returns trigger language plpgsql as $$
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.business_id<>old.business_id or new.user_id<>old.user_id
      or new.session_id<>old.session_id or new.token_hash<>old.token_hash
      or new.created_at<>old.created_at or new.expires_at<>old.expires_at
      or old.used_at is not null or new.used_at is null then
      raise exception 'Biletin kimliği ve süresi değişmez; yalnızca bir kez tüketilir' using errcode='23514';
    end if;
  else
    if new.created_at>statement_timestamp()+interval '1 second' or new.used_at is not null then
      raise exception 'Bilet geleceğe taşınamaz ve tüketilmiş doğamaz' using errcode='23514';
    end if;
    perform 1 from users where id=new.user_id and status='active' for share;
    if not found then raise exception 'Bilet etkin kullanıcıya bağlı olmalıdır' using errcode='23514'; end if;
    perform 1 from business_members where business_id=new.business_id and user_id=new.user_id and active for share;
    if not found then raise exception 'Bilet etkin işletme üyeliğine bağlı olmalıdır' using errcode='23503'; end if;
    perform 1 from sessions where id=new.session_id and user_id=new.user_id and revoked_at is null and expires_at>now() for share;
    if not found then raise exception 'Bilet etkin oturuma bağlı olmalıdır' using errcode='23503'; end if;
  end if;
  return new;
end $$;
create trigger business_socket_ticket_check before insert or update on business_socket_tickets
  for each row execute function check_business_socket_ticket();
