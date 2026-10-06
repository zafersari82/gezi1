import { z } from "zod";

import { idSchema, timestampSchema } from "./common";

export const eventQueueSchema = z.enum(["tenant", "platform"]);
export const retryEventParamsSchema = z.object({ queue: eventQueueSchema, id: idSchema });
export const deadEventSchema = z.object({
  id: idSchema,
  queue: eventQueueSchema,
  businessId: idSchema.nullable(),
  type: z.string(),
  attempts: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  lastError: z.string().nullable(),
});
export type DeadEvent = z.infer<typeof deadEventSchema>;
