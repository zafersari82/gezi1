import { z } from "zod";

import { idSchema, timestampSchema } from "./common";

export const BUSINESS_TICKET_TTL_MS = 60_000;
export const BUSINESS_SOCKET_TTL_MS = 5 * 60_000;
export const businessSocketTicketSchema = z.object({
  ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: timestampSchema,
  socketUrl: z.url(),
});
export type BusinessSocketTicket = z.infer<typeof businessSocketTicketSchema>;
/** Bildirim yalnızca yenileme işaretidir; müşteri veya sipariş içeriği taşımaz. */
export const businessOrderEventSchema = z.object({
  eventId: idSchema,
  businessId: idSchema,
  orderId: idSchema,
  sequence: z.number().int().positive(),
  type: z.enum(["order.placed", "order.status_changed"]),
});
export type BusinessOrderEvent = z.infer<typeof businessOrderEventSchema>;

export const liveEventSchema = z.object({
  eventId: idSchema,
  businessId: idSchema,
  branchId: idSchema,
  appInstanceId: idSchema,
  cursor: z.number().int().positive(),
  type: z.enum([
    "order.placed",
    "order.status_changed",
    "order.payment_recorded",
    "table.requested",
    "table.request_resolved",
  ]),
  orderId: idSchema.nullable(),
  tableSessionId: idSchema.nullable(),
});
export type LiveEvent = z.infer<typeof liveEventSchema>;
export const liveReplayQuerySchema = z
  .object({ cursor: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0) })
  .strict();
export const liveReplaySchema = z.object({
  items: z.array(liveEventSchema),
  cursor: z.number().int().nonnegative(),
  reset: z.boolean(),
});
export type LiveReplay = z.infer<typeof liveReplaySchema>;
