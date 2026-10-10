import { CORE_ORDER_GRAPH } from "@vado/contracts";
import { expect, test } from "vitest";

import {
  CAPABILITY_DEFINITIONS,
  compileOrderWorkflow,
  getCapabilityCatalog,
  permitOrderTransition,
  PREPARATION_MANIFEST,
  validateCapabilitySelection,
} from "../src/modules/capabilities/capabilities.registry";

function insertion() {
  const manifest = structuredClone(PREPARATION_MANIFEST);
  const point = manifest.stateMachine.insertions[0];
  if (point === undefined) throw new Error("Hazırlık ekleme noktası yok");
  return { manifest, point };
}

test("Studio sözleşmesi Zod'dan JSON Schema üretir; kod ve müşteri ekranı taşımaz", () => {
  const catalog = getCapabilityCatalog();
  expect(catalog).toMatchObject({
    manifestSchema: {
      type: "object",
      additionalProperties: false,
    },
  });
  for (const field of ["id", "version", "stateMachine", "businessBlocks"])
    expect(catalog.manifestSchema.required).toContain(field);
  expect(catalog.engines.map((m) => m.id)).toEqual(["ordering"]);
  const manifest = catalog.packages[0];
  expect(manifest).toMatchObject({
    id: "ordering.preparation",
    version: "1.0.0",
    engine: "ordering",
    defaults: { stationLabel: "Hazırlık" },
    configSchema: { type: "object", additionalProperties: false },
    customerBlocks: [],
  });
  expect(Object.keys(manifest ?? {}).sort()).toEqual(
    [
      "api",
      "businessBlocks",
      "closableWithActiveOrders",
      "configSchema",
      "customerBlocks",
      "defaults",
      "dependsOn",
      "engine",
      "events",
      "id",
      "permissions",
      "role",
      "stateMachine",
      "validation",
      "version",
    ].sort(),
  );
  expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog);
});

test("bağımlılık, yayımlanmış sürüm ve ayar şeması doğrulanır", () => {
  const setting = {
    capabilityId: "ordering.preparation",
    version: "1.0.0",
    enabled: true,
    config: {},
  };
  expect(validateCapabilitySelection([setting])[0]?.config).toEqual({ stationLabel: "Hazırlık" });
  expect(() => validateCapabilitySelection([{ ...setting, version: "99.0.0" }])).toThrow("sürüm");
  expect(() =>
    validateCapabilitySelection([{ ...setting, config: { script: "process.exit()" } }]),
  ).toThrow("ayar");
  expect(() => validateCapabilitySelection([{ ...setting, capabilityId: "harici.kod" }])).toThrow(
    "kayıtlı",
  );
  const broken = CAPABILITY_DEFINITIONS.map((d) =>
    d.manifest.id === "ordering.preparation"
      ? {
          ...d,
          manifest: { ...d.manifest, dependsOn: [{ id: "ordering.missing", version: "1.0.0" }] },
        }
      : d,
  );
  expect(() => validateCapabilitySelection([setting], broken)).toThrow("Bağımlılık");
  const mismatch = CAPABILITY_DEFINITIONS.map((d) =>
    d.manifest.id === "ordering.preparation"
      ? { ...d, manifest: { ...d.manifest, dependsOn: [{ id: "ordering", version: "2.0.0" }] } }
      : d,
  );
  expect(() => validateCapabilitySelection([setting], mismatch)).toThrow("Bağımlılık");
});

test("hazırlık yalnızca kabul ve tamamlanma arasını genişletir; terminal durumlar aynıdır", () => {
  const { graph } = compileOrderWorkflow([PREPARATION_MANIFEST]);
  expect(graph.accepted).toEqual(["preparing", "cancelled"]);
  expect(graph.preparing).toEqual(["ready", "cancelled"]);
  expect(graph.ready).toEqual(["completed", "cancelled"]);
  for (const name of ["placed", "rejected", "completed", "cancelled"])
    expect(graph[name]).toEqual(CORE_ORDER_GRAPH[name]);
  expect(permitOrderTransition([], "accepted", "completed")).toBe(true);
  expect(permitOrderTransition(["ordering.preparation@1.0.0"], "accepted", "preparing")).toBe(true);
  expect(permitOrderTransition(["ordering.preparation@1.0.0"], "accepted", "completed")).toBe(
    false,
  );
  expect(permitOrderTransition(["ordering.preparation@99.0.0"], "accepted", "preparing")).toBe(
    false,
  );
});

test("bağımlılık döngüsü ve yinelenen paket ayarı reddedilir", () => {
  const original = CAPABILITY_DEFINITIONS.find((d) => d.manifest.id === "ordering.preparation");
  if (original === undefined) throw new Error("Paket bulunamadı");
  const definitions = [
    {
      ...original,
      manifest: {
        ...original.manifest,
        id: "ordering.first",
        dependsOn: [{ id: "ordering.second", version: "1.0.0" }],
        stateMachine: { insertions: [] },
      },
    },
    {
      ...original,
      manifest: {
        ...original.manifest,
        id: "ordering.second",
        dependsOn: [{ id: "ordering.first", version: "1.0.0" }],
        stateMachine: { insertions: [] },
      },
    },
  ];
  const settings = definitions.map((d) => ({
    capabilityId: d.manifest.id,
    version: "1.0.0",
    enabled: true,
    config: {},
  }));
  expect(() => validateCapabilitySelection(settings, definitions)).toThrow("Bağımlılık döngüsü");
  expect(() => validateCapabilitySelection([...settings, ...settings], definitions)).toThrow(
    "tekil",
  );
});

test("döngü, erişilemeyen durum, bitişe ekleme ve bilinmeyen kural reddedilir", () => {
  const cycle = insertion();
  const first = cycle.point.states[0];
  if (first === undefined) throw new Error("Hazırlık durumu yok");
  first.transitions.push({ to: "preparing", rule: "always" });
  expect(() => compileOrderWorkflow([cycle.manifest])).toThrow("Döngü");
  const unreachable = insertion();
  unreachable.point.states.push({
    id: "unused",
    transitions: [{ to: "completed", rule: "always" }],
  });
  expect(() => compileOrderWorkflow([unreachable.manifest])).toThrow("Erişilemeyen");
  const terminal = insertion();
  terminal.point.from = "completed";
  expect(() => compileOrderWorkflow([terminal.manifest])).toThrow("Ekleme noktası");
  const unknown = insertion();
  const state = unknown.point.states[0];
  if (state === undefined) throw new Error("Hazırlık durumu yok");
  state.transitions.push({ to: "completed", rule: "run_external_code" });
  expect(() => compileOrderWorkflow([unknown.manifest])).toThrow("Kayıtlı olmayan kural");
  expect(() => compileOrderWorkflow([PREPARATION_MANIFEST, PREPARATION_MANIFEST])).toThrow(
    "Ekleme noktası",
  );
});
