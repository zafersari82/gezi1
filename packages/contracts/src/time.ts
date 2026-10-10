import { z } from "zod";

export const timezoneSchema = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("tr-TR", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });

/** Cihaz saat diliminden bağımsız şube tarihi; saat dilimi kullanıcıya açıkça gösterilir. */
export function formatBranchDateTime(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === name)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("hour")}:${part("minute")} · ${timezone}`;
}
