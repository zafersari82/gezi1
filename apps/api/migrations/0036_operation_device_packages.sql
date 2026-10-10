-- Restoran operasyon cihazı, kendi paketinde izin verdiği durumları açıklar.
update capability_catalog
set device_statuses = '{accepted,rejected,preparing,ready,completed}'
where id = 'ordering.kitchen' and version = '1.0.0' and engine = 'ordering';

-- Etkin cihaz varken paket kapatma kuralı mutfak paketine aittir;
-- çekirdek migration bu paket kimliğini tanımaz.
create or replace function protect_kitchen_capability() returns trigger language plpgsql as $$
begin
  if old.capability_id='ordering.kitchen' and old.enabled and (tg_op='DELETE' or not new.enabled) and exists(
    select 1 from operation_devices where business_id=old.business_id and app_instance_id=old.app_instance_id and revoked_at is null and expires_at>now()) then
    raise exception 'Etkin mutfak cihazı varken paket kapatılamaz' using errcode='23514'; end if;
  if tg_op='DELETE' then return old;end if;return new;
end $$;
