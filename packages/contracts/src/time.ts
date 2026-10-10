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

/** Platformun yurt içi saat dilimi; bu dilimdeki saatler kişiye dilim adı olmadan gösterilir. */
export const HOME_TIMEZONE = "Europe/Istanbul";

/** Saat diliminin kişiye gösterilen adı ("Europe/Berlin" → "Berlin"); yurt içinde gösterilmez. */
export function timezoneLabel(timezone: string): string | null {
  if (timezone === HOME_TIMEZONE) return null;
  return (timezone.split("/").at(-1) ?? timezone).replaceAll("_", " ");
}

/**
 * Cihaz saat diliminden bağımsız şube tarihi. Şube yurt dışındaysa şehir adı eklenir; teknik
 * saat dilimi adı ("Europe/Istanbul") hiç gösterilmez.
 */
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
  const time = `${part("day")} ${part("month")} ${part("hour")}:${part("minute")}`;
  const label = timezoneLabel(timezone);
  return label === null ? time : `${time} · ${label}`;
}
