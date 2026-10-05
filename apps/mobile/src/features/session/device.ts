import * as Crypto from "expo-crypto";

import { secureStorage } from "./secure-storage";

const DEVICE_ID_KEY = "vado.device-id";
const DEVICE_KEY_KEY = "vado.device-key";

/**
 * Bu kuruluma özel cihaz kimliği. İlk çağrıda rastgele üretilir ve cihazda saklanır; çıkış
 * yapıldığında silinmez, böylece aynı cihazdan yeniden giriş "tanınan cihaz" sayılır.
 * Cihazın seri numarası değildir: işletim sistemleri onu uygulamalara vermez.
 */
export async function getDeviceId(): Promise<string> {
  const stored = await secureStorage.get(DEVICE_ID_KEY);
  if (stored !== null) return stored;
  const id = Crypto.randomUUID();
  await secureStorage.set(DEVICE_ID_KEY, id);
  return id;
}

/**
 * Girişte sunucunun verdiği cihaz anahtarı. Hassas işlemlerden önce kimliği SMS beklemeden
 * yeniden kanıtlamaya yarar; oturumla birlikte silinir.
 */
export const deviceKey = {
  read: (): Promise<string | null> => secureStorage.get(DEVICE_KEY_KEY),
  store: (key: string): Promise<void> => secureStorage.set(DEVICE_KEY_KEY, key),
  clear: (): Promise<void> => secureStorage.remove(DEVICE_KEY_KEY),
};
