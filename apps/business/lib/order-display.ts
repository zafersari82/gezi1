import { formatBranchDateTime } from "@vado/contracts";

/** İşletmenin kendi saat dilimi gereksiz teknik metin olarak gösterilmez. */
export function operationalDateTime(
  date: string,
  branchTimezone: string,
  businessTimezone = "Europe/Istanbul",
): string {
  const formatted = formatBranchDateTime(date, branchTimezone);
  if (branchTimezone === businessTimezone) return formatted.split(" · ")[0] ?? formatted;
  const location = branchTimezone.split("/").at(-1)?.replaceAll("_", " ") ?? branchTimezone;
  return `${formatted.split(" · ")[0] ?? formatted} · ${location}`;
}

/** Tam UUID kayıtta kalır; ekranda kısa ve okunabilir son dört hane gösterilir. */
export function orderDisplayNumber(id: string): string {
  return `#${id.replaceAll("-", "").slice(-4).toUpperCase()}`;
}
