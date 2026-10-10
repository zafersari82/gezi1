import { z } from "zod";

import { idSchema } from "./common";
import { orderGraphSchema, orderStateSchema } from "./ordering";

export const engineCapabilityIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)*$/)
  .max(100);
export const engineCapabilityVersionSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
  .max(40);
export const engineCapabilityConfigSchema = z.record(z.string(), z.json());
export const workflowTransitionSchema = z
  .object({ to: orderStateSchema, rule: z.string().regex(/^[a-z][a-z0-9_]*$/) })
  .strict();
export const workflowInsertionSchema = z
  .object({
    from: orderStateSchema,
    to: orderStateSchema,
    entry: orderStateSchema,
    fulfilments: z
      .array(z.enum(["pickup", "dine_in", "delivery"]))
      .min(1)
      .max(3)
      .optional(),
    states: z
      .array(
        z
          .object({
            id: orderStateSchema,
            transitions: z.array(workflowTransitionSchema).min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export const businessBlockSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    title: z.string().min(1).max(80),
    view: z.enum(["orders", "catalog", "branches", "settings", "kitchen", "tables", "devices", "reviews", "returns"]),
    path: z.string().regex(/^\/[a-z][a-z0-9/-]*(?:\?[a-z][a-z0-9_=.-]*)?$/),
    states: z.array(orderStateSchema).default([]),
    titleConfigKey: z.string().optional(),
  })
  .strict();
export type BusinessBlock = z.infer<typeof businessBlockSchema>;
export const engineCapabilityManifestSchema = z
  .object({
    id: engineCapabilityIdSchema,
    version: engineCapabilityVersionSchema,
    engine: z.literal("ordering"),
    dependsOn: z.array(
      z
        .object({
          id: engineCapabilityIdSchema,
          version: engineCapabilityVersionSchema,
          alternatives: z.array(engineCapabilityIdSchema).min(1).max(10).optional(),
        })
        .strict(),
    ),
    configSchema: engineCapabilityConfigSchema,
    defaults: engineCapabilityConfigSchema,
    permissions: z.array(z.string()),
    events: z.object({ publishes: z.array(z.string()), subscribes: z.array(z.string()) }).strict(),
    stateMachine: z.object({ insertions: z.array(workflowInsertionSchema).max(20) }).strict(),
    api: z.array(
      z
        .object({
          id: z.string(),
          method: z.enum(["GET", "POST", "PUT"]),
          path: z.string(),
          permission: z.string(),
        })
        .strict(),
    ),
    customerBlocks: z.array(z.string()),
    businessBlocks: z.array(businessBlockSchema),
    validation: z.array(z.string()),
  })
  .strict();
export type EngineCapabilityManifest = z.infer<typeof engineCapabilityManifestSchema>;
export const engineCapabilityCatalogSchema = z.object({
  manifestSchema: engineCapabilityConfigSchema,
  engines: z.array(engineCapabilityManifestSchema),
  packages: z.array(engineCapabilityManifestSchema),
});
export const capabilitySettingBodySchema = z
  .object({
    version: engineCapabilityVersionSchema,
    enabled: z.boolean(),
    config: engineCapabilityConfigSchema.default({}),
  })
  .strict();
export type CapabilitySettingBody = z.infer<typeof capabilitySettingBodySchema>;
export const capabilitySettingSchema = capabilitySettingBodySchema.extend({
  capabilityId: engineCapabilityIdSchema,
});
export type CapabilitySetting = z.infer<typeof capabilitySettingSchema>;
export const instanceCapabilitiesSchema = z.object({
  businessId: idSchema,
  appInstanceId: idSchema,
  engine: z.literal("ordering"),
  settings: z.array(capabilitySettingSchema),
  capabilities: z.array(z.string()),
  stateGraph: orderGraphSchema,
  businessBlocks: z.array(businessBlockSchema),
});
export type InstanceCapabilities = z.infer<typeof instanceCapabilitiesSchema>;
