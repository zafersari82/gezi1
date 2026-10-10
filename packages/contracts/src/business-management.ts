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
/** Şubenin Türkiye adres kataloğuna bağlı adresi; keşif ve teslimat aynı kaynaktan okur. */
export const branchAddressSchema = z
  .object({
    provinceId: idSchema,
    districtId: idSchema,
    neighborhoodId: idSchema,
    /** Cadde/sokak, bina no ve varsa kat/daire; il, ilçe ve mahalle burada tekrar yazılmaz. */
    line: z.string().trim().min(5).max(300),
  })
  .strict();
export type BranchAddress = z.infer<typeof branchAddressSchema>;
export const branchAddressViewSchema = branchAddressSchema.extend({
  provinceName: z.string(),
  districtName: z.string(),
  neighborhoodName: z.string(),
});
export type BranchAddressView = z.infer<typeof branchAddressViewSchema>;

export const branchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    timezone: timezoneSchema.default("Europe/Istanbul"),
    address: branchAddressSchema.nullable().default(null),
    active: z.boolean().default(true),
  })
  .strict();
export type BranchBody = z.infer<typeof branchBodySchema>;
export const branchSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  name: z.string(),
  timezone: timezoneSchema,
  address: branchAddressViewSchema.nullable(),
  /** 2.8 öncesinden kalan serbest metin; yapılandırılmış adres kaydedilince boşalır. */
  legacyAddress: z.string(),
  active: z.boolean(),
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
