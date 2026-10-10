import { randomUUID } from "node:crypto";

import { discoveryPageSchema, discoveryQuerySchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { createDeliveryFixture } from "./support/delivery-fixture";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";

/** S8: Sahip olunan adres, etkin teslimat bölgesi ve mağaza görünürlüğü. */
describe("S8: kayıtlı adrese teslimat keşfi", () => {
  let app: TestApp;
  let fixture: Awaited<ReturnType<typeof createDeliveryFixture>>;
  beforeAll(async () => {
    app = await startTestApp();
    fixture = await createDeliveryFixture(app);
  });
  afterAll(async () => {
    await app.stop();
  });

  const url = (addressId: string) =>
    `/v1/discovery/search?kind=business&q=Kapsam&deliveryAddressId=${addressId}`;

  it("sözleşme adresli aramayı işletmelerle sınırlar", () => {
    expect(
      discoveryQuerySchema.safeParse({ kind: "all", deliveryAddressId: randomUUID() }).success,
    ).toBe(false);
    expect(
      discoveryQuerySchema.safeParse({ kind: "miniapp", deliveryAddressId: randomUUID() }).success,
    ).toBe(false);
    expect(
      discoveryQuerySchema.safeParse({ kind: "business", deliveryAddressId: randomUUID() }).success,
    ).toBe(true);
  });

  it("müşterinin kendi adresindeki etkin teslimat şubesini ve güncel hizmet ücretini gösterir", async () => {
    const page = await fixture.client.ok(discoveryPageSchema, "GET", url(fixture.address.id));
    const matching = page.items.find(
      (item) => item.kind === "business" && item.business.id === fixture.businessId,
    );
    expect(matching?.kind).toBe("business");
    if (matching?.kind !== "business") throw new Error("İşletme bulunamadı");
    expect(matching.delivery).toMatchObject({
      branchId: fixture.branchId,
      feeMinor: 2000,
      minimumMinor: 10000,
      deliveryMinutes: 30,
    });
    expect(JSON.stringify(page)).not.toContain(fixture.address.phone);
    expect(JSON.stringify(page)).not.toContain(fixture.address.addressLine);
  });

  it("başka kullanıcı adresini ve rastgele adresi yetkisiz keşifte kullanamaz", async () => {
    const other = await createUser(app, "Yetkisiz konum isteyen");
    await as(app, other).fail("not_found", "GET", url(fixture.address.id));
    await fixture.client.fail("not_found", "GET", url(randomUUID()));
  });

  it("aynı ilçedeki komşu mahallenin adresini sırf yakın diye uygun saymaz", async () => {
    const district = await app.platformDb.one<{ district_id: string }>(
      sql`select district_id from location_neighborhoods where id=${fixture.address.neighborhoodId}`,
    );
    const newNeighborhood = await app.platformDb.one<{ id: string }>(
      sql`insert into location_neighborhoods(district_id,source_id,name,full_official_name)
        values(${district.district_id},${8_500_000 + Math.floor(Math.random() * 100_000)},
          'Diğer Mahalle','Diğer Mahalle') returning id`,
    );
    const anotherAddress = await app.services.location.createAddress(
      fixture.customer.id,
      randomUUID(),
      {
        countryId: fixture.address.countryId,
        provinceId: fixture.address.provinceId,
        districtId: fixture.address.districtId,
        neighborhoodId: newNeighborhood.id,
        label: "Diğer adres",
        recipientName: fixture.address.recipientName,
        phone: fixture.address.phone,
        addressLine: "Başka Sokak No: 12",
        door: "1",
        note: "",
      },
    );
    const page = await fixture.client.ok(discoveryPageSchema, "GET", url(anotherAddress.id));
    expect(
      page.items.some(
        (item) => item.kind === "business" && item.business.id === fixture.businessId,
      ),
    ).toBe(false);
  });

  it("adrese göre açılan sayfa imleci başka bir adresle yeniden kullanılamaz", async () => {
    const query = discoveryQuerySchema.parse({
      kind: "business",
      deliveryAddressId: fixture.address.id,
    });
    const { encodeDiscoveryCursor } = await import("../src/modules/discovery/discovery-cursor");
    const cursor = encodeDiscoveryCursor(query, {
      score: 0,
      nameKey: "kapsam işletmesi",
      kind: "business",
      recordId: fixture.businessId,
    });
    const second = await app.services.location.createAddress(fixture.customer.id, randomUUID(), {
      countryId: fixture.address.countryId,
      provinceId: fixture.address.provinceId,
      districtId: fixture.address.districtId,
      neighborhoodId: fixture.address.neighborhoodId,
      label: "İş",
      recipientName: fixture.address.recipientName,
      phone: fixture.address.phone,
      addressLine: "Ofis Sokak No: 3",
      door: "2",
      note: "",
    });
    const search = (addressId: string) =>
      `/v1/discovery/search?kind=business&deliveryAddressId=${addressId}&cursor=${encodeURIComponent(cursor)}`;
    // Kullanıcının kendi ikinci adresiyle bile imleç geçmez: imleç ilk adrese bağlıdır.
    await fixture.client.fail("validation_failed", "GET", search(second.id));
    // Başkasının ya da olmayan adres imleçten önce reddedilir; adresin varlığı sızdırılmaz.
    await fixture.client.fail("not_found", "GET", search(randomUUID()));
  });

  it("bölge devre dışı bırakılınca artık teslimata uygun göstermiyor", async () => {
    const region = `/v1/business/${fixture.businessId}/branches/${fixture.branchId}/delivery-regions/${fixture.area.id}`;
    const response = await fixture.ownerClient.request("PUT", region, {
      headers: { "idempotency-key": randomUUID() },
      body: {
        expectedVersion: 1,
        feeMinor: 2000,
        minimumMinor: 10000,
        deliveryMinutes: 30,
        active: false,
      },
    });
    expect(response.status).toBe(200);
    const page = await fixture.client.ok(discoveryPageSchema, "GET", url(fixture.address.id));
    expect(
      page.items.some(
        (item) => item.kind === "business" && item.business.id === fixture.businessId,
      ),
    ).toBe(false);
  });
});
