import { z } from "zod";

import { idSchema, timestampSchema } from "./common";
import { userRefSchema } from "./users";

export const CONTACT_REQUEST_MESSAGE_MAX = 120;

export const contactSchema = userRefSchema.extend({
  username: z.string().nullable(),
  bio: z.string(),
  since: timestampSchema,
});
export type Contact = z.infer<typeof contactSchema>;

export const contactRequestSchema = z.object({
  id: idSchema,
  /** İsteğin karşı tarafı: gelen istekte gönderen, giden istekte alıcı. */
  user: userRefSchema,
  message: z.string(),
  createdAt: timestampSchema,
});
export type ContactRequest = z.infer<typeof contactRequestSchema>;

export const contactRequestsSchema = z.object({
  incoming: z.array(contactRequestSchema),
  outgoing: z.array(contactRequestSchema),
});
export type ContactRequests = z.infer<typeof contactRequestsSchema>;

export const createContactRequestBodySchema = z.object({
  userId: idSchema,
  message: z.string().trim().max(CONTACT_REQUEST_MESSAGE_MAX).optional(),
});
export type CreateContactRequestBody = z.infer<typeof createContactRequestBodySchema>;

/**
 * Karşı taraf daha önce bize istek göndermişse yeni istek açılmaz, kişi doğrudan eklenir
 * ve durum `accepted` döner.
 */
export const createContactRequestResponseSchema = z.object({
  status: z.enum(["pending", "accepted"]),
  requestId: idSchema.nullable(),
});
export type CreateContactRequestResponse = z.infer<typeof createContactRequestResponseSchema>;
