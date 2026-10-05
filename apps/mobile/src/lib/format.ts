const LOCALE = "tr-TR";
const DAY_MS = 24 * 60 * 60 * 1000;

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });
const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: "long" });
const shortDateFormat = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" });
const longDateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const moneyFormat = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "TRY" });

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** İki zaman arasındaki takvim günü farkı (bugün 0, dün 1). */
function daysAgo(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
}

/** Saat: 14:05 */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** Sohbet listesindeki kısa zaman: bugün saat, dün "Dün", bu hafta gün adı, daha eskisi tarih. */
export function formatListTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const days = daysAgo(date, now);
  if (days <= 0) return timeFormat.format(date);
  if (days === 1) return "Dün";
  if (days < 7) return weekdayFormat.format(date);
  return shortDateFormat.format(date);
}

/** Sohbet içindeki gün ayracı: "Bugün", "Dün" veya tam tarih. */
export function formatDayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const days = daysAgo(date, now);
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  return longDateFormat.format(date);
}

/** Sohbet içindeki zaman ayracı: bugün "14:05", dün "Dün 14:05", daha eskisi "3 Eki 14:05". */
export function formatChatStamp(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const days = daysAgo(date, now);
  if (days <= 0) return timeFormat.format(date);
  if (days === 1) return `Dün ${timeFormat.format(date)}`;
  if (days < 7) return `${weekdayFormat.format(date)} ${timeFormat.format(date)}`;
  return dateTimeFormat.format(date);
}

/** Paylaşım ve kayıt zamanı: "3 Eki 14:05" */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** İki zaman aynı takvim gününde mi? */
export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** Kuruş cinsinden tutarı Türk lirası olarak yazar: 65000 → ₺650,00 */
export function formatMoney(amountMinor: number): string {
  return moneyFormat.format(amountMinor / 100);
}

/** Kalan süreyi dakika:saniye olarak yazar: 125 → 2:05 */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
