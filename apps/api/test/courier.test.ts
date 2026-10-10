import { randomUUID } from "node:crypto";

import { cartSchema, orderSchema } from "@vado/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { checkoutDelivery, createDeliveryFixture } from "./support/delivery-fixture";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { scoped } from "./support/tenant-fixture";
let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});
const row = z.looseObject({ id: z.uuid(), version: z.number() });
it("kurye yalnız etkin atamasının alıcısını görür ve nakit tahsil ederek teslim eder", async () => {
  const f = await checkoutDelivery(app),
    courier = await createUser(app, "Kurye"),
    other = await createUser(app, "Diğer kurye");
  const endpoint = `/v1/business/${f.businessId}/couriers`,
    owner = as(app, f.owner);
  const member = await owner.ok(row, "POST", endpoint, {
    headers: { "idempotency-key": randomUUID() },
    body: { userId: courier.id, expectedVersion: 0, active: true },
  });
  const second = await owner.ok(row, "POST", endpoint, {
    headers: { "idempotency-key": randomUUID() },
    body: { userId: other.id, expectedVersion: 0, active: true },
  });
  const assignRoot = `/v1/business/${f.businessId}/orders/${f.order.id}/delivery-assignment`;
  let job = await owner.ok(row, "PUT", assignRoot, {
    headers: { "idempotency-key": randomUUID() },
    body: { memberId: member.id, expectedVersion: 0, expectedOrderVersion: 1 },
  });
  const client = as(app, courier),
    jobRoot = `/v1/courier/${f.businessId}/jobs/${job.id}`;
  expect(
    await client.ok(z.looseObject({ contact: z.object({ phone: z.string() }) }), "GET", jobRoot),
  ).toMatchObject({ contact: { phone: f.address.phone } });
  await client.fail("forbidden", "GET", `/v1/business/${f.businessId}/orders`);
  await client.fail("forbidden", "GET", `/v1/business/${f.businessId}/members`);
  for (const [table, query] of [
    ["orders", sql`select * from orders`],
    ["order_lines", sql`select * from order_lines`],
    ["outbox_events", sql`select * from outbox_events`],
    ["idempotency_keys", sql`select * from idempotency_keys`],
    ["business_customers", sql`select * from business_customers`],
  ] as const) {
    const found = await scoped(app.db, f.businessId, async (tx) => {
      await tx.execute(sql`select set_config('vado.user_id',${courier.id},true)`);
      return tx.many(query);
    });
    expect(found, table).toEqual([]);
  }
  job = await owner.ok(row, "PUT", assignRoot, {
    headers: { "idempotency-key": randomUUID() },
    body: { memberId: second.id, expectedVersion: job.version, expectedOrderVersion: 1 },
  });
  await client.fail("not_found", "GET", jobRoot);
  const ready = await app.services.ordering.updateStatus(f.scope, f.order.id, {
    expectedVersion: 1,
    status: "accepted",
  });
  const preparing = await app.services.ordering.updateStatus(f.scope, f.order.id, {
    expectedVersion: ready.version,
    status: "preparing",
  });
  const prepared = await app.services.ordering.updateStatus(f.scope, f.order.id, {
    expectedVersion: preparing.version,
    status: "ready",
  });
  const secondClient = as(app, other);
  job = await secondClient.ok(row, "POST", `${jobRoot}/depart`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: job.version, expectedOrderVersion: prepared.version },
  });
  expect(job.status).toBe("in_transit");
  const paymentKey = randomUUID(),
    payment = {
      expectedVersion: job.version,
      expectedPaymentVersion: 0,
      method: "cash",
      reference: "NAKIT-123",
    };
  expect(
    (
      await secondClient.request("POST", `${jobRoot}/payment`, {
        headers: { "idempotency-key": paymentKey },
        body: payment,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await secondClient.request("POST", `${jobRoot}/payment`, {
        headers: { "idempotency-key": paymentKey },
        body: payment,
      })
    ).status,
  ).toBe(200);
  const paid = await app.services.ordering.getOrder(f.scope, f.order.id);
  expect(paid).toHaveProperty("payment");
  expect(paid.payment).toMatchObject({
    method: "cash",
    place: "delivery",
    reference: "NAKIT-123",
    memberId: second.id,
  });
  const deliveryKey = randomUUID(),
    deliveryBody = { expectedVersion: job.version, expectedOrderVersion: paid.version };
  const done = await secondClient.ok(row, "POST", `${jobRoot}/deliver`, {
    headers: { "idempotency-key": deliveryKey },
    body: deliveryBody,
  });
  expect(done.status).toBe("completed");
  await secondClient.fail("not_found", "GET", jobRoot);
  expect(
    await secondClient.ok(row, "POST", `${jobRoot}/deliver`, {
      headers: { "idempotency-key": deliveryKey },
      body: deliveryBody,
    }),
  ).toEqual(done);
  await secondClient.fail("not_found", "POST", `${jobRoot}/depart`, {
    headers: { "idempotency-key": randomUUID() },
    body: deliveryBody,
  });
  await owner.ok(row, "POST", endpoint, {
    headers: { "idempotency-key": randomUUID() },
    body: { userId: other.id, expectedVersion: second.version, active: false },
  });
  await secondClient.fail("forbidden", "POST", `${jobRoot}/deliver`, {
    headers: { "idempotency-key": deliveryKey },
    body: deliveryBody,
  });
  expect((await app.services.ordering.getOrder(f.scope, f.order.id)).status).toBe("completed");
});
async function assigned() {
  const f = await checkoutDelivery(app),
    courier = await createUser(app, "Yetkili kurye"),
    owner = as(app, f.owner);
  const member = await owner.ok(row, "POST", `/v1/business/${f.businessId}/couriers`, {
    headers: { "idempotency-key": randomUUID() },
    body: { userId: courier.id, expectedVersion: 0, active: true },
  });
  const assignment = `/v1/business/${f.businessId}/orders/${f.order.id}/delivery-assignment`;
  const job = await owner.ok(row, "PUT", assignment, {
    headers: { "idempotency-key": randomUUID() },
    body: { memberId: member.id, expectedVersion: 0, expectedOrderVersion: 1 },
  });
  return {
    ...f,
    courier,
    member,
    job,
    assignment,
    ownerClient: owner,
    courierClient: as(app, courier),
    jobRoot: `/v1/courier/${f.businessId}/jobs/${job.id}`,
  };
}
it("kurye üyeliği kapatılınca eski kapsam, telefon ve sipariş tekrar yanıtı kapanır", async () => {
  const f = await assigned(),
    scope = await app.services.courier.authorise(f.courier.id, f.businessId);
  await f.ownerClient.ok(row, "POST", `/v1/business/${f.businessId}/couriers`, {
    headers: { "idempotency-key": randomUUID() },
    body: { userId: f.courier.id, expectedVersion: f.member.version, active: false },
  });
  await f.courierClient.fail("forbidden", "GET", f.jobRoot);
  await expect(app.services.courier.job(scope, f.job.id)).rejects.toMatchObject({
    code: "forbidden",
  });
  await scoped(app.db, f.businessId, async (tx) => {
    await tx.execute(sql`select set_config('vado.user_id',${f.courier.id},true)`);
    expect(await tx.many(sql`select phone from users where id=${f.customer.id}`)).toEqual([]);
    expect(await tx.many(sql`select user_id from business_customers`)).toEqual([]);
    expect(await tx.many(sql`select response_body from idempotency_keys`)).toEqual([]);
    expect(await tx.many(sql`select snapshot from delivery_order_snapshots`)).toEqual([]);
    expect(
      (
        await tx.one<{ result: unknown }>(
          sql`select courier_read_job(${f.businessId},${f.job.id},true) as result`,
        )
      ).result,
    ).toBeNull();
  });
});
it("işletme sahibi askıya alınırsa kurye alıcıya erişemez", async () => {
  const f = await assigned();
  await app.platformDb.execute(sql`update users set status='suspended' where id=${f.owner.id}`);
  await f.courierClient.fail("forbidden", "GET", f.jobRoot);
  await scoped(app.db, f.businessId, async (tx) => {
    await tx.execute(sql`select set_config('vado.user_id',${f.courier.id},true)`);
    expect(
      (
        await tx.one<{ result: unknown }>(
          sql`select courier_read_job(${f.businessId},${f.job.id},true) as result`,
        )
      ).result,
    ).toBeNull();
  });
});
it("yirmi eşzamanlı atama yalnız bir sürümü kesinleştirir", async () => {
  const f = await assigned(),
    other = await createUser(app, "Yarışan kurye");
  const member = await f.ownerClient.ok(row, "POST", `/v1/business/${f.businessId}/couriers`, {
    headers: { "idempotency-key": randomUUID() },
    body: { userId: other.id, expectedVersion: 0, active: true },
  });
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      f.ownerClient.request("PUT", f.assignment, {
        headers: { "idempotency-key": randomUUID() },
        body: {
          memberId: member.id,
          expectedVersion: f.job.version,
          expectedOrderVersion: f.order.version,
        },
      }),
    ),
  );
  expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  expect(results.filter((r) => r.status === 409)).toHaveLength(19);
  expect(
    await app.platformDb.many(sql`select id from courier_job_history where job_id=${f.job.id}`),
  ).toHaveLength(2);
  await f.courierClient.fail("not_found", "GET", f.jobRoot);
});
it("kurye siparişi iptal edemez ve başka müşteri kapsamı seçemez", async () => {
  const f = await assigned();
  await f.courierClient.fail(
    "forbidden",
    "PUT",
    `/v1/business/${f.businessId}/orders/${f.order.id}/status`,
    { body: { expectedVersion: 1, status: "cancelled" } },
  );
  await f.courierClient.fail("validation_failed", "POST", "/v1/shell/business-context", {
    body: { businessId: f.businessId, appInstanceId: f.instanceId, userId: f.customer.id },
  });
  await expect(
    app.services.courier.job(
      { businessId: f.businessId, userId: f.courier.id, memberId: f.member.id },
      f.job.id,
    ),
  ).rejects.toMatchObject({ code: "forbidden" });
});
it("ret ve iptal kurye iletişim erişimini aynı işlemde kapatır", async () => {
  for (const status of ["cancelled", "rejected"]) {
    const f = await assigned();
    await app.services.ordering.updateStatus(f.scope, f.order.id, { expectedVersion: 1, status });
    await f.courierClient.fail("not_found", "GET", f.jobRoot);
    expect(
      await app.platformDb.one(sql`select status from courier_jobs where id=${f.job.id}`),
    ).toEqual({ status: "cancelled" });
  }
});
it("kurye tek kullanımlık soket bileti ve yalnız etkin işinin olay tekrarını alır", async () => {
  const f = await assigned();
  await f.courierClient.fail("forbidden", "POST", `/v1/business/${f.businessId}/socket-ticket`);
  const ticket = await f.courierClient.ok(
    z.object({ ticket: z.string(), expiresAt: z.string(), socketUrl: z.string() }),
    "POST",
    `/v1/courier/${f.businessId}/socket-ticket`,
    { body: {} },
  );
  expect(ticket.ticket).toHaveLength(43);
  const events = await f.courierClient.ok(
    z.object({
      items: z.array(z.looseObject({ jobId: z.uuid() })),
      cursor: z.number(),
      reset: z.boolean(),
    }),
    "GET",
    `/v1/courier/${f.businessId}/live-events?cursor=0`,
  );
  expect(events.items.map((e) => e.jobId)).toEqual([f.job.id]);
  expect(JSON.stringify(events)).not.toContain(f.address.phone);
  await f.ownerClient.ok(row, "POST", `/v1/business/${f.businessId}/couriers`, {
    headers: { "idempotency-key": randomUUID() },
    body: { userId: f.courier.id, expectedVersion: 1, active: false },
  });
  await f.courierClient.fail(
    "forbidden",
    "GET",
    `/v1/courier/${f.businessId}/live-events?cursor=0`,
  );
});

it("aynı kurye farklı iki siparişe eşzamanlı atanamaz", async () => {
  const f = await checkoutDelivery(app),
    courier = await createUser(app, "Tek görevli kurye");
  const member = await f.ownerClient.ok(row, "POST", `/v1/business/${f.businessId}/couriers`, {
    headers: { "idempotency-key": randomUUID() },
    body: { userId: courier.id, expectedVersion: 0, active: true },
  });
  const empty = await f.client.ok(cartSchema, "POST", `${f.root}/carts`, {
    body: { branchId: f.branchId, fulfilment: "delivery", addressId: f.address.id },
  });
  const cart = await f.client.ok(cartSchema, "PUT", `${f.root}/carts/${empty.id}`, {
    body: {
      expectedVersion: empty.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
    },
  });
  const second = await f.client.ok(orderSchema, "POST", `${f.root}/carts/${cart.id}/checkout`, {
    headers: { "idempotency-key": randomUUID() },
    body: { cartVersion: cart.version, seenTotalMinor: cart.totalMinor, quoteHash: cart.quoteHash },
  });
  const results = await Promise.all(
    [f.order, second].map((order) =>
      f.ownerClient.request(
        "PUT",
        `/v1/business/${f.businessId}/orders/${order.id}/delivery-assignment`,
        {
          headers: { "idempotency-key": randomUUID() },
          body: { memberId: member.id, expectedVersion: 0, expectedOrderVersion: 1 },
        },
      ),
    ),
  );
  expect(results.filter((result) => result.status === 200)).toHaveLength(1);
  expect(results.filter((result) => result.status === 409)).toHaveLength(1);
  expect(results.find((result) => result.status === 409)?.body).toMatchObject({
    error: { code: "courier_busy" },
  });
  expect(
    await app.platformDb.many(sql`select id from courier_jobs where business_id=${f.businessId}`),
  ).toHaveLength(1);
});

it("ücretsiz teslimat sahte tahsilat istemez ve doğrudan SQL eksik sürümü reddeder", async () => {
  const f = await createDeliveryFixture(app, false, {
    amountMinor: 0,
    feeMinor: 0,
    minimumMinor: 0,
  });
  const order = await f.client.ok(orderSchema, "POST", `${f.root}/carts/${f.cart.id}/checkout`, {
    headers: { "idempotency-key": randomUUID() },
    body: { cartVersion: f.cart.version, seenTotalMinor: 0, quoteHash: f.cart.quoteHash },
  });
  const courier = await createUser(app, "Ücretsiz teslim kurye"),
    client = as(app, courier);
  const member = await f.ownerClient.ok(row, "POST", `/v1/business/${f.businessId}/couriers`, {
    headers: { "idempotency-key": randomUUID() },
    body: { userId: courier.id, expectedVersion: 0, active: true },
  });
  let job = await f.ownerClient.ok(
    row,
    "PUT",
    `/v1/business/${f.businessId}/orders/${order.id}/delivery-assignment`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { memberId: member.id, expectedVersion: 0, expectedOrderVersion: 1 },
    },
  );
  await scoped(app.db, f.businessId, async (tx) => {
    await tx.execute(sql`select set_config('vado.user_id',${courier.id},true)`);
    expect(
      (
        await tx.one<{ result: unknown }>(
          sql`select courier_mutate(${f.businessId},${job.id},'depart',${randomUUID()},${"a".repeat(64)},'{}') as result`,
        )
      ).result,
    ).toEqual({ error: "validation_failed" });
  });
  let current = order;
  for (const status of ["accepted", "preparing", "ready"]) {
    current = await app.services.ordering.updateStatus(f.scope, order.id, {
      expectedVersion: current.version,
      status,
    });
  }
  const root = `/v1/courier/${f.businessId}/jobs/${job.id}`;
  job = await client.ok(row, "POST", `${root}/depart`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: job.version, expectedOrderVersion: current.version },
  });
  current = await app.services.ordering.getOrder(f.scope, order.id);
  expect(current.paymentStatus).toBe("paid");
  await client.fail("payment_version_conflict", "POST", `${root}/payment`, {
    headers: { "idempotency-key": randomUUID() },
    body: {
      expectedVersion: job.version,
      expectedPaymentVersion: 0,
      method: "cash",
      reference: "YOK",
    },
  });
  expect(
    (
      await client.ok(row, "POST", `${root}/deliver`, {
        headers: { "idempotency-key": randomUUID() },
        body: { expectedVersion: job.version, expectedOrderVersion: current.version },
      })
    ).status,
  ).toBe("completed");
  expect(
    await app.platformDb.many(sql`select id from order_payments where order_id=${order.id}`),
  ).toEqual([]);
});

it("aynı anda tahsilat ve teslim ücretli siparişi ödemesiz kapatamaz", async () => {
  const f = await assigned();
  let order = f.order;
  for (const status of ["accepted", "preparing", "ready"]) {
    order = await app.services.ordering.updateStatus(f.scope, order.id, {
      expectedVersion: order.version,
      status,
    });
  }
  const job = await f.courierClient.ok(row, "POST", `${f.jobRoot}/depart`, {
    headers: { "idempotency-key": randomUUID() },
    body: { expectedVersion: f.job.version, expectedOrderVersion: order.version },
  });
  order = await app.services.ordering.getOrder(f.scope, order.id);
  const key = randomUUID(),
    body = { expectedVersion: job.version, expectedOrderVersion: order.version };
  const [delivery, payment] = await Promise.all([
    f.courierClient.request("POST", `${f.jobRoot}/deliver`, {
      headers: { "idempotency-key": key },
      body,
    }),
    f.courierClient.request("POST", `${f.jobRoot}/payment`, {
      headers: { "idempotency-key": randomUUID() },
      body: {
        expectedVersion: job.version,
        expectedPaymentVersion: 0,
        method: "card",
        reference: "POS-YARIS",
      },
    }),
  ]);
  expect(payment.status).toBe(200);
  expect([200, 409]).toContain(delivery.status);
  const done = await f.courierClient.ok(row, "POST", `${f.jobRoot}/deliver`, {
    headers: { "idempotency-key": key },
    body,
  });
  expect(done.status).toBe("completed");
  expect(
    await app.platformDb.many(sql`select id from order_payments where order_id=${order.id}`),
  ).toHaveLength(1);
});
