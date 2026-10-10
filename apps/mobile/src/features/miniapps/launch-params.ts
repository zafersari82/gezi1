import type { QrParams } from "@vado/contracts";

/** Bellekte tutulan en fazla açılış sayısı; eskileri silinir. */
const MAX_LAUNCHES = 8;

/** Kaynağı yalnız kabuk belirler; mini uygulamanın köprüsüne aktarılmaz. */
export interface LaunchOrigin {
  type: "business";
  businessId: string;
}

interface RememberedLaunch {
  miniAppId: string;
  params: QrParams;
  qr: string | null;
  origin: LaunchOrigin | null;
}
const launches = new Map<string, RememberedLaunch>();
let counter = 0;

/**
 * Doğrulanmış QR parametrelerini veya VADO'nun sunucudan aldığı mağaza bağlamını bellekte
 * tutar. URL'ye yalnız açılış anahtarı yazılır; bağlam bilgisi mini uygulamanın kendisinin
 * belirleyebileceği serbest URL parametrelerinden okunmaz.
 */
export function rememberLaunch(
  miniAppId: string,
  params: QrParams,
  qr: string | null = null,
  origin: LaunchOrigin | null = null,
): string {
  counter += 1;
  const key = `${String(Date.now())}-${String(counter)}`;
  launches.set(key, { miniAppId, params, qr, origin });
  for (const old of launches.keys()) {
    if (launches.size <= MAX_LAUNCHES) break;
    launches.delete(old);
  }
  return key;
}

/** Açılışın parametreleri; anahtar yoksa, tanınmıyorsa ya da başka bir kayda aitse boştur. */
export function launchParams(miniAppId: string, key: string | undefined): QrParams {
  const launch = key === undefined ? undefined : launches.get(key);
  return launch?.miniAppId === miniAppId ? launch.params : {};
}

/** Ham imza yalnız kabukta kalır; paket bir masa değeri uydurup bunun yerine koyamaz. */
export function launchQr(miniAppId: string, key: string | undefined): string | null {
  const launch = key === undefined ? undefined : launches.get(key);
  return launch?.miniAppId === miniAppId ? launch.qr : null;
}

/** Dönüş bağlantısı yalnız aynı uygulamanın hatırlanan açılışında bulunur. */
export function launchOrigin(miniAppId: string, key: string | undefined): LaunchOrigin | null {
  const launch = key === undefined ? undefined : launches.get(key);
  return launch?.miniAppId === miniAppId ? launch.origin : null;
}
