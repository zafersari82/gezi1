import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { startTestApp, type TestApp } from "./support/harness";
import { createOrderingFixture } from "./support/ordering-fixture";
import { scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

test("altı sipariş tablosu kapsamsız ve yabancı erişimi reddeder; politika ve FORCE aynıdır", async () => {
  const a = await createOrderingFixture(app);
  const b = await createOrderingFixture(app);
  const cases = [
    {
      read: sql`select * from carts where business_id=${b.businessId}`,
      update: sql`update carts set version=version+1 where business_id=${b.businessId}`,
      remove: sql`delete from carts where business_id=${b.businessId}`,
    },
    {
      read: sql`select * from cart_lines where business_id=${b.businessId}`,
      update: sql`update cart_lines set quantity=3 where business_id=${b.businessId}`,
      remove: sql`delete from cart_lines where business_id=${b.businessId}`,
    },
    {
      read: sql`select * from orders where business_id=${b.businessId}`,
      update: sql`update orders set status='accepted',version=version+1 where business_id=${b.businessId}`,
      remove: sql`delete from orders where business_id=${b.businessId}`,
    },
    {
      read: sql`select * from order_lines where business_id=${b.businessId}`,
      update: sql`update order_lines set name='Yabancı ad' where business_id=${b.businessId}`,
      remove: sql`delete from order_lines where business_id=${b.businessId}`,
    },
    {
      read: sql`select * from order_line_options where business_id=${b.businessId}`,
      update: sql`update order_line_options set price_delta_minor=1 where business_id=${b.businessId}`,
      remove: sql`delete from order_line_options where business_id=${b.businessId}`,
    },
    {
      read: sql`select * from order_status_history where business_id=${b.businessId}`,
      update: sql`update order_status_history set to_status='accepted' where business_id=${b.businessId}`,
      remove: sql`delete from order_status_history where business_id=${b.businessId}`,
    },
  ];
  for (const entry of cases) {
    expect(
      (await scoped(app.db, b.businessId, (tx) => tx.many(entry.read))).length,
    ).toBeGreaterThan(0);
    expect(await app.db.many(entry.read)).toEqual([]);
    expect(await app.migrationDb.many(entry.read)).toEqual([]);
    await scoped(app.db, a.businessId, async (tx) => {
      expect(await tx.many(entry.read)).toEqual([]);
      expect(await tx.execute(entry.update)).toBe(0);
      expect(await tx.execute(entry.remove)).toBe(0);
    });
  }
  const tables = [
    "carts",
    "cart_lines",
    "orders",
    "order_lines",
    "order_line_options",
    "order_status_history",
  ];
  const metadata = await app.db.many<{
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
    qual: string;
    with_check: string;
  }>(sql`select c.relrowsecurity,c.relforcerowsecurity,p.qual,p.with_check from pg_class c
   join pg_policies p on p.tablename=c.relname and p.schemaname='public' where p.policyname='tenant_scope' and c.relnamespace='public'::regnamespace and c.relname=any(${tables}::text[])`);
  expect(metadata).toHaveLength(6);
  for (const row of metadata) {
    expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
    expect(row.qual).toBe(
      "(business_id = (NULLIF(current_setting('vado.business_id'::text, true), ''::text))::uuid)",
    );
    expect(row.with_check).toBe(row.qual);
  }
  const courierPolicies = await app.db.many<{
    tablename: string;
    permissive: string;
    qual: string;
    with_check: string;
  }>(
    sql`select tablename,permissive,qual,with_check from pg_policies where schemaname='public' and policyname='courier_legacy_denied' and tablename=any(${tables}::text[])`,
  );
  expect(courierPolicies).toHaveLength(6);
  for (const policy of courierPolicies) {
    expect(policy.permissive).toBe("RESTRICTIVE");
    expect(policy.qual).toContain("courier_actor(business_id)");
    expect(policy.with_check).toBe(policy.qual);
  }
  await expect(
    scoped(app.db, a.businessId, (tx) =>
      tx.execute(
        sql`insert into carts(business_id,branch_id,app_instance_id,business_customer_id) values(${b.businessId},${b.branchId},${b.instanceId},${b.customerScope.businessCustomerId})`,
      ),
    ),
  ).rejects.toMatchObject({ code: "42501" });
  for (const query of [
    sql`insert into carts(business_id,branch_id,app_instance_id,business_customer_id) values(${a.businessId},${b.branchId},${a.instanceId},${a.customerScope.businessCustomerId})`,
    sql`insert into carts(business_id,branch_id,app_instance_id,business_customer_id) values(${a.businessId},${a.branchId},${b.instanceId},${a.customerScope.businessCustomerId})`,
    sql`insert into carts(business_id,branch_id,app_instance_id,business_customer_id) values(${a.businessId},${a.branchId},${a.instanceId},${b.customerScope.businessCustomerId})`,
  ])
    await expect(scoped(app.db, a.businessId, (tx) => tx.execute(query))).rejects.toMatchObject({
      code: "23503",
    });
  await expect(
    scoped(app.db, a.businessId, async (tx) => {
      const cart = await tx.one<{ id: string }>(
        sql`insert into carts(business_id,branch_id,app_instance_id,business_customer_id) values(${a.businessId},${a.branchId},${a.instanceId},${a.customerScope.businessCustomerId}) returning id`,
      );
      await tx.execute(sql`insert into cart_lines(business_id,cart_id,item_id,quantity,option_ids,seen_unit_price_minor,seen_vat_basis_points,position)
    values(${a.businessId},${cart.id},${a.itemId},1,${[b.optionId]}::uuid[],10000,1000,0)`);
    }),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    scoped(app.db, a.businessId, (tx) =>
      tx.execute(sql`insert into outbox_events(business_id,aggregate_id,order_id,sequence,type,payload)
   values(${a.businessId},${randomUUID()},${b.order.id},1,'order.placed','{}')`),
    ),
  ).rejects.toMatchObject({ code: "23503" });
  const bLine = b.order.lines[0];
  if (bLine === undefined) throw new Error("Sınama sipariş satırı oluşmadı");
  for (const targetBusiness of [a.businessId, b.businessId]) {
    for (const query of [
      sql`insert into cart_lines(business_id,cart_id,item_id,quantity,seen_unit_price_minor,seen_vat_basis_points,position) values(${targetBusiness},${b.cart.id},${b.itemId},1,10000,1000,2)`,
      sql`insert into orders(business_id,cart_id,branch_id,app_instance_id,business_customer_id,total_minor,vat_minor,state_graph,capabilities) values(${targetBusiness},${b.cart.id},${b.branchId},${b.instanceId},${b.customerScope.businessCustomerId},10000,909,ordering_core_graph(),'[]')`,
      sql`insert into order_lines(business_id,order_id,item_id,name,quantity,base_price_minor,unit_price_minor,total_minor,vat_basis_points,vat_minor,position) values(${targetBusiness},${b.order.id},${b.itemId},'Ürün',1,10000,10000,10000,1000,909,2)`,
      sql`insert into order_line_options(business_id,order_line_id,option_id,name,price_delta_minor) values(${targetBusiness},${bLine.id},${b.optionId},'Ek ürün',2500)`,
      sql`insert into order_status_history(business_id,order_id,version,from_status,to_status,actor_kind) values(${targetBusiness},${b.order.id},2,'placed','accepted','system')`,
    ]) {
      const error: unknown = await scoped(app.db, a.businessId, (tx) => tx.execute(query)).catch(
        (error: unknown) => error,
      );
      expect(
        typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string" &&
          /^(42501|23503|23514)$/.test(error.code),
      ).toBe(true);
    }
  }
});
