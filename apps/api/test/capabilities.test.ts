import {
  engineCapabilityCatalogSchema,
  instanceCapabilitiesSchema,
  orderSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { anonymous, as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createOrderingFixture } from "./support/ordering-fixture";
import { scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

test("açık sözleşme ve işletme ayarı doğrulanır; personel ve yabancı müşteri ayar değiştiremez", async () => {
  const catalog = await anonymous(app).ok(engineCapabilityCatalogSchema, "GET", "/v1/capabilities");
  expect(catalog.packages.map((m) => m.id)).toEqual([
    "ordering.preparation",
    "ordering.table_service",
    "ordering.pickup",
    "ordering.scheduling",
    "ordering.kitchen",
  ]);
  const f = await createOrderingFixture(app);
  const path = `/v1/business/${f.businessId}/app-instances/${f.instanceId}/capabilities`;
  const body = { version: "1.0.0", enabled: true, config: { stationLabel: "Paketleme" } };
  await as(app, f.owner).fail("validation_failed", "PUT", `${path}/ordering.preparation`, {
    body: { ...body, version: "9.0.0" },
  });
  await as(app, f.owner).fail("validation_failed", "PUT", `${path}/ordering.preparation`, {
    body: { ...body, config: { execute: "kod" } },
  });
  await as(app, f.customer).fail("forbidden", "PUT", `${path}/ordering.preparation`, { body });
  const staff = await createUser(app, "Personel");
  await app.services.businessManagement.setMember(f.scope, {
    userId: staff.id,
    role: "staff",
    active: true,
  });
  await as(app, staff).fail("forbidden", "PUT", `${path}/ordering.preparation`, { body });
  const saved = await as(app, f.owner).ok(
    instanceCapabilitiesSchema,
    "PUT",
    `${path}/ordering.preparation`,
    { body },
  );
  expect(saved.businessBlocks.map((b) => b.title)).toContain("Paketleme");
  expect(saved.stateGraph.accepted).toEqual(["preparing", "cancelled"]);
});

test("paket kapanınca yeni sipariş çekirdeği kullanır; başlamış hazırlık kendi görüntüsüyle tamamlanır", async () => {
  const f = await createOrderingFixture(app);
  const path = `/v1/business/${f.businessId}/app-instances/${f.instanceId}/capabilities/ordering.preparation`;
  await as(app, f.owner).ok(instanceCapabilitiesSchema, "PUT", path, {
    body: { version: "1.0.0", enabled: true, config: {} },
  });
  const coreOrder = await app.services.ordering.getOrder(f.customerScope, f.order.id);
  expect(coreOrder.capabilities).toEqual([]);
  const open = await app.services.ordering.openCart(f.customerScope, f.branchId);
  const cart = await app.services.ordering.replaceCart(f.customerScope, open.id, {
    expectedVersion: open.version,
    lines: [{ itemId: f.itemId, quantity: 1, optionIds: [] }],
  });
  const prepared = orderSchema.parse(
    (
      await app.services.ordering.checkout(f.customerScope, cart.id, "hazirlik-1", {
        cartVersion: cart.version,
        seenTotalMinor: cart.totalMinor,
        quoteHash: cart.quoteHash,
      })
    ).body,
  );
  expect(prepared.capabilities).toEqual(["ordering.preparation@1.0.0"]);
  await as(app, f.owner).ok(instanceCapabilitiesSchema, "PUT", path, {
    body: { version: "1.0.0", enabled: false, config: {} },
  });
  let current = prepared;
  for (const status of ["accepted", "preparing", "ready", "completed"])
    current = await app.services.ordering.updateStatus(f.scope, current.id, {
      expectedVersion: current.version,
      status,
    });
  expect(current.history.map((h) => h.toStatus)).toEqual([
    "placed",
    "accepted",
    "preparing",
    "ready",
    "completed",
  ]);
  await expect(
    app.services.ordering.updateStatus(f.scope, current.id, {
      expectedVersion: current.version,
      status: "cancelled",
    }),
  ).rejects.toMatchObject({ code: "order_state_invalid" });
  const graph = await scoped(app.db, f.businessId, (tx) =>
    tx.one<{ graph: object }>(
      sql`select ordering_workflow_for_instance(${f.businessId},${f.instanceId}) as graph`,
    ),
  );
  expect(graph.graph).toMatchObject({ accepted: ["completed", "cancelled"] });
});
