import { z } from "zod";

import { idSchema, timestampSchema } from "./common";
export const locationKeySchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
export const locationVersionSchema = z.number().int().positive();
export const locationCountrySchema = z.object({
  id: idSchema,
  code: z.string().length(2),
  name: z.string(),
});
export const locationPlaceSchema = z.object({
  id: idSchema,
  sourceId: z.number().int().positive(),
  parentId: idSchema,
  name: z.string(),
  fullOfficialName: z.string(),
});
export const locationCountriesSchema = z.object({ items: z.array(locationCountrySchema) });
export const locationPlacesSchema = z.object({ items: z.array(locationPlaceSchema) });
export const locationPathSchema = z
  .object({
    country: locationCountrySchema,
    province: locationPlaceSchema,
    district: locationPlaceSchema,
    neighborhood: locationPlaceSchema,
  })
  .superRefine((path, context) => {
    for (const [level, parentId] of [
      ["province", path.country.id],
      ["district", path.province.id],
      ["neighborhood", path.district.id],
    ] as const) {
      if (path[level].parentId !== parentId)
        context.addIssue({
          code: "custom",
          path: [level, "parentId"],
          message: "Konumun üst kaydı uyuşmuyor.",
        });
    }
  });
export const locationRecordParamsSchema = z.object({ id: idSchema }).strict();
export const locationAddressBodySchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    recipientName: z.string().trim().min(2).max(120),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    countryId: idSchema,
    provinceId: idSchema,
    districtId: idSchema,
    neighborhoodId: idSchema,
    addressLine: z.string().trim().min(5).max(500),
    door: z.string().trim().min(1).max(80),
    note: z.string().trim().max(500),
  })
  .strict();
export const locationAddressUpdateBodySchema = locationAddressBodySchema.extend({
  expectedVersion: locationVersionSchema,
});
export const locationVersionBodySchema = z
  .object({ expectedVersion: locationVersionSchema })
  .strict();
export const locationAddressSchema = locationAddressBodySchema
  .extend({
    id: idSchema,
    version: locationVersionSchema,
    archived: z.boolean(),
    geography: locationPathSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((address, context) => {
    for (const [field, level] of [
      ["countryId", "country"],
      ["provinceId", "province"],
      ["districtId", "district"],
      ["neighborhoodId", "neighborhood"],
    ] as const) {
      if (address[field] !== address.geography[level].id)
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Adres kimliği coğrafyayla uyuşmuyor.",
        });
    }
  });
export const locationAddressesSchema = z.object({ items: z.array(locationAddressSchema) });
export const locationAreaBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    neighborhoodIds: z
      .array(idSchema)
      .min(1)
      .max(1000)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export const locationAreaUpdateBodySchema = locationAreaBodySchema.extend({
  expectedVersion: locationVersionSchema,
});
export const locationAreaSchema = locationAreaBodySchema.extend({
  id: idSchema,
  businessId: idSchema,
  branchId: idSchema,
  version: locationVersionSchema,
  active: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export const locationAreasSchema = z.object({ items: z.array(locationAreaSchema) });
export const locationAreaParamsSchema = z
  .object({ businessId: idSchema, branchId: idSchema })
  .strict();
export const locationAreaRecordParamsSchema = locationAreaParamsSchema.extend({ id: idSchema });
export type LocationCountry = z.infer<typeof locationCountrySchema>;
export type LocationPlace = z.infer<typeof locationPlaceSchema>;
export type LocationPath = z.infer<typeof locationPathSchema>;
export type LocationAddress = z.infer<typeof locationAddressSchema>;
export type LocationAddressBody = z.infer<typeof locationAddressBodySchema>;
export type LocationAddressUpdateBody = z.infer<typeof locationAddressUpdateBodySchema>;
export type LocationArea = z.infer<typeof locationAreaSchema>;
export type LocationAreaBody = z.infer<typeof locationAreaBodySchema>;
export type LocationAreaUpdateBody = z.infer<typeof locationAreaUpdateBodySchema>;
