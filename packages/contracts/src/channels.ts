import { z } from "zod";

import { idSchema } from "./common";

/** İşletme duyuruları, kişisel Anlar ve reklam bildirimlerinden bağımsızdır. */
export const channelPostBodySchema = z
  .object({
    body: z.string().trim().min(1).max(500),
  })
  .strict();
export type ChannelPostBody = z.infer<typeof channelPostBodySchema>;

export const channelPostSchema = z.object({
  id: idSchema,
  businessId: idSchema,
  businessName: z.string(),
  body: z.string(),
  publishedAt: z.iso.datetime({ offset: true }),
});
export type ChannelPost = z.infer<typeof channelPostSchema>;

export const channelFollowSchema = z.object({ following: z.boolean() });
export const channelFollowingSchema = z.object({
  businessId: idSchema,
  businessName: z.string(),
  followedAt: z.iso.datetime({ offset: true }),
});
export type ChannelFollowing = z.infer<typeof channelFollowingSchema>;

/** Sıra numarası metin taşınır; bigint JavaScript sayı hassasiyetine dönüşmez. */
export const channelPageQuerySchema = z.object({
  cursor: z
    .string()
    .regex(/^[1-9][0-9]{0,17}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});
export const channelPageSchema = z.object({
  items: z.array(channelPostSchema),
  nextCursor: z.string().nullable(),
});
export type ChannelPage = z.infer<typeof channelPageSchema>;
