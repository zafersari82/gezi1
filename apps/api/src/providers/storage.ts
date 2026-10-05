import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Medya adreslerinin API üzerindeki yol öneki. */
export const MEDIA_ROUTE_PREFIX = "/media/";

/**
 * Yüklenen dosyaların saklandığı yer. Varsayılan uygulama yerel diske yazar;
 * S3 uyumlu bir depolama için aynı arayüzü uygulayan yeni bir sağlayıcı yazmak yeterlidir.
 */
export interface StorageProvider {
  put: (key: string, data: Buffer) => Promise<void>;
  remove: (key: string) => Promise<void>;
  /** Dosyanın istemcilerin erişebileceği tam adresi. */
  publicUrl: (key: string) => string;
}

export interface LocalStorage extends StorageProvider {
  /** Dosyaların durduğu klasörün tam yolu; statik sunum bunu kullanır. */
  readonly root: string;
}

export async function createLocalStorage(
  dir: string,
  publicBaseUrl: string,
): Promise<LocalStorage> {
  const root = resolve(dir);
  await mkdir(root, { recursive: true });

  return {
    root,
    put: (key, data) => writeFile(join(root, key), data),
    remove: (key) => rm(join(root, key), { force: true }),
    publicUrl: (key) => `${publicBaseUrl}${MEDIA_ROUTE_PREFIX}${key}`,
  };
}
