import { businessSocketTicketSchema, kitchenDeviceInfoSchema, orderSchema } from "@vado/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { anonymous, as, startTestApp, type TestApp } from "./support/harness";
import { createRestaurantFixture } from "./support/restaurant-fixture";
import { scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});
async function pair() {
  const f = await createRestaurantFixture(app);
  const challenge = await anonymous(app).ok(
    z.object({ id: z.uuid(), code: z.string(), secret: z.string() }),
    "POST",
    "/v1/kitchen-pairings",
    { body: {} },
  );
  const approved = await as(app, f.owner).ok(
    z.object({ id: z.uuid() }),
    "POST",
    `/v1/business/${f.businessId}/kitchen-devices`,
    {
      body: {
        code: challenge.code,
        label: "Mutfak tableti",
        branchId: f.branchId,
        appInstanceId: f.instanceId,
      },
    },
  );
  const polled = await anonymous(app).ok(
    z.object({ status: z.literal("approved"), token: z.string() }),
    "POST",
    `/v1/kitchen-pairings/${challenge.id}/poll`,
    { body: { secret: challenge.secret } },
  );
  const client = (method: "GET" | "POST" | "PUT", path: string, body?: unknown) =>
    anonymous(app).request(method, path, {
      body,
      headers: { authorization: `Bearer ${polled.token}` },
    });
  return { ...f, challenge, deviceId: approved.id, token: polled.token, client };
}
it("ortak tablet kişisel hesap olmadan yalnız kendi mutfağını okur ve karar verir", async () => {
  const f = await pair();
  const other = await createRestaurantFixture(app);
  const list = await f.client("GET", "/v1/kitchen/orders");
  expect(list).toMatchObject({ status: 200, body: { items: [{ id: f.order.id }] } });
  expect(await f.client("GET", `/v1/kitchen/orders/${other.order.id}`)).toMatchObject({
    status: 404,
  });
  expect(await f.client("GET", `/v1/business/${f.businessId}/catalog`)).toMatchObject({
    status: 401,
  });
  const accepted = await f.client("POST", `/v1/kitchen/orders/${f.order.id}/accept`, {
    expectedVersion: 1,
    preparationMinutes: 20,
  });
  expect(accepted.status).toBe(200);
  expect(orderSchema.parse(accepted.body).history.at(-1)?.actorKind).toBe("device");
  expect(
    await f.client("POST", `/v1/business/${f.businessId}/orders/${f.order.id}/payment`, {
      expectedPaymentVersion: 0,
      place: "counter",
      method: "cash",
    }),
  ).toMatchObject({ status: 401 });
});
it("eşleştirme tek kullanılır, yalnız yönetici onaylar, yanlış yoklama sırrı kilitlenir", async () => {
  const f = await pair();
  expect(
    await as(app, f.owner).request("POST", `/v1/business/${f.businessId}/kitchen-devices`, {
      body: {
        code: f.challenge.code,
        label: "İkinci",
        branchId: f.branchId,
        appInstanceId: f.instanceId,
      },
    }),
  ).toMatchObject({ status: 409 });
  const pending = await anonymous(app).ok(
    z.object({ id: z.uuid(), secret: z.string() }),
    "POST",
    "/v1/kitchen-pairings",
    { body: {} },
  );
  for (let i = 0; i < 5; i++)
    expect(
      await anonymous(app).request("POST", `/v1/kitchen-pairings/${pending.id}/poll`, {
        body: { secret: "a".repeat(43) },
      }),
    ).toMatchObject({ status: 401 });
  expect(
    await anonymous(app).request("POST", `/v1/kitchen-pairings/${pending.id}/poll`, {
      body: { secret: pending.secret },
    }),
  ).toMatchObject({ status: 401 });
  expect(await app.db.many(sql`select id from kitchen_pairings`)).toEqual([]);
});
it("cihaz kapatılınca bütün uçları ve daha önce verilmiş soket bileti geçersiz olur", async () => {
  const f = await pair();
  const ticket = businessSocketTicketSchema.parse(
    (await f.client("POST", "/v1/kitchen/socket-ticket", {})).body,
  );
  expect(
    await as(app, f.owner).request(
      "POST",
      `/v1/business/${f.businessId}/kitchen-devices/${f.deviceId}/revoke`,
      { body: {} },
    ),
  ).toMatchObject({ status: 200 });
  expect(await f.client("GET", "/v1/kitchen/orders")).toMatchObject({ status: 401 });
  await expect(app.services.kitchenDevices.consumeTicket(ticket.ticket)).rejects.toMatchObject({
    code: "unauthorized",
  });
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(
        sql`update kitchen_devices set revoked_at=null where business_id=${f.businessId} and id=${f.deviceId}`,
      ),
    ),
  ).rejects.toMatchObject({ code: "23514" });
});

it("önceden doğrulanmış cihaz kapsamı işletme askıya alındıktan sonra işlem yapamaz", async () => {
  const f = await pair();
  const scope = await app.services.kitchenDevices.authenticate(f.token);
  await app.migrationDb.execute(
    sql`update businesses set status='suspended' where id=${f.businessId}`,
  );
  await expect(app.services.ordering.getOrder(scope, f.order.id)).rejects.toMatchObject({
    code: "unauthorized",
  });
});

it("cihaz bilgisi kendi şube ve işletme adını taşır", async () => {
  const f = await pair();
  const response = await f.client("GET", "/v1/kitchen/device");
  expect(response.status).toBe(200);
  const info = kitchenDeviceInfoSchema.parse(response.body);
  expect(info).toMatchObject({ id: f.deviceId, businessId: f.businessId, branchId: f.branchId });
  expect(info.businessName.length).toBeGreaterThan(0);
  expect(info.branchName.length).toBeGreaterThan(0);
});
