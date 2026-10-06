import { z } from "zod";

import { idSchema } from "./common";
import { expectedVersionSchema } from "./ordering";

export const initialVersionSchema = z.number().int().min(0).max(2_147_483_647);
export const preparationMinutesSchema = z.number().int().min(1).max(240);
export const branchOrderingSettingsBodySchema = z
  .object({
    expectedVersion: initialVersionSchema,
    preparationMinutes: preparationMinutesSchema,
    slotMinutes: z.number().int().min(5).max(60).default(15),
    advanceDays: z.number().int().min(1).max(30).default(7),
  })
  .strict();
export type BranchOrderingSettingsBody = z.infer<typeof branchOrderingSettingsBodySchema>;
export const branchOrderingSettingsSchema = branchOrderingSettingsBodySchema
  .omit({ expectedVersion: true })
  .extend({ businessId: idSchema, branchId: idSchema, version: initialVersionSchema });
export type BranchOrderingSettings = z.infer<typeof branchOrderingSettingsSchema>;

export const operationTimeWindowSchema = z
  .object({
    opensAt: z.number().int().min(0).max(1439),
    closesAt: z.number().int().min(1).max(2879),
  })
  .strict()
  .refine((value) => value.closesAt > value.opensAt && value.closesAt <= value.opensAt + 1440);
export const menuWindowBodySchema = operationTimeWindowSchema.extend({
  weekday: z.number().int().min(0).max(6),
});
export type MenuWindowBody = z.infer<typeof menuWindowBodySchema>;

export const operationDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
export const branchHoursExceptionBodySchema = z
  .object({
    expectedVersion: initialVersionSchema,
    date: operationDateSchema,
    hours: z.array(operationTimeWindowSchema).max(5),
  })
  .strict()
  .refine((value) => {
    const ordered = [...value.hours].sort((a, b) => a.opensAt - b.opensAt);
    return ordered.every(
      (hour, index) => index === 0 || hour.opensAt >= (ordered[index - 1]?.closesAt ?? 0),
    );
  });
export type BranchHoursExceptionBody = z.infer<typeof branchHoursExceptionBodySchema>;

export const acceptOrderBodySchema = z
  .object({ expectedVersion: expectedVersionSchema, preparationMinutes: preparationMinutesSchema })
  .strict();
export type AcceptOrderBody = z.infer<typeof acceptOrderBodySchema>;
export const rejectOrderBodySchema = z
  .object({ expectedVersion: expectedVersionSchema, reason: z.string().trim().min(3).max(500) })
  .strict();
export type RejectOrderBody = z.infer<typeof rejectOrderBodySchema>;

export const recordOrderPaymentBodySchema = z
  .object({
    expectedPaymentVersion: initialVersionSchema,
    place: z.enum(["table", "counter"]),
    method: z.enum(["cash", "card"]),
  })
  .strict();
export type RecordOrderPaymentBody = z.infer<typeof recordOrderPaymentBodySchema>;

export const approveKitchenDeviceBodySchema = z
  .object({
    code: z.string().regex(/^\d{8}$/),
    label: z.string().trim().min(1).max(40),
    branchId: idSchema,
    appInstanceId: idSchema,
  })
  .strict();
export type ApproveKitchenDeviceBody = z.infer<typeof approveKitchenDeviceBodySchema>;

export const itemAvailabilityBodySchema = z
  .object({
    branchId: idSchema,
    expectedVersion: initialVersionSchema,
    available: z.boolean(),
  })
  .strict();
export type ItemAvailabilityBody = z.infer<typeof itemAvailabilityBodySchema>;
export const menuWindowsBodySchema = z
  .object({
    branchId: idSchema,
    expectedVersion: initialVersionSchema,
    windows: z.array(menuWindowBodySchema).max(35),
  })
  .strict();
export type MenuWindowsBody = z.infer<typeof menuWindowsBodySchema>;

export const restaurantTableBodySchema = z
  .object({
    branchId: idSchema,
    appInstanceId: idSchema,
    label: z.string().trim().min(1).max(40),
    active: z.boolean().default(true),
  })
  .strict();
export type RestaurantTableBody = z.infer<typeof restaurantTableBodySchema>;
export const restaurantTableSchema = restaurantTableBodySchema.extend({
  id: idSchema,
  version: z.number().int().positive(),
  sessionId: idSchema.nullable(),
});
export type RestaurantTable = z.infer<typeof restaurantTableSchema>;
export const joinTableSessionBodySchema = z.object({ qr: z.string().min(1).max(4096) }).strict();
export const tableSessionSchema = z.object({
  id: idSchema,
  tableId: idSchema,
  branchId: idSchema,
  appInstanceId: idSchema,
  label: z.string(),
  status: z.enum(["open", "closed"]),
  version: z.number().int().positive(),
});
export type TableSession = z.infer<typeof tableSessionSchema>;
export const tableRequestBodySchema = z.object({ kind: z.enum(["waiter", "bill"]) }).strict();
export const tableRequestSchema = z.object({
  id: idSchema,
  tableSessionId: idSchema,
  kind: z.enum(["waiter", "bill"]),
  status: z.enum(["open", "resolved"]),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  label: z.string(),
  branchId: idSchema,
});
export type TableRequest = z.infer<typeof tableRequestSchema>;
export const tableBillSchema = z.object({
  ownTotalMinor: z.number().int().nonnegative(),
  ownPaidMinor: z.number().int().nonnegative(),
  ownDueMinor: z.number().int().nonnegative(),
});
export const fulfilmentSlotsSchema = z.object({
  items: z.array(z.object({ at: z.iso.datetime() })),
  preparationMinutes: preparationMinutesSchema,
  openNow: z.boolean(),
});

export const updateRestaurantTableBodySchema = z
  .object({
    expectedVersion: initialVersionSchema.refine((v) => v > 0),
    label: z.string().trim().min(1).max(40),
    active: z.boolean(),
  })
  .strict();
export type UpdateRestaurantTableBody = z.infer<typeof updateRestaurantTableBodySchema>;

export const kitchenPairingSchema = z.object({
  id: idSchema,
  code: z.string().regex(/^\d{8}$/),
  secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.iso.datetime(),
});
export const pollKitchenPairingBodySchema = z
  .object({ secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export const kitchenDeviceSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  branchId: idSchema,
  appInstanceId: idSchema,
  label: z.string(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});
export type KitchenDevice = z.infer<typeof kitchenDeviceSchema>;
export const kitchenPairingPollSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending"), expiresAt: z.iso.datetime() }),
  z.object({
    status: z.literal("approved"),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    device: kitchenDeviceSchema,
  }),
]);

export const restaurantContextSchema = z.object({
  businessId: idSchema,
  appInstanceId: idSchema,
  businessName: z.string(),
  capabilities: z.array(z.string()),
  branches: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      timezone: z.string(),
      address: z.string(),
      openNow: z.boolean(),
      preparationMinutes: preparationMinutesSchema,
    }),
  ),
});
export type RestaurantContext = z.infer<typeof restaurantContextSchema>;
export const businessTableBillSchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  status: z.enum(["open", "closed"]),
  label: z.string(),
  totalMinor: z.number().int().nonnegative(),
  paidMinor: z.number().int().nonnegative(),
  dueMinor: z.number().int().nonnegative(),
  orders: z.array(
    z.object({
      id: idSchema,
      status: z.string(),
      version: z.number().int().positive(),
      totalMinor: z.number().int().nonnegative(),
      paid: z.boolean(),
    }),
  ),
});
export type BusinessTableBill = z.infer<typeof businessTableBillSchema>;

export const kitchenDeviceInfoSchema = kitchenDeviceSchema.extend({
  businessName: z.string(),
  branchName: z.string(),
});
