import { randomUUID } from "node:crypto";

import {
  bookingCatalogSchema,
  bookingListSchema,
  bookingResourceSchema,
  bookingSchema,
  bookingServiceSchema,
  bookingSlotsPageSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture } from "./support/tenant-fixture";

/** Veritabanı açıkken paralel istek, müşteri izolasyonu ve geri alma kanıtı. */
describe("S11 VADO Booking çekirdeği", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("hizmet ve kaynak ayarlarını yönetir; aynı saati başka müşteriye satmaz", async () => {
    const fixture = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const customer = as(app, fixture.customer);
    const other = as(app, await createUser(app, "İkinci müşteri"));
    const businessRoot = `/v1/business/${fixture.businessId}/bookings`;
    const publicRoot = `/v1/businesses/${fixture.businessId}`;
    const resource = await owner.ok(bookingResourceSchema, "POST", `${businessRoot}/resources`, {
      body: { branchId: fixture.branchId, name: "Koltuk A", active: true },
    });
    const service = await owner.ok(bookingServiceSchema, "POST", `${businessRoot}/services`, {
      body: {
        branchId: fixture.branchId,
        name: "Saç kesimi",
        durationMinutes: 30,
        priceMinor: 40000,
        active: true,
      },
    });
    const hours = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      opensAt: 540,
      closesAt: 1260,
    }));
    expect(
      (
        await owner.request("PUT", `${businessRoot}/resources/${resource.id}/hours`, {
          body: { hours },
        })
      ).status,
    ).toBe(200);
    const catalog = await customer.ok(bookingCatalogSchema, "GET", `${publicRoot}/booking/catalog`);
    expect(catalog.services.some((s) => s.id === service.id)).toBe(true);
    expect(catalog.resources.some((r) => r.id === resource.id)).toBe(true);

    const nextDay = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(Date.now() + 3 * 86_400_000));
    const query = `?branchId=${fixture.branchId}&serviceId=${service.id}&resourceId=${resource.id}&day=${nextDay}`;
    const slots = await customer.ok(
      bookingSlotsPageSchema,
      "GET",
      `${publicRoot}/booking/slots${query}`,
    );
    expect(slots.items.length).toBeGreaterThan(0);
    const chosen = slots.items[0];
    if (chosen === undefined) throw new Error("Rezervasyon saati yok");
    const body = {
      branchId: fixture.branchId,
      serviceId: service.id,
      resourceId: resource.id,
      startsAt: chosen.startsAt,
      seenPriceMinor: 40000,
      seenDurationMinutes: 30,
      requestKey: randomUUID(),
    };
    // Yeni rezervasyon 201 döner; aynı istek anahtarıyla tekrar aynı yanıtı verir.
    const created = await customer.request("POST", `${publicRoot}/bookings`, { body });
    expect(created.status).toBe(201);
    const confirmed = bookingSchema.parse(created.body);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.priceMinor).toBe(40000);
    const repeated = await customer.request("POST", `${publicRoot}/bookings`, { body });
    expect(repeated.status).toBe(201);
    const replay = bookingSchema.parse(repeated.body);
    expect(replay.id).toBe(confirmed.id);
    await customer.fail("idempotency_conflict", "POST", `${publicRoot}/bookings`, {
      body: {
        ...body,
        requestKey: body.requestKey,
        startsAt: slots.items[1]?.startsAt ?? chosen.startsAt,
      },
    });
    const otherSlots = await other.ok(
      bookingSlotsPageSchema,
      "GET",
      `${publicRoot}/booking/slots${query}`,
    );
    expect(otherSlots.items.some((s) => s.startsAt === chosen.startsAt)).toBe(false);
    await other.fail("record_version_conflict", "POST", `${publicRoot}/bookings`, {
      body: { ...body, requestKey: randomUUID() },
    });
    const list = await other.ok(bookingListSchema, "GET", `${publicRoot}/bookings/mine`);
    expect(list.items).toEqual([]);
    await other.fail("not_found", "PUT", `${publicRoot}/bookings/${confirmed.id}/status`, {
      body: { status: "cancelled", expectedVersion: 1 },
    });
    const cancelled = await customer.ok(
      bookingSchema,
      "PUT",
      `${publicRoot}/bookings/${confirmed.id}/status`,
      {
        body: { status: "cancelled", expectedVersion: 1 },
      },
    );
    expect(cancelled.version).toBe(2);
    const reopened = await other.ok(
      bookingSlotsPageSchema,
      "GET",
      `${publicRoot}/booking/slots${query}`,
    );
    expect(reopened.items.some((s) => s.startsAt === chosen.startsAt)).toBe(true);
    const taken = await other.request("POST", `${publicRoot}/bookings`, {
      body: { ...body, requestKey: randomUUID() },
    });
    expect(taken.status).toBe(201);
    const next = bookingSchema.parse(taken.body);
    expect(next.customerUserId).not.toBe(confirmed.customerUserId);
    expect(
      (await owner.ok(bookingListSchema, "GET", businessRoot)).items.some((b) => b.id === next.id),
    ).toBe(true);
    // İki gerçek HTTP isteği aynı serbest saati eşzamanlı almayı denediğinde
    // yalnız biri başarılı olmalıdır; rezervasyon verileri paylaşılmaz.
    const openAgain = await customer.ok(
      bookingSlotsPageSchema,
      "GET",
      `${publicRoot}/booking/slots${query}`,
    );
    const target = openAgain.items[0];
    if (target === undefined) throw new Error("Paralel test için müsait saat yok");
    const third = as(app, await createUser(app, "Üçüncü müşteri"));
    const fourth = as(app, await createUser(app, "Dördüncü müşteri"));
    const contention = { ...body, startsAt: target.startsAt };
    const responses = await Promise.all([
      third.request("POST", `${publicRoot}/bookings`, {
        body: { ...contention, requestKey: randomUUID() },
      }),
      fourth.request("POST", `${publicRoot}/bookings`, {
        body: { ...contention, requestKey: randomUUID() },
      }),
    ]);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(1);
    await owner.ok(bookingServiceSchema, "PUT", `${businessRoot}/services/${service.id}`, {
      body: {
        branchId: fixture.branchId,
        name: "Saç kesimi",
        durationMinutes: 30,
        priceMinor: 50000,
        active: true,
      },
    });
    const changed = await customer.ok(
      bookingSlotsPageSchema,
      "GET",
      `${publicRoot}/booking/slots${query}`,
    );
    const newTarget = changed.items[0];
    if (newTarget === undefined) throw new Error("Fiyat testi için müsait saat yok");
    await customer.fail("record_version_conflict", "POST", `${publicRoot}/bookings`, {
      body: { ...body, startsAt: newTarget.startsAt, requestKey: randomUUID() },
    });
  });
  it("hatalı saat ve hizmet sözleşmelerini reddeder", () => {
    expect(
      bookingServiceSchema.safeParse({
        id: randomUUID(),
        branchId: randomUUID(),
        name: "X",
        durationMinutes: 19,
        priceMinor: -1,
        active: true,
      }).success,
    ).toBe(false);
  });
});
