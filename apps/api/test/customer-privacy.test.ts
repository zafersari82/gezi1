import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { as, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

describe("Silinen hesapla işletme müşterisi bağı", () => {
  test("geç kalan SQL veya kabuk isteği silinmiş hesabı yeniden bağlayamaz", async () => {
    const f = await createTenantFixture(app);
    await as(app, f.customer).done("DELETE", "/v1/me");
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`
      insert into business_customers(business_id, user_id) values (${f.businessId}, ${f.customer.id})
    `),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      app.services.businessManagement.customerScope(f.customer.id, f.businessId, f.instanceId),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  test("hesap silme kilidi bittikten sonra bekleyen yeni müşteri bağı reddedilir", async () => {
    const f = await createTenantFixture(app);
    const other = await createTenantFixture(app);
    let announce: () => void = () => undefined;
    let release: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      announce = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deletion = app.platformDb.transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${f.customer.id} for update`);
      announce();
      await gate;
      await tx.execute(sql`update users set status = 'deleted' where id = ${f.customer.id}`);
      await tx.execute(
        sql`update business_customers set user_id = null where user_id = ${f.customer.id}`,
      );
    });
    await ready;
    let settled = false;
    const link = scoped(app.db, other.businessId, (tx) =>
      tx.execute(sql`
      insert into business_customers(business_id, user_id) values (${other.businessId}, ${f.customer.id})
    `),
    ).then(
      (value) => {
        settled = true;
        return value;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(settled).toBe(false);
    } finally {
      release();
      await deletion;
    }
    expect(await link).toMatchObject({ code: "23514" });
  });

  test("eş zamanlı yirmi kabuk isteği ve hesap silme müşteri bağını yeniden kurmaz", async () => {
    const f = await createTenantFixture(app);
    const pending = Array.from({ length: 20 }, () =>
      app.services.businessManagement.customerScope(f.customer.id, f.businessId, f.instanceId),
    );
    const removal = app.services.users.deleteMe(f.customer.id);
    const results = await Promise.allSettled(pending);
    await removal;
    for (const result of results) {
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ code: "unauthorized" });
    }
    const links = await app.platformDb.many(
      sql`select id from business_customers where user_id = ${f.customer.id}`,
    );
    expect(links).toEqual([]);
  });
});
