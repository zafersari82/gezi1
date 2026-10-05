import { z } from "zod";

export const REPORT_NOTE_MAX = 500;

export const reportTargetTypeSchema = z.enum(["user", "message", "moment", "miniapp", "business"]);
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;

export const REPORT_REASONS = ["spam", "abuse", "fraud", "illegal", "other"] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "İstenmeyen içerik",
  abuse: "Taciz veya hakaret",
  fraud: "Dolandırıcılık",
  illegal: "Hukuka aykırı içerik",
  other: "Diğer",
};

export const createReportBodySchema = z.object({
  targetType: reportTargetTypeSchema,
  targetId: z.string().min(1).max(64),
  reason: reportReasonSchema,
  note: z.string().trim().max(REPORT_NOTE_MAX).optional(),
});
export type CreateReportBody = z.infer<typeof createReportBodySchema>;
