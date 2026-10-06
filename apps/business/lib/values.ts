export function decimalToMinor(value: string): number {
  const text = value.trim();
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(text))
    throw new Error("Tutarı en çok iki ondalık basamakla yaz.");
  const [whole = "", fraction = ""] = text.replace(",", ".").split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > 100_000_000n) throw new Error("Tutar en çok 1.000.000 TL olabilir.");
  return Number(amount);
}
export function minutesFromTime(value: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Geçerli bir saat seç.");
  const [hour = "", minute = ""] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}
export const money = (amount: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount / 100);
export function timeFromMinutes(minutes: number): string {
  const value = minutes % 1440;
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}
export const STATE_LABELS: Readonly<Record<string, string>> = {
  placed: "Yeni",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  completed: "Tamamlandı",
  cancelled: "İptal edildi",
};
export function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}
