import { randomUUID } from "node:crypto";

import {
  fulfilmentSchema,
  liveEventSchema,
  ORDER_CONTEXT_KINDS,
  tableSessionSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import {
  CAPABILITY_DEFINITIONS,
  CapabilityValidationError,
  compileOrderWorkflow,
  validateCapabilitySelection,
} from "../src/modules/capabilities/capabilities.registry";
import { createCatalogFixture } from "./support/catalog-fixture";
import { as, startTestApp, type TestApp } from "./support/harness";
import { createRestaurantFixture } from "./support/restaurant-fixture";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

interface CatalogRow {
  id: string;
  version: string;
  role: string;
  requires: string[][];
  insertions: unknown[];
  default_config: Record<string, unknown>;
  closable_with_active_orders: boolean;
  explicit_modes: boolean;
  opening_hours: boolean;
  decision_required: boolean;
}

const packages = CAPABILITY_DEFINITIONS.filter((d) => d.manifest.id !== "ordering");
const MODES = [null, "pickup", "dine_in", "delivery"] as const;

/** Bütün paket bileşimleri (2^n). Geçerli olanlar da geçersiz olanlar da karşılaştırılır. */
function combinations(): (typeof packages)[] {
  return Array.from({ length: 2 ** packages.length }, (_, mask) =>
    packages.filter((_, index) => (mask & (1 << index)) !== 0),
  );
}

function tsValid(selection: typeof packages): boolean {
  try {
    validateCapabilitySelection(
      selection.map((d) => ({
        capabilityId: d.manifest.id,
        version: d.manifest.version,
        enabled: true,
        config: d.manifest.defaults,
      })),
    );
    return true;
  } catch (error) {
    if (error instanceof CapabilityValidationError) return false;
    throw error;
  }
}

describe("sipariş paket kataloğu", () => {
  it("SQL kataloğu paket manifestleriyle aynıdır", async () => {
    const rows = await app.db.many<CatalogRow>(
      sql`select id, version, role, requires, insertions, default_config, closable_with_active_orders,
          explicit_modes, opening_hours, decision_required
        from capability_catalog where engine = 'ordering' order by id`,
    );
    const expected = packages
      .map(({ manifest }) => ({
        id: manifest.id,
        version: manifest.version,
        role: manifest.role,
        requires: manifest.dependsOn
          .filter((dependency) => dependency.id !== "ordering")
          .map((dependency) =>
            [dependency.id, ...(dependency.alternatives ?? [])].map(
              (id) => `${id}@${dependency.version}`,
            ),
          ),
        insertions: manifest.stateMachine.insertions.map((insertion) => ({
          from: insertion.from,
          to: insertion.to,
          entry: insertion.entry,
          ...(insertion.fulfilments === undefined ? {} : { fulfilments: insertion.fulfilments }),
          states: insertion.states.map((state) => ({
            id: state.id,
            next: state.transitions.map((transition) => transition.to),
          })),
        })),
        default_config: manifest.defaults,
        closable_with_active_orders: manifest.closableWithActiveOrders,
        explicit_modes: manifest.intake.explicitModes,
        opening_hours: manifest.intake.openingHours,
        decision_required: manifest.operations?.decisionRequired ?? false,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(rows).toEqual(expected);
  });

  it("her bileşimde geçerlilik ve her teslim biçiminde akış iki tarafta aynıdır", async () => {
    const selections = combinations();
    const keys = selections.map((selection) =>
      selection.map((d) => `${d.manifest.id}@${d.manifest.version}`).sort(),
    );
    const results = await app.db.many<{
      position: string;
      valid: boolean;
      graphs: (Record<string, string[]> | null)[];
    }>(sql`
      select t.position, ordering_capabilities_valid(t.capabilities) as valid,
        array[
          ordering_compile_graph(t.capabilities, null),
          ordering_compile_graph(t.capabilities, 'pickup'),
          ordering_compile_graph(t.capabilities, 'dine_in'),
          ordering_compile_graph(t.capabilities, 'delivery')
        ] as graphs
      from jsonb_array_elements(${JSON.stringify(keys)}::jsonb)
        with ordinality as t(capabilities, position)
      order by t.position
    `);
    expect(results).toHaveLength(selections.length);
    let valid = 0;
    for (const [index, selection] of selections.entries()) {
      const row = results[index];
      if (row === undefined) throw new Error("Eksik sonuç");
      const expected = tsValid(selection);
      expect({ capabilities: keys[index], valid: row.valid }).toEqual({
        capabilities: keys[index],
        valid: expected,
      });
      if (!expected) continue;
      valid++;
      const manifests = selection.map((d) => d.manifest);
      for (const [modeIndex, mode] of MODES.entries())
        expect(row.graphs[modeIndex]).toEqual(
          compileOrderWorkflow(manifests, mode ?? undefined).graph,
        );
    }
    // 256 bileşimin geçerli olanları; yeni paket eklenince bu sayı bilerek güncellenir.
    expect(valid).toBe(120);
  });

  it("teslim biçimi, bağlam ve canlı olay türü kayıtları sözleşmeyle aynıdır", async () => {
    const modes = await app.db.many<{ code: string }>(
      sql`select code from ordering_fulfilment_modes order by code`,
    );
    expect(modes.map((m) => m.code)).toEqual([...fulfilmentSchema.options].sort());
    const kinds = await app.db.many<{ kind: string }>(
      sql`select kind from ordering_context_kinds order by kind`,
    );
    expect(kinds.map((k) => k.kind)).toEqual([...ORDER_CONTEXT_KINDS].sort());
    const types = await app.db.many<{ type: string }>(
      sql`select type from live_event_types order by type`,
    );
    expect(types.map((t) => t.type)).toEqual([...liveEventSchema.shape.type.options].sort());
  });

  it("uygulama rolleri kataloğa yazamaz", async () => {
    await expect(
      app.db.execute(
        sql`insert into capability_catalog(id, version, engine, role) values ('harici.paket', '1.0.0', 'ordering', 'workflow')`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      app.db.execute(sql`update capability_catalog set closable_with_active_orders = true`),
    ).rejects.toMatchObject({ code: "42501" });
    for (const statement of [
      sql`update ordering_fulfilment_modes set payment_places = '{counter,table}'`,
      sql`insert into ordering_context_kinds (kind, capability_id, capability_version) values ('sahte', 'ordering.pickup', '1.0.0')`,
      sql`insert into live_event_types (type) values ('sahte.olay')`,
    ])
      await expect(app.db.execute(statement)).rejects.toMatchObject({ code: "42501" });
  });

  it("ayar verilmezse katalogdaki varsayılan yazılır; geçersiz ayar reddedilir", async () => {
    const f = await createTenantFixture(app);
    const stored = await scoped(app.db, f.businessId, async (tx) => {
      await tx.execute(sql`insert into app_instance_capabilities(business_id, app_instance_id, capability_id, version)
        values (${f.businessId}, ${f.instanceId}, 'ordering.preparation', '1.0.0')`);
      return tx.one<{ config: unknown }>(sql`select config from app_instance_capabilities
        where business_id = ${f.businessId} and capability_id = 'ordering.preparation'`);
    });
    expect(stored.config).toEqual({ stationLabel: "Hazırlık" });
    await expect(
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`insert into app_instance_capabilities(business_id, app_instance_id, capability_id, version, config)
          values (${f.businessId}, ${f.instanceId}, 'ordering.pickup', '1.0.0', '{"x": 1}'::jsonb)`),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("durum ekleyen paket etkin siparişte kapatılır; davranış ekleyen paket kapatılamaz", async () => {
    const f = await createCatalogFixture(app);
    for (const id of ["ordering.preparation", "ordering.returns"])
      expect(
        (
          await as(app, f.owner).request(
            "PUT",
            `/v1/business/${f.businessId}/app-instances/${f.instanceId}/capabilities/${id}`,
            { body: { version: "1.0.0", enabled: true, config: {} } },
          )
        ).status,
      ).toBe(200);
    const opened = await app.services.ordering.openCart(f.customerScope, f.branchId);
    const cart = await app.services.ordering.replaceCart(f.customerScope, opened.id, {
      expectedVersion: opened.version,
      lines: [{ itemId: f.itemId, quantity: 1, optionIds: [f.optionId] }],
    });
    const placed = await app.services.ordering.checkout(f.customerScope, cart.id, randomUUID(), {
      cartVersion: cart.version,
      seenTotalMinor: cart.totalMinor,
      quoteHash: cart.quoteHash,
    });
    expect(placed.status).toBe(200);
    const disable = (id: string) =>
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`update app_instance_capabilities set enabled = false
          where business_id = ${f.businessId} and app_instance_id = ${f.instanceId} and capability_id = ${id}`),
      );
    await expect(disable("ordering.returns")).rejects.toMatchObject({ code: "23514" });
    await disable("ordering.preparation");
  });

  it("masa servisi açık masa varken kapatılamaz; masa kapanınca kapatılır", async () => {
    const f = await createRestaurantFixture(app);
    await app.services.ordering.reject(f.scope, f.order.id, {
      expectedVersion: f.order.version,
      reason: "Deneme için reddedildi",
    });
    const owner = as(app, f.owner);
    const root = `/v1/business/${f.businessId}`;
    const table = await owner.ok(z.object({ id: z.uuid() }), "POST", `${root}/tables`, {
      body: { branchId: f.branchId, appInstanceId: f.instanceId, label: "Masa 3", active: true },
    });
    const qr = await owner.ok(
      z.object({ value: z.string() }),
      "POST",
      `${root}/tables/${table.id}/qr`,
      { body: {} },
    );
    const session = await as(app, f.customer).ok(
      tableSessionSchema,
      "POST",
      `/v1/shell/${f.businessId}/${f.instanceId}/table-sessions`,
      { body: { qr: qr.value } },
    );
    const disable = () =>
      scoped(app.db, f.businessId, (tx) =>
        tx.execute(sql`update app_instance_capabilities set enabled = false
          where business_id = ${f.businessId} and app_instance_id = ${f.instanceId}
            and capability_id = 'ordering.table_service'`),
      );
    await expect(disable()).rejects.toMatchObject({ code: "23514" });
    expect(
      (
        await owner.request("POST", `${root}/table-sessions/${session.id}/close`, {
          body: { expectedVersion: session.version },
        })
      ).status,
    ).toBe(200);
    await disable();
  });
});
