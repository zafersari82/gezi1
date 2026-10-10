import type { LocationCountry, LocationPath, LocationPlace } from "@vado/contracts";

import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
interface PlaceRow {
  id: string;
  source_id: number;
  parent_id: string;
  name: string;
  full_official_name: string;
}
const toPlace = (r: PlaceRow): LocationPlace => ({
  id: r.id,
  sourceId: r.source_id,
  parentId: r.parent_id,
  name: r.name,
  fullOfficialName: r.full_official_name,
});
export async function requireLocationCatalog(db: Database): Promise<void> {
  if ((await db.maybeOne(sql`select source from location_catalog_imports limit 1`)) === null)
    throw new AppError("location_catalog_not_ready");
}
/** Parent zinciri sunucudan okunur; istemcinin yer adı veya parent iddiasına güvenilmez. */
export async function readLocationPath(
  db: Database,
  neighborhoodId: string,
): Promise<LocationPath> {
  const r = await db.maybeOne<{
    country_id: string;
    country_code: string;
    country_name: string;
    province_id: string;
    province_source: number;
    province_name: string;
    province_full: string;
    district_id: string;
    district_source: number;
    district_name: string;
    district_full: string;
    id: string;
    source_id: number;
    name: string;
    full_official_name: string;
  }>(
    sql`select c.id as country_id,c.code as country_code,c.name as country_name,p.id as province_id,p.source_id as province_source,p.name as province_name,p.full_official_name as province_full,d.id as district_id,d.source_id as district_source,d.name as district_name,d.full_official_name as district_full,n.id,n.source_id,n.name,n.full_official_name from location_neighborhoods n join location_districts d on d.id=n.district_id join location_provinces p on p.id=d.province_id join location_countries c on c.id=p.country_id where n.id=${neighborhoodId}`,
  );
  if (r === null) throw new AppError("location_parent_invalid");
  return {
    country: { id: r.country_id, code: r.country_code, name: r.country_name },
    province: {
      id: r.province_id,
      sourceId: r.province_source,
      parentId: r.country_id,
      name: r.province_name,
      fullOfficialName: r.province_full,
    },
    district: {
      id: r.district_id,
      sourceId: r.district_source,
      parentId: r.province_id,
      name: r.district_name,
      fullOfficialName: r.district_full,
    },
    neighborhood: toPlace({ ...r, parent_id: r.district_id }),
  };
}
export function createLocationCatalog(db: Database) {
  return {
    listCountries: async () => {
      await requireLocationCatalog(db);
      return {
        items: await db.many<LocationCountry>(
          sql`select id,code,name from location_countries order by code`,
        ),
      };
    },
    listProvinces: async (countryId: string) => {
      await requireLocationCatalog(db);
      return {
        items: (
          await db.many<PlaceRow>(
            sql`select *,country_id as parent_id from location_provinces where country_id=${countryId} order by name,id`,
          )
        ).map(toPlace),
      };
    },
    listDistricts: async (provinceId: string) => {
      await requireLocationCatalog(db);
      return {
        items: (
          await db.many<PlaceRow>(
            sql`select *,province_id as parent_id from location_districts where province_id=${provinceId} order by name,id`,
          )
        ).map(toPlace),
      };
    },
    listNeighborhoods: async (districtId: string) => {
      await requireLocationCatalog(db);
      return {
        items: (
          await db.many<PlaceRow>(
            sql`select *,district_id as parent_id from location_neighborhoods where district_id=${districtId} order by full_official_name,id`,
          )
        ).map(toPlace),
      };
    },
    getPath: async (neighborhoodId: string) => {
      await requireLocationCatalog(db);
      return readLocationPath(db, neighborhoodId);
    },
  };
}
