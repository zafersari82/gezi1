-- Tekil kaynak branches tablosudur (işletme RLS kapsamı).
-- Kamu keşfi için yalnız etkin şubenin il/ilçe kimliklerini taşıyan sınırlı bir okuma izdüşümü.
-- Bu tabloya uygulama rolü yazamaz: senkronizasyon yalnız branches tetikleyicisi ile yapılır.
alter table branches
  add column province_id uuid references location_provinces(id) on delete restrict,
  add column district_id uuid,
  add constraint branches_discovery_location_pair_check
    check ((province_id is null) = (district_id is null)),
  add constraint branches_discovery_district_fk
    foreign key (province_id, district_id) references location_districts(province_id,id) on delete restrict;

create table branch_discovery_locations (
  business_id uuid not null,
  branch_id uuid not null,
  province_id uuid not null references location_provinces(id) on delete restrict,
  district_id uuid not null,
  primary key(business_id,branch_id),
  constraint branch_discovery_branch_fk foreign key(business_id,branch_id)
    references branches(business_id,id) on delete cascade,
  constraint branch_discovery_district_fk foreign key(province_id,district_id)
    references location_districts(province_id,id) on delete restrict
);
create index branch_discovery_geo_idx on branch_discovery_locations(province_id,district_id,business_id);

create function sync_branch_discovery_location() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.branch_discovery_locations where business_id=old.business_id and branch_id=old.id;
    return old;
  end if;
  if new.active and new.province_id is not null and new.district_id is not null then
    insert into public.branch_discovery_locations(business_id,branch_id,province_id,district_id)
      values(new.business_id,new.id,new.province_id,new.district_id)
      on conflict(business_id,branch_id) do update
        set province_id=excluded.province_id,district_id=excluded.district_id;
  else
    delete from public.branch_discovery_locations where business_id=new.business_id and branch_id=new.id;
  end if;
  return new;
end $$;
revoke all on function sync_branch_discovery_location() from public;
create trigger branch_discovery_location_sync after insert or update or delete on branches
  for each row execute function sync_branch_discovery_location();

-- Daha önceki şubelerin konumu henüz işlenmedi: tahmini ilçe ataması yapılmaz.
revoke insert,update,delete on branch_discovery_locations from vado_app,vado_platform;
grant select on branch_discovery_locations to vado_app,vado_platform;
