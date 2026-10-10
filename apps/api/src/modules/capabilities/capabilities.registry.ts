import {
  type BusinessBlock,
  type CapabilitySetting,
  CORE_ORDER_GRAPH,
  engineCapabilityConfigSchema,
  type EngineCapabilityManifest,
  engineCapabilityManifestSchema,
  TERMINAL_ORDER_STATES,
} from "@vado/contracts";
import { z } from "zod";

export class CapabilityValidationError extends Error {}
const coreConfig = z.object({}).strict();
const preparationConfig = z
  .object({
    stationLabel: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .meta({ title: "Hazırlık alanının adı" })
      .default("Hazırlık"),
  })
  .strict();
const namedRules: Readonly<Record<string, () => boolean>> = { always: () => true };
const allowedInsertionPoints = [
  { from: "accepted", to: "completed" },
  { from: "ready", to: "completed" },
] as const;

const CORE_MANIFEST = engineCapabilityManifestSchema.parse({
  id: "ordering",
  version: "1.0.0",
  engine: "ordering",
  dependsOn: [],
  configSchema: z.toJSONSchema(coreConfig),
  defaults: {},
  permissions: [
    "orders.read",
    "orders.update",
    "returns.read",
    "returns.decide",
    "reviews.read",
    "reviews.reply",
    "catalog.read",
    "catalog.write",
    "branches.read",
    "branches.write",
    "settings.read",
    "settings.write",
  ],
  events: { publishes: ["order.placed", "order.status_changed"], subscribes: [] },
  stateMachine: { insertions: [] },
  api: [
    {
      id: "orders.list",
      method: "GET",
      path: "/v1/business/:businessId/orders",
      permission: "orders.read",
    },
    {
      id: "orders.status",
      method: "PUT",
      path: "/v1/business/:businessId/orders/:id/status",
      permission: "orders.update",
    },
    {
      id: "returns.list",
      method: "GET",
      path: "/v1/business/:businessId/returns",
      permission: "returns.read",
    },
    {
      id: "returns.decision",
      method: "PUT",
      path: "/v1/business/:businessId/returns/:id/decision",
      permission: "returns.decide",
    },
    {
      id: "reviews.list",
      method: "GET",
      path: "/v1/business/:businessId/reviews",
      permission: "reviews.read",
    },
    {
      id: "reviews.reply",
      method: "PUT",
      path: "/v1/business/:businessId/reviews/:id/reply",
      permission: "reviews.reply",
    },
    {
      id: "catalog.read",
      method: "GET",
      path: "/v1/business/:businessId/catalog",
      permission: "catalog.read",
    },
  ],
  customerBlocks: [],
  businessBlocks: [
    { id: "orders", title: "Siparişler", view: "orders", path: "/orders" },
    { id: "returns", title: "İadeler", view: "returns", path: "/returns" },
    { id: "reviews", title: "Değerlendirmeler", view: "reviews", path: "/reviews" },
    { id: "catalog", title: "Ürünler", view: "catalog", path: "/catalog" },
    { id: "branches", title: "Şubeler", view: "branches", path: "/branches" },
    { id: "settings", title: "Ayarlar", view: "settings", path: "/settings" },
  ],
  validation: [
    "tenant_scope",
    "minor_units",
    "expected_version",
    "immutable_snapshot",
    "registered_rules",
  ],
});

export const PREPARATION_MANIFEST = engineCapabilityManifestSchema.parse({
  id: "ordering.preparation",
  version: "1.0.0",
  engine: "ordering",
  dependsOn: [{ id: "ordering", version: "1.0.0" }],
  configSchema: z.toJSONSchema(preparationConfig),
  defaults: preparationConfig.parse({}),
  permissions: ["orders.read", "orders.update", "settings.write"],
  events: { publishes: ["order.status_changed"], subscribes: [] },
  stateMachine: {
    insertions: [
      {
        from: "accepted",
        to: "completed",
        entry: "preparing",
        states: [
          {
            id: "preparing",
            transitions: [
              { to: "ready", rule: "always" },
              { to: "cancelled", rule: "always" },
            ],
          },
          {
            id: "ready",
            transitions: [
              { to: "completed", rule: "always" },
              { to: "cancelled", rule: "always" },
            ],
          },
        ],
      },
    ],
  },
  api: [
    {
      id: "orders.preparation",
      method: "PUT",
      path: "/v1/business/:businessId/orders/:id/status",
      permission: "orders.update",
    },
  ],
  customerBlocks: [],
  businessBlocks: [
    {
      id: "preparation",
      title: "Hazırlık",
      view: "orders",
      path: "/orders?queue=preparation",
      states: ["accepted", "preparing", "ready"],
      titleConfigKey: "stationLabel",
    },
  ],
  validation: [
    "known_dependencies",
    "exact_versions",
    "config_schema",
    "acyclic_workflow",
    "reachable_workflow",
    "core_terminals_unchanged",
    "registered_rules",
  ],
});

export const KITCHEN_MANIFEST = engineCapabilityManifestSchema.parse({
  ...PREPARATION_MANIFEST,
  id: "ordering.kitchen",
  configSchema: z.toJSONSchema(coreConfig),
  defaults: {},
  businessBlocks: [
    {
      id: "kitchen",
      title: "Mutfak",
      view: "kitchen",
      path: "/kitchen",
      states: ["placed", "accepted", "preparing", "ready"],
    },
    { id: "devices", title: "Mutfak tabletleri", view: "devices", path: "/devices" },
  ],
  api: [
    ...["queue", "device", "live-events"].map((resource) => ({
      id: `kitchen.${resource}`,
      method: "GET" as const,
      path: `/v1/kitchen/${resource}`,
      permission: "kitchen.read",
    })),
    {
      id: "kitchen.ticket",
      method: "POST",
      path: "/v1/kitchen/socket-ticket",
      permission: "kitchen.read",
    },
    {
      id: "kitchen.reject",
      method: "POST",
      path: "/v1/kitchen/orders/:id/reject",
      permission: "kitchen.update",
    },
    {
      id: "kitchen.status",
      method: "PUT",
      path: "/v1/kitchen/orders/:id/status",
      permission: "kitchen.update",
    },
    {
      id: "business.kitchen.queue",
      method: "GET",
      path: "/v1/business/:businessId/kitchen-queue",
      permission: "orders.read",
    },
    {
      id: "business.kitchen.accept",
      method: "POST",
      path: "/v1/business/:businessId/orders/:id/accept",
      permission: "orders.update",
    },
    {
      id: "business.kitchen.reject",
      method: "POST",
      path: "/v1/business/:businessId/orders/:id/reject",
      permission: "orders.update",
    },
    { id: "kitchen.queue", method: "GET", path: "/v1/kitchen/orders", permission: "kitchen.read" },
    {
      id: "kitchen.accept",
      method: "POST",
      path: "/v1/kitchen/orders/:id/accept",
      permission: "kitchen.update",
    },
  ],
  customerBlocks: ["live-order"],
  permissions: ["kitchen.read", "kitchen.update", "devices.manage"],
});
function restaurantManifest(
  id: string,
  customerBlocks: string[],
  businessBlocks: BusinessBlock[] = [],
  dependency = "ordering",
) {
  return engineCapabilityManifestSchema.parse({
    id,
    version: "1.0.0",
    engine: "ordering",
    dependsOn: [{ id: dependency, version: "1.0.0" }],
    configSchema: z.toJSONSchema(coreConfig),
    defaults: {},
    permissions: ["orders.read", "orders.update"],
    events: {
      publishes:
        id === "ordering.table_service"
          ? ["table.requested", "table.request_resolved", "order.payment_recorded"]
          : [],
      subscribes: ["order.status_changed"],
    },
    stateMachine: { insertions: [] },
    api:
      id === "ordering.table_service"
        ? [
            {
              id: "tables.list",
              method: "GET",
              path: "/v1/business/:businessId/tables",
              permission: "orders.read",
            },
            {
              id: "tables.create",
              method: "POST",
              path: "/v1/business/:businessId/tables",
              permission: "orders.update",
            },
            {
              id: "tables.edit",
              method: "PUT",
              path: "/v1/business/:businessId/tables/:id",
              permission: "orders.update",
            },
            {
              id: "tables.qr",
              method: "POST",
              path: "/v1/business/:businessId/tables/:id/qr",
              permission: "orders.read",
            },
            {
              id: "tables.bill",
              method: "GET",
              path: "/v1/business/:businessId/table-sessions/:id/bill",
              permission: "orders.read",
            },
            {
              id: "tables.close",
              method: "POST",
              path: "/v1/business/:businessId/table-sessions/:id/close",
              permission: "orders.update",
            },
            {
              id: "tables.join",
              method: "POST",
              path: "/v1/shell/:businessId/:appInstanceId/table-sessions",
              permission: "ordering.basic",
            },
            {
              id: "tables.customer.bill",
              method: "GET",
              path: "/v1/shell/:businessId/:appInstanceId/table-sessions/:id/bill",
              permission: "ordering.basic",
            },
            {
              id: "tables.request",
              method: "POST",
              path: "/v1/shell/:businessId/:appInstanceId/table-sessions/:id/requests",
              permission: "ordering.basic",
            },
            {
              id: "tables.requests",
              method: "GET",
              path: "/v1/business/:businessId/table-requests",
              permission: "orders.read",
            },
            {
              id: "tables.resolve",
              method: "POST",
              path: "/v1/business/:businessId/table-requests/:id/resolve",
              permission: "orders.update",
            },
            {
              id: "tables.payment",
              method: "POST",
              path: "/v1/business/:businessId/orders/:id/payment",
              permission: "orders.update",
            },
          ]
        : [
            {
              id: `${id}.context`,
              method: "GET",
              path: "/v1/shell/:businessId/:appInstanceId/restaurant",
              permission: "ordering.basic",
            },
            {
              id: `${id}.slots`,
              method: "GET",
              path: "/v1/shell/:businessId/:appInstanceId/fulfilment-slots",
              permission: "ordering.basic",
            },
          ],
    customerBlocks,
    businessBlocks,
    validation: [
      "tenant_scope",
      "composite_foreign_keys",
      "server_fulfilment_validation",
      "expected_version",
    ],
  });
}
export const TABLE_SERVICE_MANIFEST = restaurantManifest(
  "ordering.table_service",
  ["table-qr", "waiter-request", "table-bill"],
  [{ id: "tables", title: "Masalar", view: "tables", path: "/tables", states: [] }],
);
export const PICKUP_MANIFEST = restaurantManifest("ordering.pickup", ["pickup"]);
export const SCHEDULING_MANIFEST = restaurantManifest(
  "ordering.scheduling",
  ["scheduled-pickup"],
  [],
  "ordering.pickup",
);

export const DELIVERY_MANIFEST = engineCapabilityManifestSchema.parse({
  id: "ordering.delivery",
  version: "1.0.0",
  engine: "ordering",
  dependsOn: [{ id: "ordering.preparation", version: "1.0.0", alternatives: ["ordering.kitchen"] }],
  configSchema: z.toJSONSchema(coreConfig),
  defaults: {},
  permissions: ["orders.read", "orders.update", "delivery.manage"],
  events: {
    publishes: ["delivery.assigned", "delivery.departed", "delivery.completed"],
    subscribes: ["order.status_changed"],
  },
  stateMachine: {
    insertions: [
      {
        from: "ready",
        to: "completed",
        entry: "in_transit",
        fulfilments: ["delivery"],
        states: [
          {
            id: "in_transit",
            transitions: [
              { to: "completed", rule: "always" },
              { to: "cancelled", rule: "always" },
            ],
          },
        ],
      },
    ],
  },
  api: [
    {
      id: "delivery.regions",
      method: "PUT",
      path: "/v1/business/:businessId/branches/:branchId/delivery-regions/:id",
      permission: "delivery.manage",
    },
    {
      id: "delivery.quote",
      method: "POST",
      path: "/v1/shell/:businessId/:appInstanceId/delivery-quote",
      permission: "orders.read",
    },
    {
      id: "delivery.snapshot",
      method: "GET",
      path: "/v1/shell/:businessId/:appInstanceId/orders/:id/delivery-snapshot",
      permission: "orders.read",
    },
    {
      id: "delivery.assignment",
      method: "PUT",
      path: "/v1/business/:businessId/orders/:id/delivery-assignment",
      permission: "delivery.manage",
    },
  ],
  customerBlocks: [],
  businessBlocks: [],
  validation: [
    "tenant_scope",
    "immutable_snapshot",
    "expected_version",
    "active_assignment",
    "preparation_dependency",
  ],
});
interface CapabilityDefinition {
  manifest: EngineCapabilityManifest;
  config: z.ZodType;
}
function dataPackage(
  id: "ordering.reorder" | "ordering.returns",
  title: string,
  permission: string,
  path: string,
) {
  return engineCapabilityManifestSchema.parse({
    id,
    version: "1.0.0",
    engine: "ordering",
    dependsOn: [{ id: "ordering", version: "1.0.0" }],
    configSchema: z.toJSONSchema(coreConfig),
    defaults: {},
    permissions: [permission],
    events: {
      publishes:
        id === "ordering.returns" ? ["return.created", "return.updated"] : ["cart.changed"],
      subscribes: [],
    },
    stateMachine: { insertions: [] },
    api: [{ id, method: "POST", path, permission }],
    customerBlocks: [],
    businessBlocks: [],
    validation: ["tenant_scope", "expected_version", "immutable_snapshot", "idempotency"],
  });
}
export const REORDER_MANIFEST = dataPackage(
  "ordering.reorder",
  "Tekrar sipariş",
  "orders.read",
  "/v1/shell/:businessId/:appInstanceId/orders/:id/reorder",
);
export const RETURNS_MANIFEST = dataPackage(
  "ordering.returns",
  "İptal ve iade",
  "orders.update",
  "/v1/shell/:businessId/:appInstanceId/orders/:id/returns",
);
/** İşletme isteği bu listeyi genişletemez; her kayıt sürümle birlikte incelenmiş koddur. */
export const CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] = [
  { manifest: CORE_MANIFEST, config: coreConfig },
  { manifest: PREPARATION_MANIFEST, config: preparationConfig },
  { manifest: TABLE_SERVICE_MANIFEST, config: coreConfig },
  { manifest: PICKUP_MANIFEST, config: coreConfig },
  { manifest: SCHEDULING_MANIFEST, config: coreConfig },
  { manifest: KITCHEN_MANIFEST, config: coreConfig },
  { manifest: DELIVERY_MANIFEST, config: coreConfig },
  { manifest: REORDER_MANIFEST, config: coreConfig },
  { manifest: RETURNS_MANIFEST, config: coreConfig },
];
export function getCapabilityCatalog() {
  return {
    manifestSchema: z.toJSONSchema(engineCapabilityManifestSchema),
    engines: [CORE_MANIFEST],
    packages: CAPABILITY_DEFINITIONS.filter((d) => d.manifest.id !== "ordering").map(
      (d) => d.manifest,
    ),
  };
}

export function compileOrderWorkflow(
  manifests: readonly EngineCapabilityManifest[],
  fulfilment?: "pickup" | "dine_in" | "delivery",
) {
  const graph: Record<string, string[]> = Object.fromEntries(
    Object.entries(CORE_ORDER_GRAPH).map(([state, next]) => [state, [...next]]),
  );
  const rules: Record<string, Record<string, string>> = Object.fromEntries(
    Object.entries(graph).map(([state, next]) => [
      state,
      Object.fromEntries(next.map((target) => [target, "always"])),
    ]),
  );
  const occupied = new Set<string>();
  for (const raw of [...manifests].sort(
    (a, b) => Number(a.id === "ordering.delivery") - Number(b.id === "ordering.delivery"),
  )) {
    const manifest = engineCapabilityManifestSchema.parse(raw);
    for (const insertion of manifest.stateMachine.insertions) {
      if (
        fulfilment !== undefined &&
        insertion.fulfilments !== undefined &&
        !insertion.fulfilments.includes(fulfilment)
      )
        continue;
      const point = `${insertion.from}:${insertion.to}`;
      if (
        !allowedInsertionPoints.some((p) => p.from === insertion.from && p.to === insertion.to) ||
        occupied.has(point) ||
        !graph[insertion.from]?.includes(insertion.to)
      )
        throw new CapabilityValidationError(
          "Ekleme noktası çekirdek tarafından izinli ve tekil olmalıdır",
        );
      occupied.add(point);
      const added = new Set(insertion.states.map((s) => s.id));
      if (
        added.size !== insertion.states.length ||
        !added.has(insertion.entry) ||
        insertion.states.some((s) => Object.hasOwn(graph, s.id))
      )
        throw new CapabilityValidationError("Ek durumlar yeni ve tekil olmalıdır");
      const outgoing = graph[insertion.from];
      const outgoingRules = rules[insertion.from];
      if (outgoing === undefined || outgoingRules === undefined)
        throw new CapabilityValidationError("Ekleme noktası yok");
      graph[insertion.from] = outgoing.map((next) =>
        next === insertion.to ? insertion.entry : next,
      );
      rules[insertion.from] = {
        ...Object.fromEntries(
          Object.entries(outgoingRules).filter(([target]) => target !== insertion.to),
        ),
        [insertion.entry]: "always",
      };
      for (const state of insertion.states) {
        if (new Set(state.transitions.map((t) => t.to)).size !== state.transitions.length)
          throw new CapabilityValidationError("Geçişler tekil olmalıdır");
        for (const transition of state.transitions) {
          if (!Object.hasOwn(namedRules, transition.rule))
            throw new CapabilityValidationError("Kayıtlı olmayan kural çalıştırılamaz");
          if (
            !added.has(transition.to) &&
            transition.to !== insertion.to &&
            transition.to !== "cancelled"
          )
            throw new CapabilityValidationError("Geçiş izinli ara adımdan çıkamaz");
        }
        graph[state.id] = state.transitions.map((t) => t.to);
        rules[state.id] = Object.fromEntries(state.transitions.map((t) => [t.to, t.rule]));
      }
    }
  }
  for (const terminal of TERMINAL_ORDER_STATES)
    if (graph[terminal]?.length !== 0)
      throw new CapabilityValidationError("Çekirdek bitiş durumları değişmez");
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(state: string): void {
    if (visiting.has(state)) throw new CapabilityValidationError("Döngü içeren akış reddedilir");
    if (visited.has(state)) return;
    const next = graph[state];
    if (next === undefined) throw new CapabilityValidationError("Bilinmeyen akış durumu");
    visiting.add(state);
    for (const target of next) visit(target);
    visiting.delete(state);
    visited.add(state);
  }
  visit("placed");
  if (visited.size !== Object.keys(graph).length)
    throw new CapabilityValidationError("Erişilemeyen akış durumu reddedilir");
  return { graph, rules };
}

export function validateCapabilitySelection(
  settings: readonly CapabilitySetting[],
  definitions = CAPABILITY_DEFINITIONS,
): CapabilitySetting[] {
  if (new Set(settings.map((s) => s.capabilityId)).size !== settings.length)
    throw new CapabilityValidationError("Paket ayarı tekil olmalıdır");
  const normalised = settings.map((setting) => {
    const definition = definitions.find(
      (d) => d.manifest.id === setting.capabilityId && d.manifest.id !== "ordering",
    );
    if (definition === undefined)
      throw new CapabilityValidationError("Yalnızca kayıtlı paket açılabilir");
    if (definition.manifest.version !== setting.version)
      throw new CapabilityValidationError("Yayımlanmamış paket sürümü");
    try {
      return {
        ...setting,
        config: engineCapabilityConfigSchema.parse(definition.config.parse(setting.config)),
      };
    } catch (error) {
      throw new CapabilityValidationError("Paket ayarı geçersiz", { cause: error });
    }
  });
  const enabled = normalised.filter((s) => s.enabled);
  const versions = new Map([
    ["ordering", CORE_MANIFEST.version],
    ...enabled.map((s) => [s.capabilityId, s.version] as const),
  ]);
  const dependencyId = (dependency: EngineCapabilityManifest["dependsOn"][number]) =>
    [dependency.id, ...(dependency.alternatives ?? [])].find(
      (id) => versions.get(id) === dependency.version,
    );
  const active = definitions.filter((d) => enabled.some((s) => s.capabilityId === d.manifest.id));
  for (const definition of active)
    for (const dependency of definition.manifest.dependsOn)
      if (dependencyId(dependency) === undefined)
        throw new CapabilityValidationError("Bağımlılık açık ve uyumlu sürümde olmalıdır");
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) throw new CapabilityValidationError("Bağımlılık döngüsü");
    if (visited.has(id) || id === "ordering") return;
    visiting.add(id);
    for (const dependency of active.find((d) => d.manifest.id === id)?.manifest.dependsOn ?? [])
      visit(dependencyId(dependency) ?? dependency.id);
    visiting.delete(id);
    visited.add(id);
  }
  for (const setting of enabled) visit(setting.capabilityId);
  compileOrderWorkflow(active.map((d) => d.manifest));
  return normalised;
}

export function resolveCapabilities(settings: readonly CapabilitySetting[]) {
  const checked = validateCapabilitySelection(settings);
  const enabled = checked.filter((s) => s.enabled);
  const packages = CAPABILITY_DEFINITIONS.filter((d) =>
    enabled.some((s) => s.capabilityId === d.manifest.id),
  );
  const { graph } = compileOrderWorkflow(packages.map((d) => d.manifest));
  const businessBlocks: BusinessBlock[] = [...CORE_MANIFEST.businessBlocks];
  for (const definition of packages) {
    const config = enabled.find((s) => s.capabilityId === definition.manifest.id)?.config ?? {};
    for (const block of definition.manifest.businessBlocks) {
      const label = block.titleConfigKey === undefined ? undefined : config[block.titleConfigKey];
      businessBlocks.push({ ...block, title: typeof label === "string" ? label : block.title });
    }
  }
  return {
    settings: checked,
    capabilities: enabled.map((s) => `${s.capabilityId}@${s.version}`).sort(),
    stateGraph: graph,
    businessBlocks,
  };
}

/** Geçişte yalnızca sürümle gelen, adı kayıtlı işlev çağrılır. */
export function permitOrderTransition(
  capabilities: readonly string[],
  from: string,
  to: string,
  fulfilment?: "pickup" | "dine_in" | "delivery",
): boolean {
  const manifests: EngineCapabilityManifest[] = [];
  for (const key of capabilities) {
    const definition = CAPABILITY_DEFINITIONS.find(
      (d) => `${d.manifest.id}@${d.manifest.version}` === key && d.manifest.id !== "ordering",
    );
    if (definition === undefined) return false;
    manifests.push(definition.manifest);
  }
  const { rules } = compileOrderWorkflow(manifests, fulfilment);
  const name = rules[from]?.[to];
  return name !== undefined && namedRules[name]?.() === true;
}
