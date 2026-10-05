import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** İki metni, uzunlukları dışında bilgi sızdırmadan karşılaştırır. */
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Oturum belirteci gibi tahmin edilemez değerler için 256 bitlik rastgele metin üretir. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Metnin ya da ham verinin SHA-256 özeti (onaltılık). */
export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Sayfaya gömülen betiğin ya da stilin güvenlik politikasındaki (CSP) karşılığı: tarayıcı yalnızca
 * içeriği bu özetle eşleşen satır içi kodu çalıştırır.
 */
export function cspHash(inline: string): string {
  return `'sha256-${createHash("sha256").update(inline).digest("base64")}'`;
}
