import { randomUUID } from "node:crypto";

import { cartSchema, type Category, orderSchema } from "@vado/contracts";
import { expect } from "vitest";

import { sql } from "../../src/core/database";
import { createCatalogFixture } from "./catalog-fixture";
import { as, type TestApp } from "./harness";
/** Restoran paketleri kapalı mağaza, sonraki kupon ve değerlendirme senaryolarının ortak örneğidir. */
export async function createDeliveryFixture(
  app: TestApp,
  restaurant = false,
  pricing: { amountMinor?: number; feeMinor?: number; minimumMinor?: number } = {},
  businessCategory: Category = "food",
) {
  const f = await createCatalogFixture(app, businessCategory);
  const owner = as(app, f.owner);
  if (pricing.amountMinor !== undefined)
    await app.services.catalog.savePrice(f.scope, f.itemId, {
      branchId: null,
      amountMinor: pricing.amountMinor,
      vatBasisPoints: 1000,
    });
  for (const capabilityId of [
    restaurant ? "ordering.kitchen" : "ordering.preparation",
    "ordering.delivery",
  ])
    expect(
      (
        await owner.request(
          "PUT",
          `/v1/business/${f.businessId}/app-instances/${f.instanceId}/capabilities/${capabilityId}`,
          { body: { version: "1.0.0", enabled: true, config: {} } },
        )
      ).status,
    ).toBe(200);
  await app.services.businessManagement.setHours(f.scope, f.branchId, {
    hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: 0, closesAt: 1440 })),
  });
  const country = await app.platformDb.one<{ id: string }>(
    sql`insert into location_countries(code,name) values('TR','Türkiye') on conflict(code) do update set name=excluded.name returning id`,
  );
  const province = await app.platformDb.one<{ id: string }>(
    sql`insert into location_provinces(source_id,country_id,name,full_official_name) values(777001,${country.id},'İL','İL') on conflict(source_id) do update set name=excluded.name returning id`,
  );
  const district = await app.platformDb.one<{ id: string }>(
    sql`insert into location_districts(source_id,province_id,name,full_official_name) values(777001,${province.id},'İLÇE','İLÇE') on conflict(source_id) do update set name=excluded.name returning id`,
  );
  const neighborhood = await app.platformDb.one<{ id: string }>(
    sql`insert into location_neighborhoods(source_id,district_id,name,full_official_name) values(777001,${district.id},'MAHALLE','MAHALLESİ') on conflict(source_id) do update set name=excluded.name returning id`,
  );
  await app.platformDb.execute(
    sql`insert into location_catalog_imports(source,version,sha256,counts) values('fixture','1',${"a".repeat(64)},'{"provinces":1,"districts":1,"neighborhoods":1}') on conflict(source) do nothing`,
  );
  const address = await app.services.location.createAddress(f.customer.id, randomUUID(), {
    countryId: country.id,
    provinceId: province.id,
    districtId: district.id,
    neighborhoodId: neighborhood.id,
    label: "Ev",
    recipientName: "Alıcı",
    phone: "+905551112233",
    addressLine: "Örnek Sokak 12",
    door: "3",
    note: "Zili çal",
  });
  const area = await app.services.location.createServiceArea(f.scope, f.branchId, randomUUID(), {
    name: "Merkez",
    neighborhoodIds: [neighborhood.id],
  });
  const settings = await owner.request(
    "PUT",
    `/v1/business/${f.businessId}/branches/${f.branchId}/delivery-regions/${area.id}`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: {
        expectedVersion: 0,
        feeMinor: pricing.feeMinor ?? 2000,
        minimumMinor: pricing.minimumMinor ?? 10000,
        deliveryMinutes: 30,
        active: true,
      },
    },
  );
  expect(settings.status).toBe(200);
  const client = as(app, f.customer),
    root = `/v1/shell/${f.businessId}/${f.instanceId}`;
  const opened = await client.ok(cartSchema, "POST", `${root}/carts`, {
    body: { branchId: f.branchId, fulfilment: "delivery", addressId: address.id },
  });
  const cart = await client.ok(cartSchema, "PUT", `${root}/carts/${opened.id}`, {
    body: {
      expectedVersion: opened.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
    },
  });
  expect(cart.totalMinor).toBe((pricing.amountMinor ?? 10000) + (pricing.feeMinor ?? 2000));
  return { ...f, client, ownerClient: owner, root, cart, address, area };
}
export async function checkoutDelivery(app: TestApp, restaurant = false) {
  const f = await createDeliveryFixture(app, restaurant);
  const order = await f.client.ok(orderSchema, "POST", `${f.root}/carts/${f.cart.id}/checkout`, {
    headers: { "idempotency-key": randomUUID() },
    body: {
      cartVersion: f.cart.version,
      seenTotalMinor: f.cart.totalMinor,
      quoteHash: f.cart.quoteHash,
    },
  });
  return { ...f, order };
}
