import { z } from "zod";

/** Tüm kayıt kimlikleri UUID'dir. */
export const idSchema = z.uuid();

/** ISO 8601 biçiminde UTC zaman damgası. */
export const timestampSchema = z.iso.datetime();

export const PAGE_SIZE_DEFAULT = 30;
export const PAGE_SIZE_MAX = 100;

/** Sayfalı listelerde imleç, bir önceki sayfanın son kaydının sıra numarasıdır. */
export const pageQuerySchema = z.object({
  cursor: z
    .string()
    .regex(/^\d{1,18}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface List<T> {
  items: T[];
}

export interface Page<T> extends List<T> {
  nextCursor: string | null;
}

export function listOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item) });
}

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

/** İşletmelerin ve mini uygulamaların ortak kategori listesi. */
export const CATEGORIES = [
  "food",
  "shopping",
  "beauty",
  "health",
  "transport",
  "education",
  "entertainment",
  "finance",
  "public",
  "other",
] as const;

export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  food: "Yeme & İçme",
  shopping: "Alışveriş",
  beauty: "Güzellik & Bakım",
  health: "Sağlık",
  transport: "Ulaşım",
  education: "Eğitim",
  entertainment: "Eğlence",
  finance: "Finans",
  public: "Kamu",
  other: "Diğer",
};

/** Para tutarları kuruş cinsinden tam sayıdır; tek para birimi Türk lirasıdır. */
export const CURRENCY = "TRY";
export const amountMinorSchema = z.number().int().positive().max(100_000_000);
