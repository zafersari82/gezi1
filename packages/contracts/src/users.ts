import { z } from "zod";

import { idSchema, timestampSchema } from "./common";

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;
export const BIO_MAX = 160;

export const displayNameSchema = z.string().trim().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX);

/** VADO kimliği: küçük harfle başlar; küçük harf, rakam ve alt çizgiden oluşur (3-24 karakter). */
export const usernameSchema = z.string().regex(/^[a-z][a-z0-9_]{2,23}$/);

/** Bir kullanıcının başkalarına görünen en küçük özeti. */
export const userRefSchema = z.object({
  id: idSchema,
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type UserRef = z.infer<typeof userRefSchema>;

/** Oturum sahibinin kendi hesabı. Telefon numarası yalnızca burada yer alır. */
export const meSchema = z.object({
  id: idSchema,
  phone: z.string(),
  displayName: z.string().nullable(),
  username: z.string().nullable(),
  bio: z.string(),
  avatarUrl: z.string().nullable(),
  discoverableByPhone: z.boolean(),
  createdAt: timestampSchema,
});
export type Me = z.infer<typeof meSchema>;

export const updateMeBodySchema = z.object({
  displayName: displayNameSchema.optional(),
  username: usernameSchema.nullable().optional(),
  bio: z.string().trim().max(BIO_MAX).optional(),
  avatarMediaId: idSchema.nullable().optional(),
  discoverableByPhone: z.boolean().optional(),
});
export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

/** Oturum sahibi ile görüntülenen kullanıcı arasındaki ilişki. */
export const relationSchema = z.enum([
  "self",
  "contact",
  "request_sent",
  "request_received",
  "blocked",
  "none",
]);
export type Relation = z.infer<typeof relationSchema>;

export const userProfileSchema = userRefSchema.extend({
  username: z.string().nullable(),
  bio: z.string(),
  relation: relationSchema,
  /** İlişki `request_sent` veya `request_received` ise ilgili isteğin kimliği. */
  requestId: idSchema.nullable(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/** Arama yalnızca tam eşleşmeyle çalışır: telefon numarası veya VADO kimliği. */
export const userSearchQuerySchema = z.object({
  q: z.string().trim().min(3).max(32),
});
export type UserSearchQuery = z.infer<typeof userSearchQuerySchema>;
