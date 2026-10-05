import type { QrParams } from "@vado/contracts";

/** Bellekte tutulan en fazla açılış sayısı; eskileri silinir. */
const MAX_LAUNCHES = 8;

const launches = new Map<string, { miniAppId: string; params: QrParams }>();
let counter = 0;

/**
 * Okutulan koddan gelen imzalı parametreleri saklar ve açılışın anahtarını döndürür. Anahtar
 * mini uygulama ekranının adresine yazılır; parametrelerin kendisi yazılmaz. Böylece bir bağlantı,
 * imzalı bir kod okutulmadan mini uygulamaya parametre veremez.
 */
export function rememberLaunch(miniAppId: string, params: QrParams): string {
  counter += 1;
  const key = `${String(Date.now())}-${String(counter)}`;
  launches.set(key, { miniAppId, params });
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
