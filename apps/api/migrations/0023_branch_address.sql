-- Şubenin tek adres kaynağı: Türkiye adres kataloğundaki il, ilçe ve mahalle ile açık adres.
-- Keşif ve teslimat bu kaynaktan okur. 2.7'den kalan serbest metin (`address`) tahminle
-- dönüştürülmez; işletme yapılandırılmış adresi kaydedene kadar yalnız gösterilir.
alter table branches
  add column province_id uuid references location_provinces (id),
  add column district_id uuid,
  add column neighborhood_id uuid,
  add column address_line text,
  add constraint branch_address_district
    foreign key (province_id, district_id) references location_districts (province_id, id),
  add constraint branch_address_neighborhood
    foreign key (district_id, neighborhood_id) references location_neighborhoods (district_id, id),
  add constraint branch_address_complete check (
    (province_id is null) = (district_id is null)
    and (district_id is null) = (neighborhood_id is null)
    and (neighborhood_id is null) = (address_line is null)
  ),
  add constraint branch_address_line check (
    address_line is null or char_length(btrim(address_line)) between 5 and 300
  );

-- Kamusal keşif için tek yönlü okuma izdüşümü: yalnız etkin ve adresi kayıtlı şubenin il ve
-- ilçesi. Şube tablosu işletme RLS'si altında kalır; uygulama rolleri bu tabloya yazamaz,
-- yalnız şube tetikleyicisi yazar.
create table branch_discovery_locations (
  business_id uuid not null,
  branch_id uuid not null,
  province_id uuid not null references location_provinces (id),
  district_id uuid not null,
  primary key (business_id, branch_id),
  foreign key (business_id, branch_id) references branches (business_id, id) on delete cascade,
  foreign key (province_id, district_id) references location_districts (province_id, id)
);
create index branch_discovery_locations_area
  on branch_discovery_locations (province_id, district_id, business_id);
revoke insert, update, delete on branch_discovery_locations from vado_app, vado_platform;

create function sync_branch_discovery_location() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.active and new.district_id is not null then
    insert into public.branch_discovery_locations (business_id, branch_id, province_id, district_id)
    values (new.business_id, new.id, new.province_id, new.district_id)
    on conflict (business_id, branch_id) do update
      set province_id = excluded.province_id, district_id = excluded.district_id;
  else
    delete from public.branch_discovery_locations
    where business_id = new.business_id and branch_id = new.id;
  end if;
  return new;
end $$;
revoke all on function sync_branch_discovery_location() from public;
-- Şube silinince satırı yabancı anahtar siler.
create trigger branch_discovery_location_sync
  after insert or update of active, province_id, district_id on branches
  for each row execute function sync_branch_discovery_location();
