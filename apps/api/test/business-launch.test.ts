import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

const launchSchema = z.object({ businessId: z.uuid(), appInstanceId: z.uuid() });

describe("işletmeden mini uygulama açılışı", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("doğru işletmenin etkin örneğini bulur, başka işletmeyi seçmez", async () => {
    const first = await createTenantFixture(app);
    const second = await createTenantFixture(app);
    const client = as(app, first.customer);
    const result = await client.ok(
      launchSchema,
      "GET",
      `/v1/businesses/${first.businessId}/miniapps/${first.miniAppId}/launch`,
    );
    expect(result).toEqual({ businessId: first.businessId, appInstanceId: first.instanceId });
    await client.fail(
      "business_not_found",
      "GET",
      `/v1/businesses/${second.businessId}/miniapps/${first.miniAppId}/launch`,
    );
  });

  it("bağlamı doğrular ama yalnızca mağazaya bakmak müşteri kaydı oluşturmaz", async () => {
    const f = await createTenantFixture(app);
    const visitor = await createUser(app, "Vitrin ziyaretçisi");
    const path = `/v1/businesses/${f.businessId}/miniapps/${f.miniAppId}/launch`;
    await as(app, visitor).ok(launchSchema, "GET", path);
    expect(
      await scoped(app.db, f.businessId, (tx) =>
        tx.many(sql`
      select id from business_customers where business_id=${f.businessId} and user_id=${visitor.id}
    `),
      ),
    ).toEqual([]);
  });

  it("kapalı örnek veya askıdaki işletmeyi açmaz", async () => {
    const fixture = await createTenantFixture(app);
    const client = as(app, fixture.customer);
    const path = `/v1/businesses/${fixture.businessId}/miniapps/${fixture.miniAppId}/launch`;
    await app.services.businessManagement.createInstance(fixture.scope, {
      miniAppId: fixture.miniAppId,
      merchantId: fixture.merchantId,
      engine: "ordering",
      active: false,
    });
    await client.fail("business_not_found", "GET", path);
    await app.services.businessManagement.createInstance(fixture.scope, {
      miniAppId: fixture.miniAppId,
      merchantId: fixture.merchantId,
      engine: "ordering",
      active: true,
    });
    await app.db.execute(
      sql`update businesses set status='suspended' where id=${fixture.businessId}`,
    );
    await client.fail("business_not_found", "GET", path);
  });

  it("aynı işletmede aynı uygulamanın birden fazla örneğini rastgele seçmez", async () => {
    const fixture = await createTenantFixture(app);
    const anotherMerchant = randomUUID();
    await app.db.execute(sql`
      insert into mini_app_merchants (mini_app_id, merchant_id, business_id, display_name)
      values (${fixture.miniAppId}, ${anotherMerchant}, ${fixture.businessId}, 'İkinci satıcı')
    `);
    await app.services.businessManagement.createInstance(fixture.scope, {
      miniAppId: fixture.miniAppId,
      merchantId: anotherMerchant,
      engine: "ordering",
      active: true,
    });
    await as(app, fixture.customer).fail(
      "business_not_found",
      "GET",
      `/v1/businesses/${fixture.businessId}/miniapps/${fixture.miniAppId}/launch`,
    );
  });
});
