import { z } from "zod";

import { idSchema, timestampSchema } from "./common";

/** S11: Restoran siparişinden bağımsız, şubeye bağlı ortak rezervasyon sözleşmesi. */
export const bookingServiceBodySchema = z
  .object({
    branchId: idSchema,
    name: z.string().trim().min(2).max(90),
    durationMinutes: z.number().int().min(15).max(240).multipleOf(15),
    priceMinor: z.number().int().min(0).max(100_000_000),
    active: z.boolean().default(true),
  })
  .strict();
export const bookingServiceSchema = bookingServiceBodySchema.extend({ id: idSchema });
export type BookingService = z.infer<typeof bookingServiceSchema>;

export const bookingResourceBodySchema = z
  .object({
    branchId: idSchema,
    name: z.string().trim().min(2).max(80),
    active: z.boolean().default(true),
  })
  .strict();
export const bookingResourceSchema = bookingResourceBodySchema.extend({ id: idSchema });
export type BookingResource = z.infer<typeof bookingResourceSchema>;

export const bookingHoursSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    opensAt: z.number().int().min(0).max(1425).multipleOf(15),
    closesAt: z.number().int().min(15).max(1440).multipleOf(15),
  })
  .refine(({ opensAt, closesAt }) => closesAt > opensAt && closesAt - opensAt >= 15);
export const bookingHoursBodySchema = z
  .object({ hours: z.array(bookingHoursSchema).max(21) })
  .strict();
export type BookingHours = z.infer<typeof bookingHoursSchema>;
export const bookingDateSchema = z.iso.date();
export const bookingSlotSchema = z.object({ startsAt: timestampSchema, endsAt: timestampSchema });
export const bookingCreateSchema = z
  .object({
    branchId: idSchema,
    serviceId: idSchema,
    resourceId: idSchema,
    startsAt: timestampSchema,
    seenPriceMinor: z.number().int().min(0).max(100_000_000),
    seenDurationMinutes: z.number().int().min(15).max(240).multipleOf(15),
    requestKey: idSchema,
  })
  .strict();
export type BookingCreate = z.infer<typeof bookingCreateSchema>;
export const bookingStatusSchema = z.enum(["confirmed", "cancelled", "completed"]);
export const bookingSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  branchId: idSchema,
  customerUserId: idSchema,
  serviceId: idSchema,
  resourceId: idSchema,
  serviceName: z.string(),
  resourceName: z.string(),
  startsAt: timestampSchema,
  endsAt: timestampSchema,
  priceMinor: z.number().int().min(0),
  status: bookingStatusSchema,
  version: z.number().int().positive(),
  createdAt: timestampSchema,
});
export type Booking = z.infer<typeof bookingSchema>;
export const bookingStatusUpdateSchema = z
  .object({
    status: z.enum(["cancelled", "completed"]),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export type BookingStatusUpdate = z.infer<typeof bookingStatusUpdateSchema>;
export const bookingCatalogSchema = z.object({
  branches: z.array(z.object({ id: idSchema, name: z.string(), timezone: z.string() })),
  services: z.array(bookingServiceSchema),
  resources: z.array(bookingResourceSchema),
});
export const bookingSetupSchema = z.object({
  services: z.array(bookingServiceSchema),
  resources: z.array(bookingResourceSchema),
  hours: z.array(
    z.object({
      resourceId: idSchema,
      weekday: z.number().int(),
      opensAt: z.number().int(),
      closesAt: z.number().int(),
    }),
  ),
});
export const bookingListSchema = z.object({ items: z.array(bookingSchema) });
export const bookingSlotsPageSchema = z.object({ items: z.array(bookingSlotSchema) });
