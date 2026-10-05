import { z } from "zod";

import { idSchema } from "./common";

export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export const MEDIA_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const mediaContentTypeSchema = z.enum(MEDIA_CONTENT_TYPES);
export type MediaContentType = z.infer<typeof mediaContentTypeSchema>;

/** Çok parçalı yükleme isteğinde dosyanın bulunduğu alanın adı. */
export const MEDIA_UPLOAD_FIELD = "file";

export const mediaSchema = z.object({
  id: idSchema,
  url: z.string(),
  contentType: mediaContentTypeSchema,
  byteSize: z.number().int(),
});
export type Media = z.infer<typeof mediaSchema>;
