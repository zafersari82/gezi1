import { afterAll, beforeAll, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { withIdempotency } from "../src/core/idempotency";
import { withTenant } from "../src/core/tenant-scope";
import { createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

test("elli aynı anahtar aynı yanıtı döndürür; farklı gövde reddedilir", async () => {
  const f = await createTenantFixture(app);
  let calls = 0;
  const run = (body: unknown) =>
    withTenant(app.db, f.customerScope, (tx) =>
      withIdempotency(tx, f.customerScope, "test.checkout", "checkout-1", body, async () => {
        calls++;
        await tx.execute(
          sql`update branches set address = address || 'x' where id = ${f.branchId}`,
        );
        return { status: 200, body: { receipt: "ilk-yanit" } };
      }),
    );
  const responses = await Promise.all(Array.from({ length: 50 }, () => run({ b: 2, a: 1 })));
  expect(calls).toBe(1);
  expect(responses.every((r) => r.status === 200 && r.body.receipt === "ilk-yanit")).toBe(true);
  expect(await run({ a: 1, b: 2 })).toEqual(responses[0]);
  await expect(run({ a: 2, b: 2 })).rejects.toMatchObject({ code: "idempotency_conflict" });
  const row = await scoped(app.db, f.businessId, (tx) =>
    tx.one<{ hours: number }>(
      sql`select extract(epoch from (expires_at-created_at))/3600::float as hours from idempotency_keys where key = 'checkout-1'`,
    ),
  );
  expect(row.hours).toBe(24);
});

test("başka müşteri aynı anahtarla önceki yanıtı alamaz; hata anahtar bırakmaz", async () => {
  const a = await createTenantFixture(app);
  const b = await createTenantFixture(app);
  const run = (f: typeof a) =>
    withTenant(app.db, f.customerScope, (tx) =>
      withIdempotency(tx, f.customerScope, "test.checkout", "ortak", {}, () =>
        Promise.resolve({ status: 200, body: { business: f.businessId } }),
      ),
    );
  expect((await run(a)).body.business).toBe(a.businessId);
  expect((await run(b)).body.business).toBe(b.businessId);
  await expect(
    withTenant(app.db, a.customerScope, (tx) =>
      withIdempotency(tx, a.customerScope, "test.checkout", "geri-al", {}, () =>
        Promise.reject(new Error("Geri al")),
      ),
    ),
  ).rejects.toThrow("Geri al");
  expect(
    await scoped(app.db, a.businessId, (tx) =>
      tx.many(sql`select * from idempotency_keys where key = 'geri-al'`),
    ),
  ).toEqual([]);
});

test("aynı işletmedeki iki müşterinin anahtarı ayrıdır ve 24 saatlik kayıt yenilenir", async () => {
  const f = await createTenantFixture(app);
  const other = await createUser(app, "İkinci müşteri");
  const second = await app.services.businessManagement.customerScope(
    other.id,
    f.businessId,
    f.instanceId,
  );
  for (const scope of [f.customerScope, second]) {
    const response = await withTenant(app.db, scope, (tx) =>
      withIdempotency(tx, scope, "test.checkout", "ayni", {}, () =>
        Promise.resolve({ status: 200, body: { customer: scope.businessCustomerId } }),
      ),
    );
    expect(response.body.customer).toBe(scope.businessCustomerId);
  }
  await scoped(app.db, f.businessId, (tx) =>
    tx.execute(sql`insert into idempotency_keys(business_id,app_instance_id,business_customer_id,operation,key,body_hash,created_at,expires_at,response_status,response_body)
    values (${f.businessId},${f.instanceId},${f.customerScope.businessCustomerId},'test.checkout','eski',${"a".repeat(64)},now()-interval '25 hours',now()-interval '1 hour',200,'{"old":true}')`),
  );
  const response = await withTenant(app.db, f.customerScope, (tx) =>
    withIdempotency(tx, f.customerScope, "test.checkout", "eski", { renewed: true }, () =>
      Promise.resolve({ status: 201, body: { renewed: true } }),
    ),
  );
  expect(response).toEqual({ status: 201, body: { renewed: true } });
});

test("önceden verilmiş müşteri kapsamı hesap silindikten sonra kullanılamaz", async () => {
  const f = await createTenantFixture(app);
  await app.services.users.deleteMe(f.customer.id);
  await expect(
    withTenant(app.db, f.customerScope, (tx) =>
      withIdempotency(tx, f.customerScope, "test.checkout", "silinmis", {}, () =>
        Promise.resolve({ status: 200, body: {} }),
      ),
    ),
  ).rejects.toMatchObject({ code: "unauthorized" });
});
