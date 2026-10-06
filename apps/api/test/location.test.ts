import { randomUUID } from "node:crypto";

import {
  customerAddressSchema,
  locationDistrictSchema,
  locationNeighborhoodSchema,
  locationProvinceSchema,
  locationServiceAreaSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app.stop();
});

async function seedLocation() {
  const suffix = randomUUID();
  const provinceId = `province-${suffix}`;
  const districtId = `district-${suffix}`;
  const neighborhoodId = `neighborhood-${suffix}`;
  await app.migrationDb.execute(sql`
    insert into location_provinces(id,name,slug)
    values(${provinceId},${`İl ${suffix}`},${`il-${suffix}`})
  `);
  await app.migrationDb.execute(sql`
    insert into location_districts(id,province_id,name,slug)
    values(${districtId},${provinceId},${`İlçe ${suffix}`},${`ilce-${suffix}`})
  `);
  await app.migrationDb.execute(sql`
    insert into location_neighborhoods(id,province_id,district_id,name,slug,postal_code)
    values(
      ${neighborhoodId},${provinceId},${districtId},
      ${`Mahalle ${suffix}`},${`mahalle-${suffix}`},'34000'
    )
  `);
  return { provinceId, districtId, neighborhoodId };
}

describe("Konum platform servisi", () => {
  test("il, ilçe ve mahalle referansı motorlardan bağımsız okunur", async () => {
    const f = await createTenantFixture(app);
    const location = await seedLocation();
    const client = as(app, f.customer);

    const provinces = await client.ok(
      z.object({ items: z.array(locationProvinceSchema) }),
      "GET",
      "/v1/locations/provinces",
    );
    expect(provinces.items.some((item) => item.id === location.provinceId)).toBe(true);

    const districts = await client.ok(
      z.object({ items: z.array(locationDistrictSchema) }),
      "GET",
      `/v1/locations/districts?provinceId=${encodeURIComponent(location.provinceId)}`,
    );
    expect(districts.items).toContainEqual(
      expect.objectContaining({ id: location.districtId, provinceId: location.provinceId }),
    );

    const neighborhoods = await client.ok(
      z.object({ items: z.array(locationNeighborhoodSchema) }),
      "GET",
      `/v1/locations/neighborhoods?provinceId=${encodeURIComponent(location.provinceId)}&districtId=${encodeURIComponent(location.districtId)}`,
    );
    expect(neighborhoods.items).toContainEqual(
      expect.objectContaining({
        id: location.neighborhoodId,
        districtId: location.districtId,
        postalCode: "34000",
      }),
    );
  });

  test("müşteri yalnız kendi adreslerini görür ve CAS sürümü uygulanır", async () => {
    const f = await createTenantFixture(app);
    const location = await seedLocation();
    const root = `/v1/shell/${f.businessId}/${f.instanceId}/addresses`;
    const client = as(app, f.customer);
    const created = await client.ok(customerAddressSchema, "POST", root, {
      body: {
        label: "Ev",
        provinceId: location.provinceId,
        districtId: location.districtId,
        neighborhoodId: location.neighborhoodId,
        addressLine: "Deneme Sokak No: 1",
        recipientName: "Müşteri",
        recipientPhone: "+905551112233",
      },
    });
    expect(created).toMatchObject({
      version: 1,
      businessCustomerId: f.customerScope.businessCustomerId,
    });

    const other = await createUser(app, "Başka müşteri");
    await app.services.businessManagement.customerScope(other.id, f.businessId, f.instanceId);
    expect(await as(app, other).request("GET", root)).toMatchObject({
      status: 200,
      body: { items: [] },
    });

    const updated = await client.ok(customerAddressSchema, "PUT", `${root}/${created.id}`, {
      body: {
        expectedVersion: created.version,
        label: "Ev 2",
        provinceId: location.provinceId,
        districtId: location.districtId,
        neighborhoodId: location.neighborhoodId,
        addressLine: "Deneme Sokak No: 2",
        recipientName: "Müşteri",
        recipientPhone: "+905551112233",
      },
    });
    expect(updated).toMatchObject({ label: "Ev 2", version: 2 });

    expect(
      await client.request("PUT", `${root}/${created.id}`, {
        body: {
          expectedVersion: 1,
          label: "Eski cihaz",
          provinceId: location.provinceId,
          districtId: location.districtId,
          neighborhoodId: location.neighborhoodId,
          addressLine: "Deneme Sokak No: 3",
          recipientName: "",
          recipientPhone: "",
        },
      }),
    ).toMatchObject({ status: 409, body: { error: { code: "settings_version_conflict" } } });
  });

  test("hizmet bölgesi şubeye bağlıdır; personel okur ama yönetemez", async () => {
    const f = await createTenantFixture(app);
    const location = await seedLocation();
    const root = `/v1/business/${f.businessId}/service-areas`;
    const owner = as(app, f.owner);
    const area = await owner.ok(locationServiceAreaSchema, "POST", root, {
      body: {
        branchId: f.branchId,
        name: "Merkez teslimat alanı",
        active: true,
        neighborhoodIds: [location.neighborhoodId],
      },
    });
    expect(area).toMatchObject({
      branchId: f.branchId,
      neighborhoodIds: [location.neighborhoodId],
      version: 1,
    });

    const staff = await createUser(app, "Konum personeli");
    await app.services.businessManagement.setMember(f.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    expect(await as(app, staff).request("GET", `${root}?branchId=${f.branchId}`)).toMatchObject({
      status: 200,
      body: { items: [{ id: area.id }] },
    });
    expect(
      await as(app, staff).request("POST", root, {
        body: {
          branchId: f.branchId,
          name: "Yetkisiz alan",
          active: true,
          neighborhoodIds: [location.neighborhoodId],
        },
      }),
    ).toMatchObject({ status: 403 });

    expect(
      await app.services.location.matchingServiceAreas(
        f.customerScope,
        f.branchId,
        location.neighborhoodId,
      ),
    ).toEqual([{ id: area.id, name: "Merkez teslimat alanı" }]);
  });

  test("Konum işletme tabloları FORCE RLS taşır ve işletmeler arasında sızmaz", async () => {
    const a = await createTenantFixture(app);
    const b = await createTenantFixture(app);
    const location = await seedLocation();
    const area = await app.services.location.createServiceArea(b.scope, {
      branchId: b.branchId,
      name: "B işletmesi",
      active: true,
      neighborhoodIds: [location.neighborhoodId],
    });

    const names = [
      "customer_addresses",
      "location_service_areas",
      "location_service_area_neighborhoods",
    ];
    const metadata = await app.db.many<{
      name: string;
      enabled: boolean;
      forced: boolean;
    }>(sql`
      select relname as name,relrowsecurity as enabled,relforcerowsecurity as forced
      from pg_class
      where relnamespace='public'::regnamespace and relname=any(${names}::text[])
      order by relname
    `);
    expect(metadata).toHaveLength(names.length);
    for (const row of metadata) expect(row).toMatchObject({ enabled: true, forced: true });

    expect(await app.db.many(sql`select * from location_service_areas`)).toEqual([]);
    await scoped(app.db, a.businessId, async (tx) => {
      expect(await tx.many(sql`select * from location_service_areas where id=${area.id}`)).toEqual(
        [],
      );
      expect(
        await tx.execute(sql`update location_service_areas set active=false where id=${area.id}`),
      ).toBe(0);
    });
    await expect(
      scoped(app.db, a.businessId, (tx) =>
        tx.execute(sql`
          insert into location_service_area_neighborhoods(
            business_id,service_area_id,province_id,district_id,neighborhood_id
          ) values(
            ${b.businessId},${area.id},${location.provinceId},${location.districtId},
            ${location.neighborhoodId}
          )
        `),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
