import {
  businessSocketTicketSchema,
  operationDeviceInfoSchema,
  orderSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { withTenant } from "../src/core/tenant-scope";
import { createCatalogFixture } from "./support/catalog-fixture";
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
    "/v1/device-pairings",
    { body: {} },
  );
  const approved = await as(app, f.owner).ok(
    z.object({ id: z.uuid() }),
    "POST",
    `/v1/business/${f.businessId}/devices`,
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
    `/v1/device-pairings/${challenge.id}/poll`,
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
  const list = await f.client("GET", "/v1/device/orders");
  expect(list).toMatchObject({ status: 200, body: { items: [{ id: f.order.id }] } });
  expect(await f.client("GET", `/v1/device/orders/${other.order.id}`)).toMatchObject({
    status: 404,
  });
  expect(await f.client("GET", `/v1/business/${f.businessId}/catalog`)).toMatchObject({
    status: 401,
  });
  const accepted = await f.client("POST", `/v1/device/orders/${f.order.id}/accept`, {
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
    await as(app, f.owner).request("POST", `/v1/business/${f.businessId}/devices`, {
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
    "/v1/device-pairings",
    { body: {} },
  );
  for (let i = 0; i < 5; i++)
    expect(
      await anonymous(app).request("POST", `/v1/device-pairings/${pending.id}/poll`, {
        body: { secret: "a".repeat(43) },
      }),
    ).toMatchObject({ status: 401 });
  expect(
    await anonymous(app).request("POST", `/v1/device-pairings/${pending.id}/poll`, {
      body: { secret: pending.secret },
    }),
  ).toMatchObject({ status: 401 });
  // Uygulama havuzu kapsam dışı eşleştirmeleri RLS yüzünden zaten göremez.
  // Gerçek kilitlenmeyi şema sahibinin bağlantısıyla denetle.
  const locked = await app.migrationDb.one<{ status: string; attempts: number }>(
    sql`select status,attempts from operation_device_pairings where id=${pending.id}`,
  );
  expect(locked).toEqual({ status: "pending", attempts: 5 });
  const approvedPairing = await app.migrationDb.one<{ status: string; attempts: number }>(
    sql`select status,attempts from operation_device_pairings where id=${f.challenge.id}`,
  );
  expect(approvedPairing).toEqual({ status: "approved", attempts: 0 });
});
it("cihaz kapatılınca bütün uçları ve daha önce verilmiş soket bileti geçersiz olur", async () => {
  const f = await pair();
  const ticket = businessSocketTicketSchema.parse(
    (await f.client("POST", "/v1/device/socket-ticket", {})).body,
  );
  expect(
    await as(app, f.owner).request(
      "POST",
      `/v1/business/${f.businessId}/devices/${f.deviceId}/revoke`,
      { body: {} },
    ),
  ).toMatchObject({ status: 200 });
  expect(await f.client("GET", "/v1/device/orders")).toMatchObject({ status: 401 });
  await expect(app.services.operationDevices.consumeTicket(ticket.ticket)).rejects.toMatchObject({
    code: "unauthorized",
  });
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(
        sql`update operation_devices set revoked_at=null where business_id=${f.businessId} and id=${f.deviceId}`,
      ),
    ),
  ).rejects.toMatchObject({ code: "23514" });
});

it("önceden doğrulanmış cihaz kapsamı işletme askıya alındıktan sonra işlem yapamaz", async () => {
  const f = await pair();
  const scope = await app.services.operationDevices.authenticate(f.token);
  await app.migrationDb.execute(
    sql`update businesses set status='suspended' where id=${f.businessId}`,
  );
  await expect(app.services.ordering.getOrder(scope, f.order.id)).rejects.toMatchObject({
    code: "unauthorized",
  });
});

it("soket bileti yalnız doğrulanmış cihazın kendi kimliği için üretilir", async () => {
  const f = await pair();
  const deviceScope = await app.services.operationDevices.authenticate(f.token);
  const challenge = await anonymous(app).ok(
    z.object({ code: z.string() }),
    "POST",
    "/v1/device-pairings",
    { body: {} },
  );
  const second = await as(app, f.owner).ok(
    z.object({ id: z.uuid() }),
    "POST",
    `/v1/business/${f.businessId}/devices`,
    {
      body: {
        code: challenge.code,
        label: "İkinci cihaz",
        branchId: f.branchId,
        appInstanceId: f.instanceId,
      },
    },
  );
  // İşletme üyesi, erişebildiği cihaza doğrudan SQL üzerinden soket bileti yazamaz.
  await expect(
    withTenant(app.db, f.scope, (tx) =>
      tx.execute(sql`insert into operation_device_tickets(business_id,device_id,token_hash)
        values(${f.businessId},${f.deviceId},${"e".repeat(64)})`),
    ),
  ).rejects.toMatchObject({ code: "23514" });
  // İlk cihaz, aynı işletme/şubedeki ikinci cihaz adına bilet çıkaramaz.
  await expect(
    withTenant(app.db, deviceScope, (tx) =>
      tx.execute(sql`insert into operation_device_tickets(business_id,device_id,token_hash)
        values(${f.businessId},${second.id},${"f".repeat(64)})`),
    ),
  ).rejects.toMatchObject({ code: "23514" });
  // Meşru cihazın kendi bileti ve tek kullanımlık tüketimi korunur.
  const ticket = await app.services.operationDevices.issueTicket(deviceScope);
  const consumed = await app.services.operationDevices.consumeTicket(ticket.ticket);
  expect(consumed).toMatchObject({ deviceId: f.deviceId, branchId: f.branchId });
  await expect(app.services.operationDevices.consumeTicket(ticket.ticket)).rejects.toMatchObject({
    code: "unauthorized",
  });
});

it("aynı soket bileti eşzamanlı iki bağlantı tarafından tüketilemez", async () => {
  const f = await pair();
  const ticket = businessSocketTicketSchema.parse(
    (await f.client("POST", "/v1/device/socket-ticket", {})).body,
  );
  const results = await Promise.allSettled([
    app.services.operationDevices.consumeTicket(ticket.ticket),
    app.services.operationDevices.consumeTicket(ticket.ticket),
  ]);
  const successful = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  expect(successful).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(successful[0]).toMatchObject({
    status: "fulfilled",
    value: { deviceId: f.deviceId, branchId: f.branchId },
  });
  expect(rejected[0]).toMatchObject({
    status: "rejected",
    reason: { code: "unauthorized" },
  });
  await expect(app.services.operationDevices.consumeTicket(ticket.ticket)).rejects.toMatchObject({
    code: "unauthorized",
  });
});

it("cihaz bilgisi kendi şube ve işletme adını taşır", async () => {
  const f = await pair();
  const response = await f.client("GET", "/v1/device/device");
  expect(response.status).toBe(200);
  const info = operationDeviceInfoSchema.parse(response.body);
  expect(info).toMatchObject({ id: f.deviceId, businessId: f.businessId, branchId: f.branchId });
  expect(info.businessName.length).toBeGreaterThan(0);
  expect(info.branchName.length).toBeGreaterThan(0);
});

it("operasyon cihazı, katalogda yetkisi olmayan sipariş durumunu SQL ile veremez", async () => {
  const f = await pair();
  expect(
    await f.client("PUT", `/v1/device/orders/${f.order.id}/status`, {
      expectedVersion: 1,
      status: "cancelled",
    }),
  ).toMatchObject({ status: 403 });
  await expect(
    scoped(app.db, f.businessId, async (tx) => {
      await tx.execute(sql`select set_config('vado.order_actor_kind','device',true)`);
      await tx.execute(sql`select set_config('vado.order_actor_id',${f.deviceId},true)`);
      await tx.execute(sql`update orders set version=version+1,status='cancelled'
        where business_id=${f.businessId} and id=${f.order.id}`);
    }),
  ).rejects.toMatchObject({ code: "23514" });
});

it("başka işletmenin cihazı izinli bir durumu bile bu işletmenin siparişine yazamaz", async () => {
  const owner = await pair();
  const target = await createRestaurantFixture(app);
  await expect(
    scoped(app.db, target.businessId, async (tx) => {
      await tx.execute(sql`select set_config('vado.order_actor_kind','device',true)`);
      await tx.execute(sql`select set_config('vado.order_actor_id',${owner.deviceId},true)`);
      await tx.execute(sql`update orders set version=version+1,status='accepted'
        where business_id=${target.businessId} and id=${target.order.id}`);
    }),
  ).rejects.toMatchObject({ code: "23514" });
  const order = await scoped(app.migrationDb, target.businessId, (tx) =>
    tx.one<{ status: string; version: number }>(sql`
      select status,version from orders where business_id=${target.businessId}
        and id=${target.order.id}
    `),
  );
  expect(order).toEqual({ status: "placed", version: 1 });
});

it("kapatılan cihaz izinli sipariş durumunu SQL üzerinden de yazamaz", async () => {
  const fixture = await pair();
  expect(
    await as(app, fixture.owner).request(
      "POST",
      `/v1/business/${fixture.businessId}/devices/${fixture.deviceId}/revoke`,
      { body: {} },
    ),
  ).toMatchObject({ status: 200 });
  await expect(
    scoped(app.db, fixture.businessId, async (tx) => {
      await tx.execute(sql`select set_config('vado.order_actor_kind','device',true)`);
      await tx.execute(sql`select set_config('vado.order_actor_id',${fixture.deviceId},true)`);
      await tx.execute(sql`update orders set version=version+1,status='accepted'
        where business_id=${fixture.businessId} and id=${fixture.order.id}`);
    }),
  ).rejects.toMatchObject({ code: "23514" });
  const order = await scoped(app.migrationDb, fixture.businessId, (tx) =>
    tx.one<{ status: string; version: number }>(sql`
      select status,version from orders where business_id=${fixture.businessId}
        and id=${fixture.order.id}
    `),
  );
  expect(order).toEqual({ status: "placed", version: 1 });
});

it("SQL cihaz aktörü, eşleşen cihaz kapsamı olmadan durum değiştiremez", async () => {
  const f = await pair();
  // İşletme kapsamındaki bir bağlantı cihaz kimliğini GUC üzerinden taklit edemez.
  await expect(
    scoped(app.db, f.businessId, async (tx) => {
      await tx.execute(sql`select set_config('vado.order_actor_kind','device',true)`);
      await tx.execute(sql`select set_config('vado.order_actor_id',${f.deviceId},true)`);
      await tx.execute(sql`update orders set version=version+1,status='accepted'
        where business_id=${f.businessId} and id=${f.order.id}`);
    }),
  ).rejects.toMatchObject({ code: "23514" });
  const unchanged = await scoped(app.migrationDb, f.businessId, (tx) =>
    tx.one<{ status: string; version: number }>(sql`
      select status,version from orders where business_id=${f.businessId} and id=${f.order.id}
    `),
  );
  expect(unchanged).toEqual({ status: "placed", version: 1 });

  // İki cihaz aynı işletme, şube ve pakete bağlı olsa bile kimlikleri değiştirilemez.
  const challenge = await anonymous(app).ok(
    z.object({ id: z.uuid(), code: z.string() }),
    "POST",
    "/v1/device-pairings",
    { body: {} },
  );
  const second = await as(app, f.owner).ok(
    z.object({ id: z.uuid() }),
    "POST",
    `/v1/business/${f.businessId}/devices`,
    {
      body: {
        code: challenge.code,
        label: "İkinci operasyon cihazı",
        branchId: f.branchId,
        appInstanceId: f.instanceId,
      },
    },
  );
  const firstScope = await app.services.operationDevices.authenticate(f.token);
  await expect(
    withTenant(app.db, firstScope, async (tx) => {
      await tx.execute(sql`select set_config('vado.order_actor_kind','device',true)`);
      await tx.execute(sql`select set_config('vado.order_actor_id',${second.id},true)`);
      await tx.execute(sql`update orders set version=version+1,status='accepted'
        where business_id=${f.businessId} and id=${f.order.id}`);
    }),
  ).rejects.toMatchObject({ code: "23514" });

  // Aynı cihazın gerçek oturumu üzerinden aynı geçiş geçerlidir.
  const accepted = await f.client("POST", `/v1/device/orders/${f.order.id}/accept`, {
    expectedVersion: 1,
    preparationMinutes: 15,
  });
  expect(accepted.status).toBe(200);
});

it("cihaz, kendisinden önce açılmış cihaz paketsiz siparişleri göremez", async () => {
  const fixture = await createCatalogFixture(app);
  await app.services.businessManagement.setHours(fixture.scope, fixture.branchId, {
    hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: 0, closesAt: 1440 })),
  });
  const pickup = await as(app, fixture.owner).request(
    "PUT",
    `/v1/business/${fixture.businessId}/app-instances/${fixture.instanceId}/capabilities/ordering.pickup`,
    { body: { version: "1.0.0", enabled: true, config: {} } },
  );
  expect(pickup.status).toBe(200);
  async function placeOrder() {
    const opened = await app.services.ordering.openCart(fixture.customerScope, fixture.branchId);
    const cart = await app.services.ordering.replaceCart(fixture.customerScope, opened.id, {
      expectedVersion: opened.version,
      lines: [{ itemId: fixture.itemId, quantity: 1, optionIds: [], note: "" }],
    });
    const response = await app.services.ordering.checkout(fixture.customerScope, cart.id, cart.id, {
      cartVersion: cart.version,
      seenTotalMinor: cart.totalMinor,
      quoteHash: cart.quoteHash,
    });
    expect(response.status).toBe(200);
    return orderSchema.parse(response.body);
  }
  const earlier = await placeOrder();
  const enabled = await as(app, fixture.owner).request(
    "PUT",
    `/v1/business/${fixture.businessId}/app-instances/${fixture.instanceId}/capabilities/ordering.kitchen`,
    { body: { version: "1.0.0", enabled: true, config: {} } },
  );
  expect(enabled.status).toBe(200);
  const later = await placeOrder();
  const challenge = await anonymous(app).ok(
    z.object({ id: z.uuid(), code: z.string(), secret: z.string() }),
    "POST",
    "/v1/device-pairings",
    { body: {} },
  );
  const registeredDevice = await as(app, fixture.owner).ok(
    z.object({ id: z.uuid() }),
    "POST",
    `/v1/business/${fixture.businessId}/devices`,
    {
      body: {
        code: challenge.code,
        label: "Operasyon tableti",
        branchId: fixture.branchId,
        appInstanceId: fixture.instanceId,
      },
    },
  );
  const approved = await anonymous(app).ok(
    z.object({ status: z.literal("approved"), token: z.string() }),
    "POST",
    `/v1/device-pairings/${challenge.id}/poll`,
    { body: { secret: challenge.secret } },
  );
  // Sipariş cihaz paketini taşısa bile bir SQL bağlantısı yalnız aktör adını
  // ayarlayarak cihaz gibi teşvik yaşam döngüsünü işletemez.
  const unauthorisedNewLifecycle = await scoped(app.db, fixture.businessId, async (tx) => {
    await tx.execute(sql`select set_config('vado.order_actor_kind','device',true)`);
    await tx.execute(sql`select set_config('vado.order_actor_id',${registeredDevice.id},true)`);
    return tx.one<{ result: { error?: string } }>(sql`
      select incentive_lifecycle(${fixture.businessId},${later.id},'complete') as result
    `);
  });
  expect(unauthorisedNewLifecycle.result).toEqual({ error: "forbidden" });
  // Cihazın sipariş listesi filtresi tek başına yeterli değildir: SQL teşvik işlemi de
  // cihazın daha önce açılmış sipariş üzerinde işlem yapmasını reddetmelidir.
  const snapshot = await scoped(app.db, fixture.businessId, (tx) =>
    tx.one<{ exists: boolean }>(sql`
      select incentive_snapshot is not null as exists from orders
      where business_id=${fixture.businessId} and id=${earlier.id}
    `),
  );
  expect(snapshot.exists).toBe(true);
  const unauthorisedLifecycle = await scoped(app.db, fixture.businessId, async (tx) => {
    await tx.execute(sql`select set_config('vado.order_actor_kind','device',true)`);
    await tx.execute(sql`select set_config('vado.order_actor_id',${registeredDevice.id},true)`);
    const response = await tx.one<{ result: { error?: string } }>(sql`
      select incentive_lifecycle(${fixture.businessId},${earlier.id},'complete') as result
    `);
    return response.result;
  });
  expect(unauthorisedLifecycle).toEqual({ error: "forbidden" });
  const headers = { authorization: `Bearer ${approved.token}` };
  expect(
    await anonymous(app).request("GET", `/v1/device/orders/${earlier.id}`, { headers }),
  ).toMatchObject({ status: 404 });
  const list = await anonymous(app).request("GET", "/v1/device/orders", { headers });
  expect(list.status).toBe(200);
  const items = z.object({ items: z.array(z.object({ id: z.uuid() })) }).parse(list.body).items;
  expect(items.map((item) => item.id)).toContain(later.id);
  expect(items.map((item) => item.id)).not.toContain(earlier.id);
  const replayResponse = await anonymous(app).request("GET", "/v1/device/live-events?cursor=0", {
    headers,
  });
  expect(replayResponse.status).toBe(200);
  const replay = z
    .object({ items: z.array(z.object({ orderId: z.uuid().nullable() })) })
    .parse(replayResponse.body);
  expect(replay.items.map((event) => event.orderId)).toContain(later.id);
  expect(replay.items.map((event) => event.orderId)).not.toContain(earlier.id);
  expect(
    await anonymous(app).request("PUT", `/v1/device/orders/${earlier.id}/status`, {
      headers,
      body: { expectedVersion: earlier.version, status: "accepted" },
    }),
  ).toMatchObject({ status: 404 });
});

it("yayımlanmamış eski cihaz uçları kapalıdır", async () => {
  const f = await pair();
  expect(await f.client("GET", "/v1/kitchen/orders")).toMatchObject({ status: 404 });
  expect(await f.client("GET", `/v1/business/${f.businessId}/kitchen-devices`)).toMatchObject({
    status: 404,
  });
});

it("eski cihaz tabloları taşınır ve bağlı nesnelerin adları güncellenir", async () => {
  const tables = await app.migrationDb.many<{ relname: string }>(sql`
    select relname from pg_class where relkind in ('r', 'p') and relname in (
      'kitchen_devices', 'kitchen_pairings', 'kitchen_socket_tickets',
      'operation_devices', 'operation_device_pairings', 'operation_device_tickets'
    ) order by relname
  `);
  expect(tables.map((row) => row.relname)).toEqual([
    "operation_device_pairings",
    "operation_device_tickets",
    "operation_devices",
  ]);
  const legacyNames = await app.migrationDb.many<{ name: string }>(sql`
    select conname as name from pg_constraint
      where conrelid in ('operation_devices'::regclass,
        'operation_device_pairings'::regclass, 'operation_device_tickets'::regclass)
        and conname like '%kitchen%'
    union all
    select ic.relname as name from pg_index ix join pg_class ic on ic.oid=ix.indexrelid
      where ix.indrelid in ('operation_devices'::regclass,
        'operation_device_pairings'::regclass, 'operation_device_tickets'::regclass)
        and ic.relname like '%kitchen%'
  `);
  expect(legacyNames).toEqual([]);
  const guards = await app.migrationDb.many<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(sql`
    select relname, relrowsecurity, relforcerowsecurity from pg_class
    where relname in (
      'operation_devices', 'operation_device_pairings', 'operation_device_tickets'
    ) order by relname
  `);
  expect(guards).toEqual(
    tables.map((table) => ({
      relname: table.relname,
      relrowsecurity: true,
      relforcerowsecurity: true,
    })),
  );
  const staleFunctions = await app.migrationDb.many<{ proname: string }>(sql`
    select proname from pg_proc where prosrc ilike '%kitchen_devices%'
      or prosrc ilike '%kitchen_pairings%' or prosrc ilike '%kitchen_socket_tickets%'
  `);
  expect(staleFunctions).toEqual([]);
});

it("cihaz durumları katalogda sözleşme biçimine uyar", async () => {
  for (const statuses of ['{""}', "{NULL}", "{invalid-status}"]) {
    await expect(
      app.migrationDb.execute(sql`
      update capability_catalog set device_statuses=${statuses}::text[]
      where id='ordering.kitchen' and version='1.0.0'
    `),
    ).rejects.toMatchObject({ code: "23514" });
  }
});

it("kişisel SQL kimliği açıkken aynı işletmenin cihaz kapsamına geçilemez", async () => {
  const f = await pair();
  const device = await app.services.operationDevices.authenticate(f.token);
  const isolated = await withTenant(app.db, device, (tx) =>
    tx.one<{ user_id: string | null }>(sql`
      select nullif(current_setting('vado.user_id', true), '') as user_id
    `),
  );
  expect(isolated.user_id).toBeNull();
  await withTenant(app.db, f.scope, async (tx) => {
    await expect(withTenant(tx, device, () => Promise.resolve())).rejects.toMatchObject({
      code: "forbidden",
    });
  });
  await withTenant(app.db, device, async (tx) => {
    await expect(withTenant(tx, f.scope, () => Promise.resolve())).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
