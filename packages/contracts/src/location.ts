import { z } from "zod";

import { idSchema } from "./common";
import { initialVersionSchema } from "./restaurant";

export const locationReferenceIdSchema = z.string().trim().min(1).max(120);

export const locationProvinceSchema = z.object({
  id: locationReferenceIdSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(160),
});
export type LocationProvince = z.infer<typeof locationProvinceSchema>;

export const locationDistrictSchema = z.object({
  id: locationReferenceIdSchema,
  provinceId: locationReferenceIdSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(160),
});
export type LocationDistrict = z.infer<typeof locationDistrictSchema>;

export const locationNeighborhoodSchema = z.object({
  id: locationReferenceIdSchema,
  provinceId: locationReferenceIdSchema,
  districtId: locationReferenceIdSchema,
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(200),
  postalCode: z.string().regex(/^\d{5}$/).nullable(),
});
export type LocationNeighborhood = z.infer<typeof locationNeighborhoodSchema>;

export const locationDistrictQuerySchema = z.object({
  provinceId: locationReferenceIdSchema,
});
export const locationNeighborhoodQuerySchema = z.object({
  provinceId: locationReferenceIdSchema,
  districtId: locationReferenceIdSchema,
});

const customerAddressFields = {
  label: z.string().trim().min(1).max(40),
  provinceId: locationReferenceIdSchema,
  districtId: locationReferenceIdSchema,
  neighborhoodId: locationReferenceIdSchema,
  addressLine: z.string().trim().min(3).max(500),
  recipientName: z.string().trim().max(120).default(""),
  recipientPhone: z.string().trim().max(32).default(""),
};
export const createCustomerAddressBodySchema = z.object(customerAddressFields).strict();
export const updateCustomerAddressBodySchema = z
  .object({ ...customerAddressFields, expectedVersion: initialVersionSchema.refine((v) => v > 0) })
  .strict();
export const customerAddressSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  businessCustomerId: idSchema,
  ...customerAddressFields,
  version: initialVersionSchema.refine((v) => v > 0),
});
export type CreateCustomerAddressBody = z.infer<typeof createCustomerAddressBodySchema>;
export type UpdateCustomerAddressBody = z.infer<typeof updateCustomerAddressBodySchema>;
export type CustomerAddress = z.infer<typeof customerAddressSchema>;

const serviceAreaFields = {
  branchId: idSchema,
  name: z.string().trim().min(1).max(80),
  active: z.boolean().default(true),
  neighborhoodIds: z
    .array(locationReferenceIdSchema)
    .min(1)
    .max(2000)
    .refine((items) => new Set(items).size === items.length),
};
export const createLocationServiceAreaBodySchema = z.object(serviceAreaFields).strict();
export const updateLocationServiceAreaBodySchema = z
  .object({ ...serviceAreaFields, expectedVersion: initialVersionSchema.refine((v) => v > 0) })
  .strict();
export const locationServiceAreaSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  ...serviceAreaFields,
  version: initialVersionSchema.refine((v) => v > 0),
});
export type CreateLocationServiceAreaBody = z.infer<typeof createLocationServiceAreaBodySchema>;
export type UpdateLocationServiceAreaBody = z.infer<typeof updateLocationServiceAreaBodySchema>;
export type LocationServiceArea = z.infer<typeof locationServiceAreaSchema>;

export const locationServiceAreaQuerySchema = z.object({ branchId: idSchema.optional() });
