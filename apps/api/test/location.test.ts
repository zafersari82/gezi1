import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { createLocationAddresses } from "../src/modules/location/location-addresses";
import {
  importLocationCatalog,
  LOCATION_COMMIT,
  LOCATION_SOURCE,
  validateLocationCatalog,
} from "../src/modules/location/location-import";
import { anonymous, as, createUser, type TestApp } from "./support/harness";
import { startIsolatedTestApp } from "./support/isolated-app";
import { createTenantFixture, scoped } from "./support/tenant-fixture";
let app: TestApp;
beforeAll(async () => {
  app = await startIsolatedTestApp();
});
afterAll(async () => {
  await app.stop();
});
const record = z.looseObject({ id: z.uuid(), version: z.number() });
const list = z.object({ items: z.array(record) });
it("ithal edilmemiş katalog hazır gibi sunulmaz ve anonim istek reddedilir", async () => {
  const user = await createUser(app, "Adres sahibi");
  expect(await as(app, user).request("GET", "/v1/location/countries")).toMatchObject({
    status: 503,
    body: { error: { code: "location_catalog_not_ready" } },
  });
  await anonymous(app).fail("unauthorized", "GET", "/v1/location/countries");
});
async function geography() {
  const country = await app.platformDb.one<{ id: string }>(
    sql`insert into location_countries(code,name) values('TR','Türkiye') on conflict(code) do update set name=excluded.name returning id`,
  );
  const province = await app.platformDb.one<{ id: string }>(
    sql`insert into location_provinces(source_id,country_id,name,full_official_name) values(999001,${country.id},'ÖRNEK İL','ÖRNEK İL') on conflict(source_id) do update set name=excluded.name returning id`,
  );
  const district = await app.platformDb.one<{ id: string }>(
    sql`insert into location_districts(source_id,province_id,name,full_official_name) values(999001,${province.id},'ÖRNEK İLÇE','ÖRNEK İLÇE') on conflict(source_id) do update set name=excluded.name returning id`,
  );
  const neighborhood = await app.platformDb.one<{ id: string }>(
    sql`insert into location_neighborhoods(source_id,district_id,name,full_official_name) values(999001,${district.id},'ÖRNEK','ÖRNEK MAHALLESİ') on conflict(source_id) do update set name=excluded.name returning id`,
  );
  await app.platformDb.execute(
    sql`insert into location_catalog_imports(source,version,sha256,counts) values('fixture','1',${"a".repeat(64)},'{"provinces":1,"districts":1,"neighborhoods":1}') on conflict(source) do nothing`,
  );
  return {
    countryId: country.id,
    provinceId: province.id,
    districtId: district.id,
    neighborhoodId: neighborhood.id,
  };
}
it("adres yalnız sahibinindir; tekrar, sürüm, telefon, değiştirilmiş parent ve arşiv korunur", async () => {
  const geo = await geography(),
    user = await createUser(app, "Birinci alıcı"),
    other = await createUser(app, "İkinci alıcı");
  const client = as(app, user),
    key = randomUUID();
  const body = {
    ...geo,
    label: "Ev",
    recipientName: "Birinci alıcı",
    phone: "+905551112233",
    addressLine: "Örnek sokak 12",
    door: "3",
    note: "Zili çal",
  };
  const created = await client.ok(record, "POST", "/v1/location/addresses", {
    body,
    headers: { "idempotency-key": key },
  });
  expect(created).toMatchObject({ ...body, version: 1, archived: false });
  expect(
    await client.ok(record, "POST", "/v1/location/addresses", {
      body,
      headers: { "idempotency-key": key },
    }),
  ).toEqual(created);
  await client.fail("idempotency_conflict", "POST", "/v1/location/addresses", {
    body: { ...body, label: "İş" },
    headers: { "idempotency-key": key },
  });
  expect(await as(app, other).ok(list, "GET", "/v1/location/addresses")).toEqual({ items: [] });
  await as(app, other).fail("not_found", "GET", `/v1/location/addresses/${created.id}`);
  await as(app, other).fail("not_found", "PUT", `/v1/location/addresses/${created.id}`, {
    body: { ...body, expectedVersion: 1 },
    headers: { "idempotency-key": randomUUID() },
  });
  for (const invalid of [{ phone: "555" }, { provinceId: randomUUID() }, { userId: other.id }])
    expect(
      (
        await client.request("POST", "/v1/location/addresses", {
          body: { ...body, ...invalid },
          headers: { "idempotency-key": randomUUID() },
        })
      ).status,
    ).toBe(400);
  const update = { ...body, label: "İş", expectedVersion: 1 };
  const updated = await client.ok(record, "PUT", `/v1/location/addresses/${created.id}`, {
    body: update,
    headers: { "idempotency-key": randomUUID() },
  });
  expect(updated).toMatchObject({ version: 2, label: "İş" });
  expect(
    (
      await client.request("PUT", `/v1/location/addresses/${created.id}`, {
        body: update,
        headers: { "idempotency-key": randomUUID() },
      })
    ).status,
  ).toBe(409);
  const archived = await client.ok(record, "POST", `/v1/location/addresses/${created.id}/archive`, {
    body: { expectedVersion: 2 },
    headers: { "idempotency-key": randomUUID() },
  });
  expect(archived).toMatchObject({ archived: true, version: 3 });
  expect(await client.ok(list, "GET", "/v1/location/addresses")).toEqual({ items: [] });
  expect((await client.ok(record, "GET", `/v1/location/addresses/${created.id}`)).archived).toBe(
    true,
  );
  const audits = await app.db.many(
    sql`select action,metadata from audit_log where target_id=${created.id}`,
  );
  expect(audits).toHaveLength(3);
  expect(JSON.stringify(audits)).not.toContain(body.phone);
  const events = await app.platformDb.many(
    sql`select type,payload from platform_outbox_events where payload->>'addressId'=${created.id}`,
  );
  expect(events).toHaveLength(3);
  expect(JSON.stringify(events)).not.toContain(body.phone);
});
it("bölgede işletme ve şube sahipliği, yetki, tekrar, sürüm ve devre dışı bırakma korunur", async () => {
  const geo = await geography(),
    f = await createTenantFixture(app),
    other = await createTenantFixture(app),
    staff = await createUser(app, "Personel");
  await scoped(app.db, f.businessId, (tx) =>
    tx.execute(
      sql`insert into business_members(business_id,user_id,role) values(${f.businessId},${staff.id},'staff')`,
    ),
  );
  const client = as(app, f.owner),
    root = `/v1/business/${f.businessId}/branches/${f.branchId}/service-areas`,
    body = { name: "Yakın mahalleler", neighborhoodIds: [geo.neighborhoodId] },
    headers = { "idempotency-key": randomUUID() };
  await anonymous(app).fail("unauthorized", "GET", root);
  await as(app, other.owner).fail("forbidden", "GET", root);
  await as(app, staff).fail("forbidden", "POST", root, { body, headers });
  await expect(
    app.services.location.createServiceArea(f.scope, f.branchId, randomUUID(), {
      ...body,
      neighborhoodIds: [randomUUID()],
    }),
  ).rejects.toMatchObject({ code: "location_parent_invalid" });
  expect(
    (
      await client.request("POST", root, {
        body: { ...body, neighborhoodIds: [randomUUID()] },
        headers,
      })
    ).status,
  ).toBe(400);
  await client.fail(
    "not_found",
    "POST",
    `/v1/business/${f.businessId}/branches/${other.branchId}/service-areas`,
    { body, headers },
  );
  const area = await client.ok(record, "POST", root, { body, headers });
  expect(area).toMatchObject({
    businessId: f.businessId,
    branchId: f.branchId,
    version: 1,
    active: true,
    ...body,
  });
  expect(await client.ok(record, "POST", root, { body, headers })).toEqual(area);
  await client.fail("idempotency_conflict", "POST", root, {
    body: { ...body, name: "Başka" },
    headers,
  });
  const updated = await client.ok(record, "PUT", `${root}/${area.id}`, {
    body: { ...body, name: "Merkez", expectedVersion: 1 },
    headers: { "idempotency-key": randomUUID() },
  });
  expect(updated.version).toBe(2);
  expect(
    (
      await client.request("PUT", `${root}/${area.id}`, {
        body: { ...body, expectedVersion: 1 },
        headers: { "idempotency-key": randomUUID() },
      })
    ).status,
  ).toBe(409);
  const disabled = await client.ok(record, "POST", `${root}/${area.id}/disable`, {
    body: { expectedVersion: 2 },
    headers: { "idempotency-key": randomUUID() },
  });
  expect(disabled).toMatchObject({ active: false, version: 3 });
  expect((await client.ok(list, "GET", root)).items).toHaveLength(1);
  expect(
    (
      await app.db.one<{ count: number }>(
        sql`select count(*) from audit_log where target_id=${area.id}`,
      )
    ).count,
  ).toBe(3);
  const events = await scoped(app.db, f.businessId, (tx) =>
    tx.many<{ sequence: number; payload: unknown }>(
      sql`select sequence,payload from outbox_events where aggregate_id=${area.id} order by sequence`,
    ),
  );
  expect(events).toHaveLength(3);
  expect(events.map((e) => e.sequence)).toEqual([1, 2, 3]);
});
it("FORCE RLS aktör veya tenant olmadan sıfır satır döndürür; başka sahip ve parent SQL ile değiştirilemez", async () => {
  const geo = await geography(),
    f = await createTenantFixture(app),
    other = await createUser(app, "Yabancı");
  const body = {
    ...geo,
    label: "Gizli",
    recipientName: "Özel",
    phone: "+905554445566",
    addressLine: "Gizli sokak",
    door: "1",
    note: "",
  };
  const address = await as(app, f.customer).ok(record, "POST", "/v1/location/addresses", {
    body,
    headers: { "idempotency-key": randomUUID() },
  });
  const root = `/v1/business/${f.businessId}/branches/${f.branchId}/service-areas`;
  const area = await as(app, f.owner).ok(record, "POST", root, {
    body: { name: "Alan", neighborhoodIds: [geo.neighborhoodId] },
    headers: { "idempotency-key": randomUUID() },
  });
  expect(await app.db.many(sql`select * from location_addresses`)).toEqual([]);
  expect(await app.migrationDb.many(sql`select * from location_addresses`)).toEqual([]);
  expect(
    await scoped(app.db, f.businessId, (tx) => tx.many(sql`select * from location_service_areas`)),
  ).toEqual([]);
  await app.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('vado.user_id',${other.id},true)`);
    expect(await tx.many(sql`select * from location_addresses where id=${address.id}`)).toEqual([]);
    expect(await tx.many(sql`select * from location_service_areas where id=${area.id}`)).toEqual(
      [],
    );
  });
  await expect(
    app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('vado.user_id',${f.customer.id},true)`);
      await tx.execute(
        sql`update location_addresses set user_id=${other.id} where id=${address.id}`,
      );
    }),
  ).rejects.toThrow();
  await expect(
    app.platformDb.execute(
      sql`update location_neighborhoods set district_id=${randomUUID()} where id=${geo.neighborhoodId}`,
    ),
  ).rejects.toThrow();
  await expect(app.db.execute(sql`update location_provinces set name='Bozuk'`)).rejects.toThrow();
  const forced = await app.db.many<{ relname: string; relforcerowsecurity: boolean }>(
    sql`select relname,relforcerowsecurity from pg_class where relname=any(${["location_addresses", "location_service_areas", "location_service_area_neighborhoods", "location_idempotency_keys"]}::text[])`,
  );
  expect(forced).toHaveLength(4);
  expect(forced.every((r) => r.relforcerowsecurity)).toBe(true);
});
it("ulusal katalog kurulum komutuyla tam yüklenir ve yeniden yükleme kimlikleri korur", async () => {
  const run = async () => {
    try {
      return {
        code: 0,
        ...(await promisify(execFile)(
          process.execPath,
          ["--import", "tsx", "src/cli/import-location.ts"],
          {
            env: {
              ...process.env,
              DATABASE_URL: app.config.databaseUrl,
              DATABASE_PLATFORM_URL: app.config.databasePlatformUrl,
              DATABASE_MIGRATE_URL: app.config.databaseMigrateUrl,
            },
          },
        )),
      };
    } catch (error) {
      return { code: 1, error };
    }
  };
  const firstImport = await run();
  expect(firstImport, JSON.stringify(firstImport)).toMatchObject({ code: 0 });
  const counts = await app.db.one<{ provinces: number; districts: number; neighborhoods: number }>(
    sql`select (select count(*) from location_provinces where source_id<>999001) as provinces,(select count(*) from location_districts where source_id<>999001) as districts,(select count(*) from location_neighborhoods where source_id<>999001) as neighborhoods`,
  );
  expect(counts).toEqual({ provinces: 81, districts: 973, neighborhoods: 73496 });
  const before = await app.db.many(
    sql`select id,source_id,district_id,name,full_official_name from location_neighborhoods order by source_id`,
  );
  expect(await run()).toMatchObject({ code: 0 });
  expect(
    await app.db.many(
      sql`select id,source_id,district_id,name,full_official_name from location_neighborhoods order by source_id`,
    ),
  ).toEqual(before);
  const fallback = await app.db.one<{ count: number }>(
    sql`select count(*) from location_neighborhoods where source_id<>999001 and name=full_official_name`,
  );
  expect(fallback.count).toBeGreaterThanOrEqual(12299);
}, 60000);
it("teslimat tüketicisi kendi müşteri kapsamında yalnız eşleşen etkin şube bölgelerini okuyabilir", async () => {
  const geo = await geography(),
    f = await createTenantFixture(app),
    other = await createTenantFixture(app),
    root = `/v1/business/${f.businessId}/branches/${f.branchId}/service-areas`;
  const area = await as(app, f.owner).ok(record, "POST", root, {
    body: { name: "Teslim alanı", neighborhoodIds: [geo.neighborhoodId] },
    headers: { "idempotency-key": randomUUID() },
  });
  expect(
    await app.services.location.findServiceAreas(f.customerScope, f.branchId, geo.neighborhoodId),
  ).toMatchObject([{ id: area.id, version: 1, neighborhoodIds: [geo.neighborhoodId] }]);
  await expect(
    app.services.location.findServiceAreas(other.customerScope, f.branchId, geo.neighborhoodId),
  ).rejects.toMatchObject({ code: "not_found" });
  await as(app, f.owner).ok(record, "POST", `${root}/${area.id}/disable`, {
    body: { expectedVersion: 1 },
    headers: { "idempotency-key": randomUUID() },
  });
  expect(
    await app.services.location.findServiceAreas(f.customerScope, f.branchId, geo.neighborhoodId),
  ).toEqual([]);
});
it("personel SQL ile bölge yazamaz ve bir işletmenin bölgesi başka şubeye bağlanamaz", async () => {
  const f = await createTenantFixture(app),
    other = await createTenantFixture(app),
    staff = await createUser(app, "Personel SQL");
  await scoped(app.db, f.businessId, (tx) =>
    tx.execute(
      sql`insert into business_members(business_id,user_id,role) values(${f.businessId},${staff.id},'staff')`,
    ),
  );
  await expect(
    scoped(app.db, f.businessId, async (tx) => {
      await tx.execute(sql`select set_config('vado.user_id',${staff.id},true)`);
      await tx.execute(
        sql`insert into location_service_areas(business_id,branch_id,name) values(${f.businessId},${f.branchId},'Yetkisiz')`,
      );
    }),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(
    scoped(app.db, f.businessId, async (tx) => {
      await tx.execute(sql`select set_config('vado.user_id',${f.owner.id},true)`);
      await tx.execute(
        sql`insert into location_service_areas(business_id,branch_id,name) values(${f.businessId},${other.branchId},'Yanlış şube')`,
      );
    }),
  ).rejects.toMatchObject({ code: "23503" });
});
const source = {
  repository: LOCATION_SOURCE,
  commit: LOCATION_COMMIT,
  license: "MIT",
  copyright: "Copyright (c) 2025 Onur Usluca",
  countryCode: "TR",
  retrievedAt: "2026-10-07",
};
it("ithalat yinelenen kimliği, eksik resmî adı ve sahte parent bağlantısını yazmadan reddeder", async () => {
  const valid = {
    source,
    provinces: [{ id: 999010, name: "İL", full_official_name: "İL" }],
    districts: [{ id: 999010, province_id: 999010, name: "İLÇE", full_official_name: "İLÇE" }],
    neighborhoods: [
      {
        id: 999010,
        province_id: 999010,
        district_id: 999010,
        name: null,
        full_official_name: "AYNI MAHALLESİ",
      },
      {
        id: 999011,
        province_id: 999010,
        district_id: 999010,
        name: null,
        full_official_name: "AYNI MAHALLESİ",
      },
    ],
  };
  for (const invalid of [
    { ...valid, neighborhoods: [valid.neighborhoods[0], valid.neighborhoods[0]] },
    { ...valid, neighborhoods: valid.neighborhoods.map((n) => ({ ...n, full_official_name: "" })) },
    { ...valid, neighborhoods: valid.neighborhoods.map((n) => ({ ...n, province_id: 123 })) },
  ])
    expect(() => validateLocationCatalog(invalid)).toThrow();
  await importLocationCatalog(app.platformDb, Buffer.from(JSON.stringify(valid)));
  const saved = await app.db.many<{ id: string; source_id: number; name: string }>(
    sql`select id,source_id,name from location_neighborhoods where source_id in(999010,999011) order by source_id`,
  );
  expect(saved.map((n) => n.source_id)).toEqual([999010, 999011]);
  expect(new Set(saved.map((n) => n.id)).size).toBe(2);
  expect(saved.every((n) => n.name === "AYNI MAHALLESİ")).toBe(true);
});
it("parent değişikliği ithalatın önceki isim yazılarını da atomik olarak geri alır", async () => {
  await geography();
  const invalid = {
    source,
    provinces: [
      { id: 999001, name: "DEĞİŞMEMELİ", full_official_name: "DEĞİŞMEMELİ" },
      { id: 999020, name: "YENİ", full_official_name: "YENİ" },
    ],
    districts: [
      { id: 999001, province_id: 999020, name: "İLÇE", full_official_name: "İLÇE" },
      { id: 999020, province_id: 999001, name: "YENİ İLÇE", full_official_name: "YENİ İLÇE" },
    ],
    neighborhoods: [
      {
        id: 999001,
        district_id: 999001,
        province_id: 999020,
        name: null,
        full_official_name: "MAHALLE",
      },
      {
        id: 999020,
        district_id: 999020,
        province_id: 999001,
        name: null,
        full_official_name: "YENİ MAHALLE",
      },
    ],
  };
  await expect(
    importLocationCatalog(app.platformDb, Buffer.from(JSON.stringify(invalid))),
  ).rejects.toThrow("parent");
  expect(await app.db.one(sql`select name from location_provinces where source_id=999001`)).toEqual(
    { name: "ÖRNEK İL" },
  );
  expect(await app.db.many(sql`select id from location_provinces where source_id=999020`)).toEqual(
    [],
  );
});
it("paketli ulusal verinin bütün kimlik, resmî ad ve parent bağları SQL ile kayıpsız eşleşir", async () => {
  const raw = gunzipSync(
    await readFile(new URL("../data/location/turkey-geo.json.gz", import.meta.url)),
  );
  await importLocationCatalog(app.platformDb, raw);
  const input: z.infer<ReturnType<typeof z.json>> = z
    .json()
    .parse(JSON.parse(raw.toString("utf8")));
  const mismatch = await app.db.one<{ count: number }>(
    sql`with source as (select ${JSON.stringify(input)}::jsonb as data) select count(*) from source,jsonb_to_recordset(source.data->'neighborhoods') as x(id integer,province_id integer,district_id integer,name text,full_official_name text) left join location_neighborhoods n on n.source_id=x.id left join location_districts d on d.id=n.district_id left join location_provinces p on p.id=d.province_id where n.id is null or n.name is distinct from coalesce(x.name,x.full_official_name) or n.full_official_name is distinct from x.full_official_name or d.source_id is distinct from x.district_id or p.source_id is distinct from x.province_id`,
  );
  expect(mismatch.count).toBe(0);
}, 30000);

it("adres işlemi geri alınırsa adres, tekrar, denetim ve olay birlikte kaybolur; yeniden deneme bir kez kesinleşir", async () => {
  const geo = await geography(),
    user = await createUser(app, "Geri alma alıcısı"),
    key = randomUUID();
  const body = {
    ...geo,
    label: "Ev",
    recipientName: "Geri alma alıcısı",
    phone: "+905551112233",
    addressLine: "Örnek sokak 12",
    door: "3",
    note: "Özel kapı notu",
  };
  let rolledBackId: string | null = null;
  await expect(
    app.db.transaction(async (tx) => {
      const address = await createLocationAddresses(tx).createAddress(user.id, key, body);
      rolledBackId = address.id;
      throw new Error("Deneme işlemi geri alındı.");
    }),
  ).rejects.toThrow("Deneme işlemi geri alındı.");
  expect(typeof rolledBackId).toBe("string");
  expect(
    await app.platformDb.many(sql`select id from location_addresses where id=${rolledBackId}`),
  ).toEqual([]);
  expect(
    await app.platformDb.many(
      sql`select key from location_idempotency_keys where user_id=${user.id} and key=${key}`,
    ),
  ).toEqual([]);
  expect(
    await app.platformDb.many(sql`select id from audit_log where target_id=${rolledBackId}`),
  ).toEqual([]);
  expect(
    await app.platformDb.many(
      sql`select id from platform_outbox_events where payload->>'addressId'=${rolledBackId}`,
    ),
  ).toEqual([]);
  const client = as(app, user),
    headers = { "idempotency-key": key };
  const address = await client.ok(record, "POST", "/v1/location/addresses", { body, headers });
  expect(await client.ok(record, "POST", "/v1/location/addresses", { body, headers })).toEqual(
    address,
  );
  expect(
    await app.platformDb.many(sql`select id from location_addresses where id=${address.id}`),
  ).toHaveLength(1);
  expect(
    await app.platformDb.many(
      sql`select key from location_idempotency_keys where user_id=${user.id} and key=${key}`,
    ),
  ).toHaveLength(1);
  expect(
    await app.platformDb.many(sql`select id from audit_log where target_id=${address.id}`),
  ).toHaveLength(1);
  const events = await app.platformDb.many<{ payload: unknown }>(
    sql`select payload from platform_outbox_events where payload->>'addressId'=${address.id}`,
  );
  expect(events).toHaveLength(1);
  expect(events[0]?.payload).toEqual({ addressId: address.id, version: 1 });
});
