import { randomUUID } from "node:crypto";

import { discoveryPageSchema, discoveryQuerySchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from "../src/modules/discovery/discovery-cursor";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { publishSample } from "./support/packages";

const base = { q: "IŞIK pilav", kind: "all" as const, limit: 20 };

describe("VADO Search sayfalama imleci", () => {
  it("sıralama ve arama bağlamına özgüdür", () => {
    const cursor = encodeDiscoveryCursor(base, { score: 2, nameKey: "isik pilav", kind: "business", recordId: randomUUID() });
    expect(decodeDiscoveryCursor({ ...base, cursor })?.score).toBe(2);
    expect(() => decodeDiscoveryCursor({ ...base, q: "başka", cursor })).toThrow();
    expect(() => decodeDiscoveryCursor({ ...base, kind: "miniapp", cursor })).toThrow();
    expect(() => decodeDiscoveryCursor({ ...base, provinceId: randomUUID(), cursor })).toThrow();
    expect(() => decodeDiscoveryCursor({ ...base, cursor: "gecersiz" })).toThrow();
  });

  it("sorgu, boyut ve imleç uzunluğunu sınırlar", () => {
    expect(discoveryQuerySchema.safeParse({ q: "x".repeat(81) }).success).toBe(false);
    expect(discoveryQuerySchema.safeParse({ limit: 41 }).success).toBe(false);
    expect(discoveryQuerySchema.safeParse({ cursor: "x".repeat(513) }).success).toBe(false);
    expect(discoveryQuerySchema.safeParse({ districtId: randomUUID() }).success).toBe(false);
  });
});

describe("VADO Search: bütün katalogda sunucu araması", () => {
  let app: TestApp;
  let token: Awaited<ReturnType<typeof createUser>>;
  const prefix = `Kesif${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  let miniAppId: string;
  const nearbyProvinceId = randomUUID();
  const nearbyDistrictId = randomUUID();
  const distantDistrictId = randomUUID();

  beforeAll(async () => {
    app = await startTestApp();
    token = await createUser(app, "Keşif müşterisi");
    const entries = Array.from({ length: 205 }, (_, index) => `${prefix} Pilav ${String(index).padStart(2, "0")}`);
    await app.db.transaction(async (tx) => {
      for (const [index, name] of entries.entries()) {
        await tx.execute(sql`
          insert into businesses(owner_id, name, slug, category, description, city, verified, status)
          values (${token.id}, ${name}, ${`${prefix.toLowerCase()}-${index}`}, 'food', 'Pilav restoran', 'İstanbul', true, 'active')
        `);
      }
      await tx.execute(sql`
        insert into businesses(owner_id, name, slug, category, city, verified, status)
        values (${token.id}, ${`${prefix} Gizli`}, ${`${prefix.toLowerCase()}-gizli`}, 'food', 'İstanbul', false, 'active')
      `);
    });
    const release = await publishSample(app);
    miniAppId = release.miniApp.id;
    await app.db.execute(sql`update mini_apps set name = ${`${prefix} Uygulama`} where id = ${miniAppId}`);
    // Aynı şehirdeki iki ayrı ilçeyi ayırır; serbest adres metni yerel sonuç sayılmaz.
    await app.platformDb.transaction(async (tx) => {
      await tx.execute(sql`insert into location_countries(code,name) values('TR','Türkiye') on conflict(code) do nothing`);
      const country = await tx.one<{ id: string }>(sql`select id from location_countries where code='TR'`);
      await tx.execute(sql`insert into location_provinces(id,country_id,source_id,name,full_official_name)
        values(${nearbyProvinceId},${country.id},${2_100_000 + Math.floor(Math.random() * 200_000)},'İstanbul','İstanbul')`);
      await tx.execute(sql`insert into location_districts(id,province_id,source_id,name,full_official_name)
        values(${nearbyDistrictId},${nearbyProvinceId},${2_300_000 + Math.floor(Math.random() * 200_000)},'Yakın İlçe','Yakın İlçe')`);
      await tx.execute(sql`insert into location_districts(id,province_id,source_id,name,full_official_name)
        values(${distantDistrictId},${nearbyProvinceId},${2_500_000 + Math.floor(Math.random() * 200_000)},'Uzak İlçe','Uzak İlçe')`);
    });
    const sample = await app.db.many<{ id: string }>(sql`
      select id from businesses where name like ${prefix + ' Pilav %'} order by name limit 2
    `);
    for (const [i, value] of sample.entries()) {
      await app.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('vado.business_id', ${value.id}, true)`);
        await tx.execute(sql`insert into branches(business_id,name,province_id,district_id)
          values(${value.id},'Merkez',${nearbyProvinceId},${i === 0 ? nearbyDistrictId : distantDistrictId})`);
      });
    }
  });
  afterAll(async () => { await app.stop(); });

  it("Keşfet ana ekranı için işletme ve mini uygulama önizlemeleri ayrı, sınırlı sayfalardır", async () => {
    const client = as(app, token);
    const businesses = await client.ok(discoveryPageSchema, "GET", "/v1/discovery/search?kind=business&limit=6");
    const miniApps = await client.ok(discoveryPageSchema, "GET", "/v1/discovery/search?kind=miniapp&limit=6");
    expect(businesses.items.length).toBeLessThanOrEqual(6);
    expect(miniApps.items.length).toBeLessThanOrEqual(6);
    expect(businesses.items.every((item) => item.kind === "business")).toBe(true);
    expect(miniApps.items.every((item) => item.kind === "miniapp")).toBe(true);
  });

  it("ilçe seçimi yalnız yerel şubeleri gösterir, global mini uygulamayı saklamaz", async () => {
    const client = as(app, token);
    const url = `/v1/discovery/search?q=${prefix}&provinceId=${nearbyProvinceId}&districtId=${nearbyDistrictId}`;
    const page = await client.ok(discoveryPageSchema, "GET", url);
    expect(page.items.filter((item) => item.kind === "business")).toHaveLength(1);
    expect(page.items.some((item) => item.kind === "miniapp" && item.miniApp.id === miniAppId)).toBe(true);
    await client.fail("validation_failed", "GET",
      `/v1/discovery/search?districtId=${nearbyDistrictId}`);
  });

  it("200 kayıt üstüne çıkabilen birleşik anahtar sayfalama yapar ve gizli kayıtları göstermez", async () => {
    const client = as(app, token);
    const ids: string[] = [];
    let cursor: string | null = null;
    let loops = 0;
    do {
      const url = `/v1/discovery/search?q=${prefix}&limit=40${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`;
      const page = await client.ok(discoveryPageSchema, "GET", url);
      ids.push(...page.items.map((item) => item.kind === "business" ? item.business.id : item.miniApp.id));
      cursor = page.nextCursor;
      loops += 1;
      expect(loops).toBeLessThan(10);
    } while (cursor !== null);
    expect(ids).toHaveLength(206);
    expect(new Set(ids).size).toBe(206);
    expect(ids).toContain(miniAppId);
    const filtered = await client.ok(discoveryPageSchema, "GET", `/v1/discovery/search?q=${prefix}&kind=miniapp`);
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.kind).toBe("miniapp");
    const wrongCategory = await client.ok(discoveryPageSchema, "GET",
      `/v1/discovery/search?q=${prefix}&category=health`);
    expect(wrongCategory.items).toHaveLength(0);
    const literalWildcard = await client.ok(discoveryPageSchema, "GET",
      `/v1/discovery/search?q=${prefix}%25`);
    expect(literalWildcard.items).toHaveLength(0);
    await client.fail("validation_failed", "GET", `/v1/discovery/search?q=wrong&cursor=${encodeURIComponent(encodeDiscoveryCursor({ q: prefix, kind: "all", limit: 20 }, { score: 0, nameKey: "a", kind: "business", recordId: randomUUID() }))}`);
  });
});
