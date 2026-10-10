-- 2.8 öncesinde yayımlanmış sipariş paketlerinin katalog kaydı.
--
-- Her bölüm bir paketin satırıdır; satırlar API'deki paket manifestleriyle aynıdır ve bu eşitlik
-- `capability-catalog.test.ts` ile her derlemede denetlenir. Yeni paket kendi şema dosyasıyla
-- kendi satırını ekler.

-- Hazırlık: kabulden sonra hazırlanıyor ve hazır durumları. Ayar: istasyon adı.
create function ordering_preparation_config_valid(config jsonb)
returns boolean language sql immutable set search_path = pg_catalog, public as $$
  select jsonb_typeof(config) = 'object'
    and config - 'stationLabel' = '{}'::jsonb
    and jsonb_typeof(config -> 'stationLabel') = 'string'
    and char_length(btrim(config ->> 'stationLabel')) between 1 and 40
    and char_length(config ->> 'stationLabel') <= 40
$$;
insert into capability_catalog (
  id, version, engine, role, insertions, default_config, config_validator,
  closable_with_active_orders
) values (
  'ordering.preparation', '1.0.0', 'ordering', 'workflow',
  '[{"from": "accepted", "to": "completed", "entry": "preparing", "states": [
     {"id": "preparing", "next": ["ready", "cancelled"]},
     {"id": "ready", "next": ["completed", "cancelled"]}]}]',
  '{"stationLabel": "Hazırlık"}', 'ordering_preparation_config_valid(jsonb)', true
);

-- Operasyon cihazı (restoranda mutfak ekranı): hazırlık durumlarını cihaz yürütür.
insert into capability_catalog (id, version, engine, role, insertions) values (
  'ordering.kitchen', '1.0.0', 'ordering', 'workflow',
  '[{"from": "accepted", "to": "completed", "entry": "preparing", "states": [
     {"id": "preparing", "next": ["ready", "cancelled"]},
     {"id": "ready", "next": ["completed", "cancelled"]}]}]'
);

-- Gel-al ve ileri saatli gel-al.
insert into capability_catalog (id, version, engine, role) values
  ('ordering.pickup', '1.0.0', 'ordering', 'workflow');
insert into capability_catalog (id, version, engine, role, requires) values
  ('ordering.scheduling', '1.0.0', 'ordering', 'workflow', '[["ordering.pickup@1.0.0"]]');

-- Masa servisi. Açık masa oturumu varken kapatılamaz.
insert into capability_catalog (id, version, engine, role) values
  ('ordering.table_service', '1.0.0', 'ordering', 'workflow');
create function check_table_service_capability() returns trigger language plpgsql as $$
begin
  if old.capability_id = 'ordering.table_service' and old.enabled
    and (tg_op = 'DELETE' or not new.enabled)
    and exists (
      select 1 from table_sessions
      where business_id = old.business_id and app_instance_id = old.app_instance_id
        and status = 'open'
    )
  then
    raise exception 'Açık masa varken masa servisi kapatılamaz' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger table_service_capability_check
  after update or delete on app_instance_capabilities
  deferrable initially deferred for each row execute function check_table_service_capability();

-- Eve teslim: hazırlıktan sonra yolda durumu; yalnız teslimat siparişlerinde.
insert into capability_catalog (id, version, engine, role, requires, insertions) values (
  'ordering.delivery', '1.0.0', 'ordering', 'workflow',
  '[["ordering.preparation@1.0.0", "ordering.kitchen@1.0.0"]]',
  '[{"from": "ready", "to": "completed", "entry": "in_transit", "fulfilments": ["delivery"],
     "states": [{"id": "in_transit", "next": ["completed", "cancelled"]}]}]'
);

-- Veri paketleri: tekrar sipariş, iptal ve iade talebi. Akışı değiştirmez.
insert into capability_catalog (id, version, engine, role) values
  ('ordering.reorder', '1.0.0', 'ordering', 'data'),
  ('ordering.returns', '1.0.0', 'ordering', 'data');

alter table app_instance_capabilities validate constraint app_instance_capability_catalog;
