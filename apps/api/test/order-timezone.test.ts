import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { withIdempotency } from "../src/core/idempotency";
import { withTenant } from "../src/core/tenant-scope";
import { as, startTestApp, type TestApp } from "./support/harness";
import { createOrderingFixture } from "./support/ordering-fixture";
let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});
it("2.7 tekrar görüntüsüne kapalı sipariş şubesinin saati eklenir; fiyat, placed sürümü ve SQL gövdesi korunur", async () => {
  const f = await createOrderingFixture(app),
    key = randomUUID();
  const body = {
    cartVersion: f.cart.version,
    seenTotalMinor: f.cart.totalMinor,
    quoteHash: f.cart.quoteHash,
  };
  const legacy: Record<string, unknown> = { ...f.order };
  delete legacy.branchTimezone;
  await withTenant(app.db, f.customerScope, (tx) =>
    withIdempotency(
      tx,
      f.customerScope,
      "ordering.checkout",
      key,
      { cartId: f.cart.id, ...body },
      () => Promise.resolve({ status: 200, body: legacy }),
    ),
  );
  await app.services.ordering.updateStatus(f.scope, f.order.id, {
    expectedVersion: 1,
    status: "accepted",
  });
  await withTenant(app.db, f.scope, (tx) =>
    tx.execute(
      sql`update branches set active=false,timezone='America/New_York' where business_id=${f.businessId} and id=${f.branchId}`,
    ),
  );
  const root = `/v1/shell/${f.businessId}/${f.instanceId}`;
  const result = await as(app, f.customer).request("POST", `${root}/carts/${f.cart.id}/checkout`, {
    body,
    headers: { "idempotency-key": key },
  });
  expect(result).toEqual({ status: 200, body: { ...legacy, branchTimezone: "America/New_York" } });
  const saved = await withTenant(app.db, f.customerScope, (tx) =>
    tx.one<{ response_body: unknown }>(
      sql`select response_body from idempotency_keys where key=${key}`,
    ),
  );
  expect(saved.response_body).toEqual(legacy);
  await as(app, f.customer).fail(
    "idempotency_conflict",
    "POST",
    `${root}/carts/${f.cart.id}/checkout`,
    { body: { ...body, seenTotalMinor: 1 }, headers: { "idempotency-key": key } },
  );
  expect(
    (await as(app, f.customer).request("GET", `${root}/orders/${f.order.id}`)).body,
  ).toMatchObject({ branchTimezone: "America/New_York", status: "accepted", version: 2 });
});
