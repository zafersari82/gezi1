import { catalogItemBodySchema, catalogOptionGroupBodySchema } from "@vado/contracts";
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

test("açık sepet satırı sürüm işlemi dışında değişmez; fiyat görüntüsü siparişe sonradan eklenmez", async () => {
  const f = await createOrderingFixture(app);
  const open = await app.services.ordering.openCart(f.customerScope, f.branchId);
  await app.services.ordering.replaceCart(f.customerScope, open.id, {
    expectedVersion: open.version,
    lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
  });
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(sql`update cart_lines set quantity=2 where cart_id=${open.id}`),
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(sql`update carts set version=version where id=${open.id}`),
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const free = await app.services.catalog.saveItem(
    f.scope,
    catalogItemBodySchema.parse({
      name: "Ücretsiz ek ürün",
      price: { amountMinor: 0, vatBasisPoints: 0 },
    }),
  );
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(sql`insert into order_lines(business_id,order_id,item_id,name,quantity,base_price_minor,unit_price_minor,total_minor,vat_basis_points,vat_minor,position)
   values(${f.businessId},${f.order.id},${free.id},'Ücretsiz ek ürün',1,0,0,0,0,0,1)`),
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const group = await app.services.catalog.saveOptionGroup(
    f.scope,
    catalogOptionGroupBodySchema.parse({
      name: "Ekstralar",
      maxSelected: 2,
      options: [
        { id: f.optionId, name: "Ek ürün", priceDeltaMinor: 2500 },
        { name: "Ücretsiz seçenek", priceDeltaMinor: 0 },
      ],
    }),
    f.groupId,
  );
  const option = group.options.find((o) => o.id !== f.optionId);
  const line = f.order.lines[0];
  if (option === undefined || line === undefined) throw new Error("Sınama kaydı oluşmadı");
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(sql`insert into order_line_options(business_id,order_line_id,option_id,name,price_delta_minor)
  values(${f.businessId},${line.id},${option.id},${option.name},0)`),
    ),
  ).rejects.toMatchObject({ code: "23514" });
});

test("sipariş placed iken de görüntü, KDV, sürüm ve geçmiş SQL ile korunur", async () => {
  const f = await createOrderingFixture(app);
  for (const query of [
    sql`update orders set status='completed',version=version+1 where id=${f.order.id}`,
    sql`update orders set status='accepted' where id=${f.order.id}`,
    sql`update orders set total_minor=1,status='accepted',version=version+1 where id=${f.order.id}`,
    sql`update order_lines set vat_minor=1 where order_id=${f.order.id}`,
    sql`update order_line_options set price_delta_minor=1 where business_id=${f.businessId}`,
    sql`insert into order_status_history(business_id,order_id,version,from_status,to_status,actor_kind) values(${f.businessId},${f.order.id},2,'placed','accepted','system')`,
    sql`delete from orders where id=${f.order.id}`,
  ])
    await expect(scoped(app.db, f.businessId, (tx) => tx.execute(query))).rejects.toMatchObject({
      code: "23514",
    });
  await scoped(app.db, f.businessId, (tx) =>
    tx.execute(sql`update orders set status='accepted',version=version+1 where id=${f.order.id}`),
  );
  expect(
    await scoped(app.db, f.businessId, (tx) =>
      tx.many(sql`select * from order_status_history where order_id=${f.order.id}`),
    ),
  ).toHaveLength(2);
  expect(
    await scoped(app.db, f.businessId, (tx) =>
      tx.many(sql`select * from outbox_events where order_id=${f.order.id}`),
    ),
  ).toHaveLength(2);
});
