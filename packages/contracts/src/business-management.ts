import { z } from "zod";

import { idSchema, timestampSchema } from "./common";
import { miniAppIdSchema } from "./miniapps";
import { timezoneSchema } from "./time";

export const businessMemberRoleSchema = z.enum(["owner", "manager", "staff", "courier"]);
export type BusinessMemberRole = z.infer<typeof businessMemberRoleSchema>;
export const businessMembershipSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  userId: idSchema,
  businessName: z.string(),
  displayName: z.string().optional(),
  role: businessMemberRoleSchema,
  active: z.boolean(),
});
export type BusinessMembership = z.infer<typeof businessMembershipSchema>;
export const businessMemberBodySchema = z.object({
  userId: idSchema,
  role: z.enum(["manager", "staff"]),
  active: z.boolean().default(true),
});
export type BusinessMemberBody = z.infer<typeof businessMemberBodySchema>;
/** Staff invitations are bound to an E.164 phone number and do not grant manager rights. */
export const staffInvitationCreateSchema = z.object({
  phone: z.string().trim().min(8).max(32),
  branchIds: z.array(idSchema).min(1).max(20).refine((ids) => new Set(ids).size === ids.length),
  orderAccess: z.enum(["none", "view", "manage"]),
  canManageAvailability: z.boolean(),
}).strict().refine((input) => input.orderAccess !== "none" || input.canManageAvailability);
export type StaffInvitationCreate = z.infer<typeof staffInvitationCreateSchema>;
export const staffInvitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const staffInvitationTokenBodySchema = z.object({ token: staffInvitationTokenSchema }).strict();
export const staffInvitationSchema = z.object({
  id: idSchema,
  phone: z.string(),
  branches: z.array(z.object({ id: idSchema, name: z.string() })),
  orderAccess: z.enum(["none", "view", "manage"]),
  canManageAvailability: z.boolean(),
  expiresAt: timestampSchema,
  status: z.enum(["pending", "expired", "accepted", "revoked"]),
});
export type StaffInvitation = z.infer<typeof staffInvitationSchema>;
export const staffInvitationsSchema = z.object({ items: z.array(staffInvitationSchema) });
export const staffInvitationCreatedSchema = z.object({ invitation: staffInvitationSchema, token: staffInvitationTokenSchema });
export const staffInvitationPreviewSchema = z.object({
  businessName: z.string(),
  branches: z.array(z.object({ id: idSchema, name: z.string() })),
  orderAccess: z.enum(["none", "view", "manage"]),
  canManageAvailability: z.boolean(),
  expiresAt: timestampSchema,
});
export const staffInvitationAcceptedSchema = z.object({ businessId: idSchema });

/** Branch-specific delegation covers product availability, not prices or management. */
export const branchAvailabilityGrantBodySchema = z.object({
  userId: idSchema,
  allowed: z.boolean(),
}).strict();
export type BranchAvailabilityGrantBody = z.infer<typeof branchAvailabilityGrantBodySchema>;
export const branchAvailabilityGrantSchema = z.object({
  userId: idSchema,
  displayName: z.string(),
  allowed: z.boolean(),
});
export const branchAvailabilityGrantsSchema = z.object({ items: z.array(branchAvailabilityGrantSchema) });
export const accessibleBranchesSchema = z.object({ items: z.array(idSchema) });


/** Region hierarchy is a grouping; delegated staff have availability-only access. */
export const businessRegionBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
}).strict();
export const businessRegionUpdateSchema = businessRegionBodySchema.extend({
  expectedVersion: z.number().int().positive(),
});
export const businessRegionSchema = businessRegionBodySchema.extend({
  id: idSchema,
  version: z.number().int().positive(),
});
export type BusinessRegion = z.infer<typeof businessRegionSchema>;
export const businessRegionsSchema = z.object({ items: z.array(businessRegionSchema) });
export const businessRegionBranchSchema = z.object({
  branchId: idSchema,
  regionId: idSchema.nullable(),
});
export const businessRegionBranchesSchema = z.object({ items: z.array(businessRegionBranchSchema) });
export const businessRegionAssignmentSchema = z.object({
  regionId: idSchema.nullable(),
  expectedRegionId: idSchema.nullable(),
}).strict();
export type BusinessRegionAssignment = z.infer<typeof businessRegionAssignmentSchema>;
export const businessRegionOperatorBodySchema = z.object({
  userId: idSchema,
  allowed: z.boolean(),
}).strict();
export type BusinessRegionOperatorBody = z.infer<typeof businessRegionOperatorBodySchema>;
export const businessRegionOperatorSchema = z.object({
  userId: idSchema,
  displayName: z.string(),
  allowed: z.boolean(),
});
export const businessRegionOperatorsSchema = z.object({ items: z.array(businessRegionOperatorSchema) });

/** Owner-assigned order permission, independent from stock visibility grants. */
export const orderGrantBodySchema = z.object({
  userId: idSchema,
  access: z.enum(["none", "view", "manage"]),
}).strict();
export type OrderGrantBody = z.infer<typeof orderGrantBodySchema>;
export const orderGrantSchema = orderGrantBodySchema.extend({ displayName: z.string() });
export const orderGrantsSchema = z.object({ items: z.array(orderGrantSchema) });

export const branchBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: timezoneSchema.default("Europe/Istanbul"),
  address: z.string().trim().max(500).default(""),
  active: z.boolean().default(true),
  provinceId: idSchema.nullable().optional(),
  districtId: idSchema.nullable().optional(),
}).refine((value) =>
  (value.provinceId === undefined && value.districtId === undefined) ||
  (value.provinceId === null && value.districtId === null) ||
  (typeof value.provinceId === "string" && typeof value.districtId === "string"),
  { message: "İl ve ilçe birlikte seçilmelidir.", path: ["districtId"] });
export type BranchBody = z.infer<typeof branchBodySchema>;
export const branchSchema = branchBodySchema.safeExtend({
  id: idSchema, businessId: idSchema, provinceId: idSchema.nullable(), districtId: idSchema.nullable(),
});
export type Branch = z.infer<typeof branchSchema>;
export const branchHourSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    opensAt: z.number().int().min(0).max(1439),
    closesAt: z.number().int().min(1).max(2879),
  })
  .refine((value) => value.closesAt > value.opensAt && value.closesAt <= value.opensAt + 1440);
export const branchHoursBodySchema = z.object({ hours: z.array(branchHourSchema).max(35) });
export type BranchHoursBody = z.infer<typeof branchHoursBodySchema>;
export const appInstanceBodySchema = z.object({
  miniAppId: z.string().min(1).max(80),
  merchantId: z.string().min(1).max(120),
  engine: z.literal("ordering").default("ordering"),
  active: z.boolean().default(true),
});
export type AppInstanceBody = z.infer<typeof appInstanceBodySchema>;
export const appInstanceSchema = appInstanceBodySchema.extend({
  id: idSchema,
  businessId: idSchema,
  createdAt: timestampSchema,
});
export const businessContextBodySchema = z
  .object({
    businessId: idSchema,
    appInstanceId: idSchema,
    miniAppId: miniAppIdSchema.optional(),
  })
  .strict();
export const businessContextSchema = businessContextBodySchema.omit({ miniAppId: true }).extend({
  businessCustomerId: idSchema,
});
export const businessParamsSchema = z.object({ businessId: idSchema });
export const businessRecordParamsSchema = businessParamsSchema.extend({ id: idSchema });
