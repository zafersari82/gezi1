import { z } from "zod";

import { moneyMinorSchema } from "./catalog";
import { idSchema } from "./common";
import { locationAddressSchema } from "./location";
export const courierMemberBodySchema = z
  .object({ userId: idSchema, expectedVersion: z.number().int().min(0), active: z.boolean() })
  .strict();
export type CourierMemberBody = z.infer<typeof courierMemberBodySchema>;
export const courierMemberSchema = z.object({
  id: idSchema,
  userId: idSchema,
  version: z.number().int().positive(),
  active: z.boolean(),
});
export const deliveryAssignmentBodySchema = z
  .object({
    memberId: idSchema,
    expectedVersion: z.number().int().min(0),
    expectedOrderVersion: z.number().int().positive(),
  })
  .strict();
export type DeliveryAssignmentBody = z.infer<typeof deliveryAssignmentBodySchema>;
export const courierStepBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedOrderVersion: z.number().int().positive(),
  })
  .strict();
export type CourierStepBody = z.infer<typeof courierStepBodySchema>;
export const courierPaymentBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedPaymentVersion: z.number().int().min(0).max(1),
    method: z.enum(["cash", "card"]),
    reference: z.string().trim().min(1).max(120),
  })
  .strict();
export type CourierPaymentBody = z.infer<typeof courierPaymentBodySchema>;
export const courierJobSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  orderId: idSchema,
  memberId: idSchema,
  version: z.number().int().positive(),
  status: z.enum(["assigned", "in_transit", "completed", "cancelled"]),
  orderVersion: z.number().int().positive(),
  totalMinor: moneyMinorSchema,
  paymentVersion: z.number().int().min(0).max(1),
  paid: z.boolean(),
});
export type CourierJob = z.infer<typeof courierJobSchema>;
export const courierJobContactSchema = courierJobSchema.extend({ contact: locationAddressSchema });
export type CourierJobContact = z.infer<typeof courierJobContactSchema>;
export const courierLiveEventSchema = z.object({
  businessId: idSchema,
  eventId: idSchema,
  jobId: idSchema,
  cursor: z.number().int().positive(),
  version: z.number().int().positive(),
  type: z.enum([
    "order.status_changed",
    "order.payment_recorded",
    "delivery.assigned",
    "delivery.departed",
    "delivery.completed",
    "delivery.cancelled",
  ]),
});
export type CourierLiveEvent = z.infer<typeof courierLiveEventSchema>;
export const courierLiveReplaySchema = z.object({
  items: z.array(courierLiveEventSchema),
  cursor: z.number().int().nonnegative(),
  reset: z.boolean(),
});
export type CourierLiveReplay = z.infer<typeof courierLiveReplaySchema>;
