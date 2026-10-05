/** Uygulama arka planda bu süreden kısa kaldıysa dönüşte kilit sorulmaz. */
export const LOCK_GRACE_MS = 30_000;

/** Uygulama arka plandan döndüğünde kilitlenmeli mi? */
export function shouldLock(enabled: boolean, awayMs: number): boolean {
  return enabled && awayMs >= LOCK_GRACE_MS;
}
