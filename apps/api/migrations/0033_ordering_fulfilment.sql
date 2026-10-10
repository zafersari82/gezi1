-- Teslim biçimi, sipariş bağlamı, tahsilat yeri ve canlı olay türü kayıtları (2.8, A2).
--
-- Çekirdek bunların hiçbirinin adını bilmez. Sepet ve sipariş bir bağlama (tür + kimlik) bağlanabilir;
-- masa oturumu bunun bir türüdür. Bağlamın varlığını ve kuralını, onu kaydeden paket denetler.
-- Paketlerin satırları ve önceki sürümlerden kalan verinin taşınması 0034'tedir.

-- Paket davranış beyanları.
alter table capability_catalog
  -- Açıkken teslim biçimleri yalnız paketlerle açılır; çekirdeğin varsayılan biçimi kapanır.
  add column explicit_modes boolean not null default false,
  -- Açıkken sipariş yalnız şube açıkken verilir.
  add column opening_hours boolean not null default false,
  -- Açıkken kabulde hazırlık süresi, retde gerekçe zorunludur.
  add column decision_required boolean not null default false;

create table ordering_context_kinds (
  kind text primary key check (kind ~ '^[a-z][a-z_]{1,30}$'),
  capability_id text not null,
  capability_version text not null,
  foreign key (capability_id, capability_version) references capability_catalog (id, version)
);

create table ordering_fulfilment_modes (
  code text primary key check (code ~ '^[a-z][a-z_]{1,30}$'),
  -- Biçimi açan paket.
  capability_id text,
  capability_version text,
  -- Açık biçim yöneten paket yokken de geçerli olan çekirdek varsayılanı mı?
  core_default boolean not null default false,
  -- Biçimin istediği bağlam türü; boşsa bağlam alınmaz.
  context_kind text references ordering_context_kinds (kind),
  requires_address boolean not null default false,
  -- Tahsilatın kaydedilebileceği yerler.
  payment_places text[] not null check (
    cardinality(payment_places) between 1 and 10
    and array_to_string(payment_places, ',') ~ '^[a-z][a-z_]{1,30}(,[a-z][a-z_]{1,30})*$'
  ),
  -- Paketin ek kuralı:
  -- (business, instance, branch, scheduled, context_id, customer, capabilities) → boolean.
  validator regprocedure,
  foreign key (capability_id, capability_version) references capability_catalog (id, version),
  check ((capability_id is null) = (capability_version is null)),
  check (capability_id is not null or core_default)
);

create table live_event_types (
  type text primary key check (type ~ '^[a-z][a-z0-9._-]{2,100}$'),
  -- Sipariş olayı değilse olayın şubesini, örneğini, müşterisini ve bağlamını kaynağından
  -- çözen paket işlevi: (business uuid, aggregate uuid) → tek satır.
  resolver regprocedure
);
insert into live_event_types (type) values
  ('order.placed'), ('order.status_changed'), ('order.payment_recorded');

revoke insert, update, delete, truncate
  on ordering_context_kinds, ordering_fulfilment_modes, live_event_types
  from vado_app, vado_platform;

-- Sepet ve sipariş bağlamı. Eski masa oturumu sütunu bağlam kimliğine dönüşür; türü 0034 yazar.
alter table carts drop constraint cart_restaurant_context;
alter table carts drop constraint cart_table_fk;
alter table carts drop constraint cart_address_pair;
alter table carts drop constraint carts_fulfilment_check;
alter table carts rename column table_session_id to context_id;
alter table carts add column context_kind text;
alter table carts
  add constraint cart_context_pair check ((context_kind is null) = (context_id is null)) not valid,
  add constraint cart_context_kind foreign key (context_kind)
    references ordering_context_kinds (kind) not valid,
  add constraint cart_fulfilment_mode foreign key (fulfilment)
    references ordering_fulfilment_modes (code) not valid;

alter table orders drop constraint order_restaurant_context;
alter table orders drop constraint order_table_fk;
alter table orders drop constraint orders_fulfilment_check;
alter table orders rename column table_session_id to context_id;
alter table orders add column context_kind text;
alter table orders
  add constraint order_context_pair check ((context_kind is null) = (context_id is null)) not valid,
  add constraint order_context_kind foreign key (context_kind)
    references ordering_context_kinds (kind) not valid,
  add constraint order_fulfilment_mode foreign key (fulfilment)
    references ordering_fulfilment_modes (code) not valid;

alter table order_payments drop constraint order_payments_place_check;
alter table order_payments
  add constraint order_payment_place_format check (place ~ '^[a-z][a-z_]{1,30}$');

alter table business_live_events drop constraint business_live_events_type_check;
alter table business_live_events drop constraint business_live_events_business_id_table_session_id_fkey;
alter table business_live_events rename column table_session_id to context_id;
alter table business_live_events add column context_kind text;
alter table business_live_events
  add constraint live_event_context_pair check ((context_kind is null) = (context_id is null)) not valid,
  add constraint live_event_context_kind foreign key (context_kind)
    references ordering_context_kinds (kind) not valid,
  add constraint live_event_type_known foreign key (type)
    references live_event_types (type) not valid;

-- Teslim biçimi bu uygulama örneğinde, bu bağlam ve adresle mümkün mü? Siparişin verildiği anda
-- (`at_checkout`) paketler şubenin açık olmasını da isteyebilir.
-- Sonuç: 'ok', 'unavailable' (biçim, bağlam ya da saat geçersiz) ya da 'closed' (şube kapalı).
create function ordering_fulfilment_status(
  business uuid, instance uuid, branch uuid, mode text, scheduled timestamptz,
  context_kind text, context_id uuid, customer uuid, address uuid, at_checkout boolean
) returns text language plpgsql set search_path = pg_catalog, public as $$
declare
  chosen ordering_fulfilment_modes;
  capabilities jsonb;
  allowed boolean;
begin
  capabilities := ordering_capabilities_for_instance(business, instance);
  if at_checkout and exists (
    select 1 from capability_catalog c
    where c.opening_hours and capabilities ? (c.id || '@' || c.version)
  ) and not branch_is_open(business, branch, now())
  then
    return 'closed';
  end if;
  select * into chosen from ordering_fulfilment_modes where code = mode;
  if not found then
    return 'unavailable';
  end if;
  if not (
    (chosen.capability_id is not null
      and capabilities ? (chosen.capability_id || '@' || chosen.capability_version))
    or (chosen.core_default and not exists (
      select 1 from capability_catalog c
      where c.explicit_modes and capabilities ? (c.id || '@' || c.version)
    ))
  ) then
    return 'unavailable';
  end if;
  if context_kind is distinct from chosen.context_kind
    or (context_kind is null) <> (context_id is null)
    or (address is not null) <> chosen.requires_address
  then
    return 'unavailable';
  end if;
  if chosen.validator is not null then
    execute format('select %s($1, $2, $3, $4, $5, $6, $7)', chosen.validator::regproc)
      into allowed using business, instance, branch, scheduled, context_id, customer, capabilities;
    if not coalesce(allowed, false) then
      return 'unavailable';
    end if;
  end if;
  return 'ok';
end $$;

-- Açık sepet her değişiklikte teslim biçimine göre yeniden denetlenir.
create function check_cart_fulfilment() returns trigger language plpgsql as $$
begin
  if new.status = 'open' and ordering_fulfilment_status(
    new.business_id, new.app_instance_id, new.branch_id, new.fulfilment, new.scheduled_at,
    new.context_kind, new.context_id, new.business_customer_id, new.address_id, false
  ) <> 'ok' then
    raise exception 'Teslim biçimi, bağlam ya da teslim saati geçersiz' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger restaurant_cart_check on carts;
drop function protect_restaurant_cart();
create trigger cart_fulfilment_check before insert or update on carts
  for each row execute function check_cart_fulfilment();

-- Siparişin bağlamı ve teslim saati sepetten gelir ve değişmez. Tahsilatı olan sipariş, tutarın
-- tamamı geri verilmeden iptal edilemez; reddedilemez. Karar bilgisi bir kez eklenir.
create function protect_order_context() returns trigger language plpgsql as $$
declare
  source carts;
begin
  if tg_op = 'INSERT' then
    select * into source from carts where business_id = new.business_id and id = new.cart_id;
    if new.context_kind is distinct from source.context_kind
      or new.context_id is distinct from source.context_id
      or new.scheduled_at is distinct from source.scheduled_at
      or ordering_fulfilment_status(
        new.business_id, new.app_instance_id, new.branch_id, new.fulfilment, new.scheduled_at,
        new.context_kind, new.context_id, new.business_customer_id, source.address_id, true
      ) <> 'ok'
      or new.preparation_minutes is not null or new.rejection_reason is not null
    then
      raise exception 'Sipariş bağlamı açık şubeden ve sepetten alınmalıdır' using errcode = '23514';
    end if;
    return new;
  end if;

  if (new.status = 'rejected' and exists (
      select 1 from order_payments where business_id = new.business_id and order_id = new.id
    ))
    or (new.status = 'cancelled' and
      (select coalesce(sum(amount_minor), 0) from order_payments
        where business_id = new.business_id and order_id = new.id)
      > (select coalesce(sum(amount_minor), 0) from order_refunds
        where business_id = new.business_id and order_id = new.id))
  then
    raise exception 'Tahsil edilmiş sipariş, tutar geri verilmeden iptal edilemez' using errcode = '23514';
  end if;
  if new.context_kind is distinct from old.context_kind
    or new.context_id is distinct from old.context_id
    or new.scheduled_at is distinct from old.scheduled_at
    or (old.preparation_minutes is not null and (
      new.preparation_minutes is distinct from old.preparation_minutes
      or new.estimated_ready_at is distinct from old.estimated_ready_at
    ))
    or (old.rejection_reason is not null and new.rejection_reason is distinct from old.rejection_reason)
  then
    raise exception 'Siparişin bağlamı ve karar bilgisi değiştirilemez' using errcode = '23514';
  end if;
  if exists (
    select 1 from capability_catalog c
    where c.decision_required and new.capabilities ? (c.id || '@' || c.version)
  ) and (
    (new.status = 'accepted' and (new.preparation_minutes is null or new.estimated_ready_at < now()))
    or (new.status = 'rejected' and new.rejection_reason is null)
  ) then
    raise exception 'Kabul süresi ve ret gerekçesi zorunludur' using errcode = '23514';
  end if;
  if old.status <> 'placed' and (
    new.preparation_minutes is distinct from old.preparation_minutes
    or new.estimated_ready_at is distinct from old.estimated_ready_at
    or new.rejection_reason is distinct from old.rejection_reason
  ) then
    raise exception 'Karar bilgisi yalnız ilk kabul ya da retle eklenir' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger restaurant_order_check on orders;
drop function protect_restaurant_order();
drop function restaurant_fulfilment_allowed(uuid, uuid, uuid, text, timestamptz, uuid, uuid);
create trigger order_context_check before insert or update on orders
  for each row execute function protect_order_context();

-- Fiyat görüntüsündeki satır, menünün o saatte satıştaki ürününden ve sepetteki notundan gelir.
create function check_order_line_source() returns trigger language plpgsql as $$
declare
  parent orders;
begin
  select * into parent from orders where business_id = new.business_id and id = new.order_id;
  if not catalog_item_served_at(
      new.business_id, parent.branch_id, new.item_id, coalesce(parent.scheduled_at, now())
    )
    or not exists (
      select 1 from cart_lines
      where business_id = new.business_id and cart_id = parent.cart_id
        and position = new.position and item_id = new.item_id and note = new.note
    )
  then
    raise exception 'Fiyat görüntüsü menü saatini ve sepet notunu korumalıdır' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger restaurant_line_check on order_lines;
drop function check_restaurant_line();
create trigger order_line_source_check before insert on order_lines
  for each row execute function check_order_line_source();

-- Tahsilat kabul edilmiş siparişin tam tutarına ve teslim biçiminin tahsilat yerine uyar.
create or replace function check_order_payment() returns trigger language plpgsql as $$
declare
  parent orders;
  places text[];
begin
  select * into parent from orders
  where business_id = new.business_id and id = new.order_id for update;
  select payment_places into places from ordering_fulfilment_modes where code = parent.fulfilment;
  if parent.id is null or parent.status in ('placed', 'rejected', 'cancelled')
    or parent.total_minor <> new.amount_minor or not coalesce(new.place = any (places), false)
  then
    raise exception 'Tahsilat kabul edilmiş siparişin tam tutarına ve ödeme yerine uymalıdır'
      using errcode = '23514';
  end if;
  perform 1 from business_members m join users u on u.id = m.user_id
  where m.business_id = new.business_id and m.id = new.member_id and m.active and u.status = 'active'
  for share of m, u;
  if not found then
    raise exception 'Tahsilat etkin işletme üyesi tarafından kaydedilir' using errcode = '23514';
  end if;
  return new;
end $$;

-- Kim iptal edebilir: sahip ya da yönetici her zaman (teslimden önce); müşteri yalnız kabulden önce
-- ve ödeme alınmamışken. Paketlerin ek iptal kuralları kendi tetikleyicilerindedir.
create or replace function check_order_cancellation_actor() returns trigger language plpgsql as $$
declare
  paid bigint;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    select coalesce(sum(amount_minor), 0) into paid from order_payments
    where business_id = old.business_id and order_id = old.id;
    if not tenant_member_manages(old.business_id) and (
      old.status <> 'placed' or paid <> 0
      or not tenant_customer_actor(old.business_id, old.business_customer_id)
    ) then
      raise exception 'Müşteri yalnız kabulden önce iptal eder' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- Canlı olay: sipariş olayı siparişten, paket olayı paketin çözücüsünden alınır.
create or replace function append_business_live_event() returns trigger language plpgsql
security definer set search_path = pg_catalog, public as $$
declare
  next_cursor bigint;
  kind live_event_types;
  branch uuid;
  instance uuid;
  customer uuid;
  source_kind text;
  source_id uuid;
begin
  select * into kind from public.live_event_types where type = new.type;
  if not found then
    return new;
  end if;
  if new.business_id is distinct from nullif(current_setting('vado.business_id', true), '')::uuid then
    raise exception 'Canlı olay kapsamı korunmalıdır' using errcode = '42501';
  end if;
  if new.order_id is not null then
    select o.branch_id, o.app_instance_id, o.business_customer_id, o.context_kind, o.context_id
    into branch, instance, customer, source_kind, source_id
    from public.orders o where o.business_id = new.business_id and o.id = new.order_id;
  elsif kind.resolver is not null then
    execute format('select * from %s($1, $2)', kind.resolver::regproc)
      into branch, instance, customer, source_kind, source_id
      using new.business_id, new.aggregate_id;
  end if;
  if branch is null or instance is null then
    raise exception 'Canlı olay gerçek bir kaynaktan alınır' using errcode = '23514';
  end if;
  insert into public.business_live_offsets (business_id, value) values (new.business_id, 1)
  on conflict (business_id) do update set value = business_live_offsets.value + 1
  returning value into next_cursor;
  insert into public.business_live_events (
    business_id, cursor, event_id, branch_id, app_instance_id, business_customer_id, order_id,
    context_kind, context_id, type
  ) values (
    new.business_id, next_cursor, new.id, branch, instance, customer, new.order_id,
    source_kind, source_id, new.type
  );
  return new;
end $$;
revoke all on function append_business_live_event() from public;

-- Sipariş toplamı satırlarla eşleşir; aynı işlemde yazılan satırların birim fiyatı seçenekleri
-- içerir. Önceki tanımın yerel değişken adı yeni bağlam sütunuyla çakıştığı için yeniden yazıldı;
-- davranış aynıdır.
create or replace function check_order_totals() returns trigger language plpgsql
security definer set search_path = pg_catalog, public as $$
declare
  parent orders;
  line order_lines;
  target_order uuid;
  target_line uuid;
  gross bigint;
  vat bigint;
  count_lines integer;
begin
  if tg_table_name = 'orders' then
    target_order := new.id;
  elsif tg_table_name = 'order_lines' then
    target_order := new.order_id;
    target_line := new.id;
  else
    target_line := new.order_line_id;
    select order_id into target_order from order_lines
    where business_id = new.business_id and id = new.order_line_id;
  end if;
  select * into parent from orders where business_id = new.business_id and id = target_order;
  select sum(total_minor), sum(vat_minor), count(*) into gross, vat, count_lines
  from order_lines where business_id = new.business_id and order_id = target_order;
  if count_lines < 1 or gross + parent.delivery_fee_minor <> parent.total_minor
    or vat <> parent.vat_minor
  then
    raise exception 'Sipariş toplamı satırlarla eşleşmelidir' using errcode = '23514';
  end if;
  if parent.created_txid = txid_current() then
    for line in
      select * from order_lines
      where business_id = new.business_id and order_id = target_order
        and (target_line is null or id = target_line)
    loop
      if line.unit_price_minor <> line.base_price_minor + coalesce((
        select sum(price_delta_minor) from order_line_options
        where business_id = new.business_id and order_line_id = line.id
      ), 0) then
        raise exception 'Birim fiyat seçenekleri içermelidir' using errcode = '23514';
      end if;
      if exists (
        select 1
        from item_option_groups ig
        join option_groups og on og.business_id = ig.business_id and og.id = ig.group_id
        where ig.business_id = new.business_id and ig.item_id = line.item_id and og.active
          and (
            select count(*)
            from order_line_options chosen
            join options o on o.business_id = chosen.business_id and o.id = chosen.option_id
            where chosen.business_id = new.business_id and chosen.order_line_id = line.id
              and o.group_id = og.id
          ) not between og.min_selected and og.max_selected
      ) then
        raise exception 'Seçenek sayısı grup sınırını karşılamalıdır' using errcode = '23514';
      end if;
    end loop;
  end if;
  return null;
end $$;
