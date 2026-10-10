import { randomUUID } from "node:crypto";

import { courierJobSchema, courierMemberSchema, orderSchema } from "@vado/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";

import { recordAudit } from "../src/core/audit";
import { sql } from "../src/core/database";
import { createDeliveryFixture } from "./support/delivery-fixture";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(() => app.stop());
it("rezervasyon ve ödenmiş teslim tamamlanma kancaları asıl işlemde bir kez çalışır", async () => {
  expect(app.services).toHaveProperty("orderingLifecycle");
  const f = await createDeliveryFixture(app);
  const unregister = app.services.orderingLifecycle.register("test.delivery", {
    reserve: async (tx, event) => {
      await recordAudit(tx, {
        actor: event.userId ?? "system",
        action: "test.reserved",
        targetType: "order",
        targetId: event.orderId,
      });
    },
    complete: async (tx, event) => {
      await recordAudit(tx, {
        actor: event.userId ?? "system",
        action: "test.completed",
        targetType: "order",
        targetId: event.orderId,
      });
    },
  });
  try {
    const key = randomUUID(),
      body = {
        cartVersion: f.cart.version,
        seenTotalMinor: f.cart.totalMinor,
        quoteHash: f.cart.quoteHash,
      };
    const order = await f.client.ok(orderSchema, "POST", `${f.root}/carts/${f.cart.id}/checkout`, {
      headers: { "idempotency-key": key },
      body,
    });
    await f.client.ok(orderSchema, "POST", `${f.root}/carts/${f.cart.id}/checkout`, {
      headers: { "idempotency-key": key },
      body,
    });
    const courier = await createUser(app, "Kanca kuryesi"),
      owner = as(app, f.owner),
      member = await owner.ok(
        courierMemberSchema,
        "POST",
        `/v1/business/${f.businessId}/couriers`,
        {
          headers: { "idempotency-key": randomUUID() },
          body: { userId: courier.id, expectedVersion: 0, active: true },
        },
      );
    let job = await owner.ok(
      courierJobSchema,
      "PUT",
      `/v1/business/${f.businessId}/orders/${order.id}/delivery-assignment`,
      {
        headers: { "idempotency-key": randomUUID() },
        body: { memberId: member.id, expectedVersion: 0, expectedOrderVersion: 1 },
      },
    );
    let current = await app.services.ordering.updateStatus(f.scope, order.id, {
      expectedVersion: 1,
      status: "accepted",
    });
    current = await app.services.ordering.updateStatus(f.scope, order.id, {
      expectedVersion: current.version,
      status: "preparing",
    });
    current = await app.services.ordering.updateStatus(f.scope, order.id, {
      expectedVersion: current.version,
      status: "ready",
    });
    const client = as(app, courier),
      root = `/v1/courier/${f.businessId}/jobs/${job.id}`;
    job = await client.ok(courierJobSchema, "POST", `${root}/depart`, {
      headers: { "idempotency-key": randomUUID() },
      body: { expectedVersion: job.version, expectedOrderVersion: current.version },
    });
    await client.ok(courierJobSchema, "POST", `${root}/payment`, {
      headers: { "idempotency-key": randomUUID() },
      body: {
        expectedVersion: job.version,
        expectedPaymentVersion: 0,
        method: "card",
        reference: "POS-001",
      },
    });
    await client.ok(courierJobSchema, "POST", `${root}/deliver`, {
      headers: { "idempotency-key": randomUUID() },
      body: { expectedVersion: job.version, expectedOrderVersion: job.orderVersion },
    });
    expect(
      await app.platformDb.many(
        sql`select action from audit_log where target_id=${order.id} and action like 'test.%' order by action`,
      ),
    ).toEqual([{ action: "test.completed" }, { action: "test.reserved" }]);
  } finally {
    unregister();
  }
});
it("başarısız rezervasyon kancası sipariş ve tekrar yanıtını geri alır", async () => {
  const f = await createDeliveryFixture(app);
  const unregister = app.services.orderingLifecycle.register("test.rollback", {
    reserve: () => Promise.reject(new Error("Kanca işlemi durdurdu")),
  });
  try {
    expect(
      (
        await f.client.request("POST", `${f.root}/carts/${f.cart.id}/checkout`, {
          headers: { "idempotency-key": randomUUID() },
          body: {
            cartVersion: f.cart.version,
            seenTotalMinor: f.cart.totalMinor,
            quoteHash: f.cart.quoteHash,
          },
        })
      ).status,
    ).toBe(500);
    expect(
      await app.platformDb.many(sql`select id from orders where business_id=${f.businessId}`),
    ).toEqual([]);
    expect(
      await app.platformDb.many(
        sql`select id from idempotency_keys where business_id=${f.businessId}`,
      ),
    ).toEqual([]);
  } finally {
    unregister();
  }
});
