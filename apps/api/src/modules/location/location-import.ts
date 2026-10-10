import { createHash } from "node:crypto";

import { z } from "zod";

import { type Database, sql } from "../../core/database";
import { platformScope } from "../../core/platform-scope";
export const LOCATION_SOURCE = "https://github.com/onurusluca/turkey-geo-api";
export const LOCATION_COMMIT = "5a16cef20f2335e3fe643c9618f931866bb8134c";
export const LOCATION_SHA256 = "76219fdbd23fa5183a918fd4730f60d91e53b29b593b7638bf8f317078add37f";
const name = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.trim().length > 0);
const sourceId = z.number().int().positive();
const place = z.object({ id: sourceId, name: name.nullable(), full_official_name: name });
const sourceCatalogSchema = z.object({
  source: z.object({
    repository: z.literal(LOCATION_SOURCE),
    commit: z.literal(LOCATION_COMMIT),
    license: z.literal("MIT"),
    copyright: z.literal("Copyright (c) 2025 Onur Usluca"),
    countryCode: z.literal("TR"),
    retrievedAt: z.string(),
  }),
  provinces: z.array(place).min(1),
  districts: z.array(place.extend({ province_id: sourceId })).min(1),
  neighborhoods: z.array(place.extend({ province_id: sourceId, district_id: sourceId })).min(1),
});
const IMPORT_LOCK = 7_280_001;
/** Tam kaynak adlarını ve bütün parent bağlarını yazmadan doğrular; aynı adlı yerleri birleştirmez. */
export function validateLocationCatalog(input: unknown) {
  const catalog = sourceCatalogSchema.parse(input);
  const unique = (rows: { id: number }[]) => {
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      throw new Error("Katalogda yinelenen kaynak kimliği var.");
  };
  unique(catalog.provinces);
  unique(catalog.districts);
  unique(catalog.neighborhoods);
  const provinces = new Set(catalog.provinces.map((row) => row.id));
  const districts = new Map(catalog.districts.map((row) => [row.id, row.province_id]));
  if (
    catalog.districts.some((row) => !provinces.has(row.province_id)) ||
    catalog.neighborhoods.some((row) => districts.get(row.district_id) !== row.province_id)
  )
    throw new Error("Katalogda geçersiz il, ilçe veya mahalle parent bağlantısı var.");
  if (
    catalog.provinces.some((row) => !catalog.districts.some((d) => d.province_id === row.id)) ||
    catalog.districts.some((row) => !catalog.neighborhoods.some((n) => n.district_id === row.id))
  )
    throw new Error("Katalogda alt kaydı eksik il veya ilçe var.");
  return catalog;
}
/** Kaynak UUID'leri yeniden importta değişmez; bütün katalog tek SQL işleminde kesinleşir. */
export async function importLocationCatalog(platformDb: Database, raw: Uint8Array) {
  const text = Buffer.from(raw).toString("utf8");
  const input: unknown = JSON.parse(text);
  const catalog = validateLocationCatalog(input);
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const normalize = (r: z.infer<typeof place>) => ({
    source_id: r.id,
    name: r.name ?? r.full_official_name,
    full_official_name: r.full_official_name,
  });
  const counts = {
    provinces: catalog.provinces.length,
    districts: catalog.districts.length,
    neighborhoods: catalog.neighborhoods.length,
  };
  return platformScope(platformDb, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${IMPORT_LOCK})`);
    const country = await tx.one<{ id: string }>(
      sql`insert into location_countries(code,name) values('TR','Türkiye') on conflict(code) do update set name=excluded.name returning id`,
    );
    await tx.execute(
      sql`insert into location_provinces(source_id,country_id,name,full_official_name) select x.source_id,${country.id},x.name,x.full_official_name from jsonb_to_recordset(${JSON.stringify(catalog.provinces.map(normalize))}::jsonb) as x(source_id integer,name text,full_official_name text) on conflict(source_id) do update set country_id=excluded.country_id,name=excluded.name,full_official_name=excluded.full_official_name`,
    );
    await tx.execute(
      sql`insert into location_districts(source_id,province_id,name,full_official_name) select x.source_id,p.id,x.name,x.full_official_name from jsonb_to_recordset(${JSON.stringify(catalog.districts.map((r) => ({ ...normalize(r), province_source: r.province_id })))}::jsonb) as x(source_id integer,province_source integer,name text,full_official_name text) join location_provinces p on p.source_id=x.province_source on conflict(source_id) do update set province_id=excluded.province_id,name=excluded.name,full_official_name=excluded.full_official_name`,
    );
    await tx.execute(
      sql`insert into location_neighborhoods(source_id,district_id,name,full_official_name) select x.source_id,d.id,x.name,x.full_official_name from jsonb_to_recordset(${JSON.stringify(catalog.neighborhoods.map((r) => ({ ...normalize(r), district_source: r.district_id })))}::jsonb) as x(source_id integer,district_source integer,name text,full_official_name text) join location_districts d on d.source_id=x.district_source on conflict(source_id) do update set district_id=excluded.district_id,name=excluded.name,full_official_name=excluded.full_official_name`,
    );
    await tx.execute(
      sql`insert into location_catalog_imports(source,version,sha256,counts) values(${LOCATION_SOURCE},${LOCATION_COMMIT},${sha256},${JSON.stringify(counts)}::jsonb) on conflict(source) do update set version=excluded.version,sha256=excluded.sha256,counts=excluded.counts,imported_at=now()`,
    );
    return { source: LOCATION_SOURCE, version: LOCATION_COMMIT, sha256, counts };
  });
}
