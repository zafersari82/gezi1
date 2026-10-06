import { randomUUID } from "node:crypto";

import { type Database, sql } from "../../src/core/database";
import { createUser, type TestApp } from "./harness";

/** Doğrudan SQL saldırı denemeleri; üretim motoru bu kapsam kurucusunu kullanmaz. */
export function scoped<T>(
  db: Database,
  businessId: string,
  run: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('vado.business_id', ${businessId}, true)`);
    return run(tx);
  });
}

export async function createTenantFixture(app: TestApp) {
  const owner = await createUser(app, "İşletme sahibi");
  const customer = await createUser(app, "İşletme müşterisi");
  const business = await app.db.one<{ id: string }>(sql`
    insert into businesses(owner_id, name, slug, category, city, verified, status)
    values (${owner.id}, 'Kapsam işletmesi', ${`kapsam-${randomUUID()}`}, 'food', 'İstanbul', true, 'active') returning id
  `);
  const miniAppId = `kapsam-${randomUUID().slice(0, 12)}`;
  const merchantId = randomUUID();
  await app.db.execute(sql`
    insert into mini_apps(id, name, description, entry_url, allowed_origins, version, category, developer_name, verified, source)
    values (${miniAppId}, 'Kapsam uygulaması', '', 'http://localhost:5173', '{http://localhost:5173}',
      '1.0.0', 'food', 'VADO', true, 'url')
  `);
  await app.db.execute(sql`
    insert into mini_app_merchants(mini_app_id, merchant_id, business_id, display_name)
    values (${miniAppId}, ${merchantId}, ${business.id}, 'Kapsam satıcısı')
  `);
  const scope = await app.services.businessManagement.authorise(owner.id, business.id);
  const branch = await app.services.businessManagement.saveBranch(scope, {
    name: "Merkez",
    timezone: "Europe/Istanbul",
    address: "",
    active: true,
  });
  const instance = await app.services.businessManagement.createInstance(scope, {
    miniAppId,
    merchantId,
    engine: "ordering",
    active: true,
  });
  const customerScope = await app.services.businessManagement.customerScope(
    customer.id,
    business.id,
    instance.id,
  );
  return {
    owner,
    customer,
    businessId: business.id,
    miniAppId,
    merchantId,
    branchId: branch.id,
    instanceId: instance.id,
    scope,
    customerScope,
  };
}
