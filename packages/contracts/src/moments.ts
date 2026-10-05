import { z } from "zod";

import { idSchema, timestampSchema } from "./common";
import { userRefSchema } from "./users";

export const MOMENT_BODY_MAX = 1000;
export const MOMENT_IMAGES_MAX = 9;
export const MOMENT_COMMENT_MAX = 300;

export const momentCommentSchema = z.object({
  id: idSchema,
  author: userRefSchema,
  body: z.string(),
  createdAt: timestampSchema,
});
export type MomentComment = z.infer<typeof momentCommentSchema>;

/**
 * Bir paylaşımda beğeni ve yorumların yalnızca görüntüleyenin kendi kişilerinden
 * (ve paylaşım sahibinden) gelenleri görünür; tanımadığı kişilerin etkileşimleri gizlidir.
 */
export const momentSchema = z.object({
  id: idSchema,
  seq: z.number().int(),
  author: userRefSchema,
  body: z.string(),
  imageUrls: z.array(z.string()),
  likedByMe: z.boolean(),
  likes: z.array(userRefSchema),
  comments: z.array(momentCommentSchema),
  createdAt: timestampSchema,
});
export type Moment = z.infer<typeof momentSchema>;

export const createMomentBodySchema = z.object({
  body: z.string().trim().max(MOMENT_BODY_MAX).optional(),
  mediaIds: z.array(idSchema).max(MOMENT_IMAGES_MAX).optional(),
});
export type CreateMomentBody = z.infer<typeof createMomentBodySchema>;

export const createMomentCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(MOMENT_COMMENT_MAX),
});
export type CreateMomentCommentBody = z.infer<typeof createMomentCommentBodySchema>;
