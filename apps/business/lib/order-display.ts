import { formatBranchDateTime } from "@vado/contracts";

/** Siparişin tarihi şubenin saatiyle; yurt içi şubede saat dilimi adı gösterilmez. */
export function operationalDateTime(date: string, branchTimezone: string): string {
  return formatBranchDateTime(date, branchTimezone);
}

/** Tam UUID kayıtta kalır; ekranda kısa ve okunabilir son dört hane gösterilir. */
export function orderDisplayNumber(id: string): string {
  return `#${id.replaceAll("-", "").slice(-4).toUpperCase()}`;
}
