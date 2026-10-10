-- Sipariş paket kataloğu (2.8, A2). Çekirdek SQL paket adı bilmez.
--
-- Hangi paketlerin var olduğu, hangi paketi gerektirdiği ve sipariş akışına hangi durumları
-- eklediği bu katalogdan okunur. Paketler kendi satırlarını kendi şema dosyalarıyla ekler; satırlar
-- yalnız şema dosyalarıyla değişir, uygulama rolleri okur. Önceki sürümlerde paket adlarıyla yazılmış
-- akış işlevleri ve kısıtlar burada tek, genel tanıma iner.

create table capability_catalog (
  id text not null check (id ~ '^[a-z]+(\.[a-z_]+)*$'),
  version text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  engine text not null check (engine ~ '^[a-z]+$'),
  -- `workflow` paketi akışa ya da teslim biçimine katılır; `data` paketi yalnız veri ekler.
  role text not null check (role in ('workflow', 'data')),
  -- Gereken paketler: her grup, içindeki seçeneklerden en az biriyle karşılanır ('kimlik@sürüm').
  requires jsonb not null default '[]' check (jsonb_typeof(requires) = 'array'),
  -- Akışa eklenen durumlar: {from, to, entry, fulfilments?, states: [{id, next}]}.
  insertions jsonb not null default '[]' check (jsonb_typeof(insertions) = 'array'),
  default_config jsonb not null default '{}' check (jsonb_typeof(default_config) = 'object'),
  -- Ayarı doğrulayan işlev (config jsonb) → boolean. Yoksa ayar boş nesne olmalıdır.
  config_validator regprocedure,
  -- Etkin siparişler varken kapatılabilir mi? Sipariş kendi akış görüntüsünü taşıdığı için
  -- yalnız durum ekleyen paketler kapatılabilir; davranış ekleyenler kapatılamaz.
  closable_with_active_orders boolean not null default false,
  primary key (id, version)
);
revoke insert, update, delete, truncate on capability_catalog from vado_app, vado_platform;

-- Çekirdek akışa paketlerin eklemelerini uygular. Bir ekleme, ekleme noktası akışta varsa
-- uygulanır; başka bir eklemenin açtığı noktayı bekleyen ekleme sonraki turda uygulanır. Aynı
-- noktaya iki ekleme ya da hiç açılmayan nokta derlenemez: sonuç `null` olur. `mode` verilirse
-- yalnız o teslim biçimine ait eklemeler uygulanır.
create function ordering_compile_graph(capabilities jsonb, mode text)
returns jsonb language plpgsql stable set search_path = pg_catalog, public as $$
declare
  graph jsonb := ordering_core_graph();
  pending jsonb;
  waiting jsonb;
  insertion jsonb;
  state jsonb;
  progressed boolean;
begin
  if jsonb_typeof(capabilities) is distinct from 'array' then
    return null;
  end if;
  select coalesce(jsonb_agg(e.item order by c.id, c.version, e.position), '[]'::jsonb)
  into pending
  from capability_catalog c
  cross join lateral jsonb_array_elements(c.insertions) with ordinality as e(item, position)
  where c.engine = 'ordering'
    and capabilities ? (c.id || '@' || c.version)
    and (mode is null or not e.item ? 'fulfilments' or (e.item -> 'fulfilments') ? mode);

  while jsonb_array_length(pending) > 0 loop
    progressed := false;
    waiting := '[]'::jsonb;
    for insertion in select value from jsonb_array_elements(pending) loop
      if coalesce((graph -> (insertion ->> 'from')) ? (insertion ->> 'to'), false)
        and not exists (
          select 1 from jsonb_array_elements(insertion -> 'states') as s(value)
          where graph ? (s.value ->> 'id')
        )
      then
        graph := jsonb_set(graph, array[insertion ->> 'from'], (
          select jsonb_agg(
            case when t.target = insertion -> 'to' then insertion -> 'entry' else t.target end
            order by t.position
          )
          from jsonb_array_elements(graph -> (insertion ->> 'from'))
            with ordinality as t(target, position)
        ));
        for state in select value from jsonb_array_elements(insertion -> 'states') loop
          graph := graph || jsonb_build_object(state ->> 'id', state -> 'next');
        end loop;
        progressed := true;
      else
        waiting := waiting || jsonb_build_array(insertion);
      end if;
    end loop;
    if not progressed then
      return null;
    end if;
    pending := waiting;
  end loop;
  return graph;
end $$;

-- Paket kümesi geçerli mi? Hepsi katalogda, tekil, gereksinimleri açık ve akışı derlenebilir.
create function ordering_capabilities_valid(capabilities jsonb)
returns boolean language sql stable set search_path = pg_catalog, public as $$
  select jsonb_typeof(capabilities) = 'array'
    and (
      select count(*) = count(distinct value) from jsonb_array_elements_text(capabilities)
    )
    and not exists (
      select 1
      from jsonb_array_elements_text(capabilities) as entry(value)
      where not exists (
        select 1 from capability_catalog c
        where c.engine = 'ordering' and c.id || '@' || c.version = entry.value
      )
    )
    and not exists (
      select 1
      from capability_catalog c
      cross join lateral jsonb_array_elements(c.requires) as need(alternatives)
      where c.engine = 'ordering'
        and capabilities ? (c.id || '@' || c.version)
        and not exists (
          select 1
          from jsonb_array_elements_text(need.alternatives) as choice(value)
          where capabilities ? choice.value
        )
    )
    and ordering_compile_graph(capabilities, null) is not null
$$;

create function ordering_graph_allowed(graph jsonb, capabilities jsonb, mode text)
returns boolean language sql stable set search_path = pg_catalog, public as $$
  select ordering_capabilities_valid(capabilities)
    and graph = ordering_compile_graph(capabilities, mode)
$$;

create or replace function ordering_workflow_for_instance(business uuid, instance uuid)
returns jsonb language sql stable set search_path = pg_catalog, public as $$
  select ordering_compile_graph(ordering_capabilities_for_instance(business, instance), null)
$$;

create or replace function ordering_workflow_for_fulfilment(business uuid, instance uuid, mode text)
returns jsonb language sql stable set search_path = pg_catalog, public as $$
  select ordering_compile_graph(ordering_capabilities_for_instance(business, instance), mode)
$$;

-- Siparişin akışı ekleme anında `protect_order` tarafından derlenmiş akışla karşılaştırılır ve
-- sonra değiştirilemez. Paket adı taşıyan tablo kısıtları kaldırılır; bu denetim tetikleyicidedir
-- (yedekten dönüşte katalog satırları siparişlerden sonra yüklenebilir).
alter table orders drop constraint order_workflow_valid;
alter table orders drop constraint order_workflow_fulfilment;
drop function ordering_graph_allowed(jsonb, jsonb);
drop function ordering_delivery_graph();
drop function ordering_preparation_graph();

-- Uygulama örneğinin paketleri katalogdan gelir; ayar katalogdaki doğrulayıcıyla denetlenir.
alter table app_instance_capabilities drop constraint capability_id_known;
alter table app_instance_capabilities drop constraint capability_config_known;
alter table app_instance_capabilities drop constraint app_instance_capabilities_version_check;
alter table app_instance_capabilities alter column config drop default;
-- Katalog satırları paket dosyalarında eklenir; var olan satırlar o dosyanın sonunda doğrulanır.
alter table app_instance_capabilities
  add constraint app_instance_capability_catalog foreign key (capability_id, version)
  references capability_catalog (id, version) not valid;

create function check_capability_config() returns trigger language plpgsql as $$
declare
  entry capability_catalog;
  valid boolean;
begin
  select * into entry from capability_catalog
  where id = new.capability_id and version = new.version and engine = 'ordering';
  if not found then
    raise exception 'Paket katalogda yok' using errcode = '23514';
  end if;
  new.config := coalesce(new.config, entry.default_config);
  if entry.config_validator is null then
    valid := new.config = '{}'::jsonb;
  else
    execute format('select %s($1)', entry.config_validator::regproc) into valid using new.config;
  end if;
  if not coalesce(valid, false) then
    raise exception 'Paket ayarı geçersiz' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger capability_config_check before insert or update on app_instance_capabilities
  for each row execute function check_capability_config();

-- Paket kümesi işlem sonunda denetlenir: geçerli olmalı ve davranış ekleyen paket, onu kullanan
-- etkin sipariş varken kapatılamaz.
create function check_instance_capabilities() returns trigger language plpgsql as $$
declare
  business uuid;
  instance uuid;
  closable boolean;
begin
  business := case when tg_op = 'DELETE' then old.business_id else new.business_id end;
  instance := case when tg_op = 'DELETE' then old.app_instance_id else new.app_instance_id end;
  if not ordering_capabilities_valid(ordering_capabilities_for_instance(business, instance)) then
    raise exception 'Paket bağımlılıkları ve sipariş akışı uyumsuz' using errcode = '23514';
  end if;
  if tg_op <> 'INSERT' and old.enabled and (tg_op = 'DELETE' or not new.enabled) then
    select c.closable_with_active_orders into closable
    from capability_catalog c
    where c.id = old.capability_id and c.version = old.version;
    if not coalesce(closable, false) and exists (
      select 1 from orders
      where business_id = business and app_instance_id = instance
        and status not in ('completed', 'rejected', 'cancelled')
        and capabilities ? (old.capability_id || '@' || old.version)
    ) then
      raise exception 'Aktif sipariş varken paket kapatılamaz' using errcode = '23514';
    end if;
  end if;
  return null;
end $$;
drop trigger restaurant_capability_check on app_instance_capabilities;
drop function check_restaurant_capability();
create constraint trigger instance_capabilities_check
  after insert or update or delete on app_instance_capabilities
  deferrable initially deferred for each row execute function check_instance_capabilities();
