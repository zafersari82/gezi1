import { randomUUID } from "node:crypto";
import { link, mkdir, open, readdir, readFile, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { StartupError } from "../core/errors";
import { sha256 as sha256Of } from "../core/security";

/**
 * Paket dosyalarının saklandığı içerik adresli depo. Her içerik, SHA-256 özetiyle adlandırılır
 * ve yalnızca bir kez yazılır: deponun üzerine yazma ya da silme işlemi yoktur. Aynı içerik
 * yeniden gelirse var olan dosya doğrulanır; farklı içerik, tanımı gereği farklı adrese gider.
 *
 * Varsayılan uygulama yerel diske yazar. S3 uyumlu bir depolama için aynı arayüzü, koşullu yazma
 * (`If-None-Match: *`) ve nesne kilidiyle uygulayan bir sağlayıcı yazmak yeterlidir.
 */
export interface PackageStore {
  /** İçeriği saklar ve özetini (SHA-256, onaltılık) döndürür. */
  put: (data: Buffer) => Promise<string>;
  /** İçeriği okur ve özetini doğrular; yoksa ya da bozulmuşsa `PackageStoreError` fırlatır. */
  read: (sha256: string) => Promise<Buffer>;
}

export interface LocalPackageStore extends PackageStore {
  /** Deponun durduğu klasörün tam yolu. */
  readonly root: string;
  /** Verilen özetin depodaki dosya yolu. */
  pathOf: (sha256: string) => string;
}

/** Depodaki içerik eksik (`missing`) ya da kayıtlı özetiyle eşleşmiyor (`corrupt`). */
export class PackageStoreError extends Error {
  constructor(
    readonly reason: "missing" | "corrupt",
    readonly sha256: string,
  ) {
    super(
      reason === "missing"
        ? `Paket deposunda içerik yok: ${sha256}`
        : `Paket deposundaki içerik özetiyle eşleşmiyor: ${sha256}`,
    );
    this.name = "PackageStoreError";
  }
}

const SHA256 = /^[0-9a-f]{64}$/;
/** Sahibi dahil kimse yazamaz; yanlışlıkla düzenlemeye karşı ikinci bir engel. */
const READ_ONLY = 0o444;
/** Bundan eski bir geçici dosya, yarıda kalmış bir yazmanın artığıdır. */
const STALE_TEMPORARY_MS = 60 * 60 * 1000;

function errorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
}

export async function createLocalPackageStore(dir: string): Promise<LocalPackageStore> {
  const root = resolve(dir);
  const blobs = join(root, "blobs");
  const incoming = join(root, "incoming");

  await mkdir(incoming, { recursive: true });
  await mkdir(blobs, { recursive: true });

  // Yarıda kalmış yazmaların artıkları silinir; tamamlanmış içerik yalnızca `blobs` altındadır.
  // Yeni geçici dosyalara dokunulmaz: aynı depoyu kullanan başka bir süreç (çalışan API, depo
  // denetimi, örnek veri komutu) o anda yazıyor olabilir.
  for (const name of await readdir(incoming)) {
    const path = join(incoming, name);
    const modifiedAt = await stat(path).then(
      (info) => info.mtimeMs,
      () => null,
    );
    if (modifiedAt !== null && Date.now() - modifiedAt > STALE_TEMPORARY_MS) {
      await rm(path, { force: true });
    }
  }

  function pathOf(sha256: string): string {
    if (!SHA256.test(sha256)) throw new PackageStoreError("missing", sha256);
    return join(blobs, sha256.slice(0, 2), sha256);
  }

  async function read(sha256: string): Promise<Buffer> {
    let data: Buffer;
    try {
      data = await readFile(pathOf(sha256));
    } catch (error) {
      if (errorCode(error) === "ENOENT") throw new PackageStoreError("missing", sha256);
      throw error;
    }
    if (sha256Of(data) !== sha256) throw new PackageStoreError("corrupt", sha256);
    return data;
  }

  /**
   * İçerik önce geçici bir dosyaya yazılıp diske işlenir, sonra sabit bağlantıyla (hard link) asıl
   * adına bağlanır. Bağlama atomiktir ve hedef varsa başarısız olur: bir adres ya hiç yoktur ya
   * da tam ve doğru içeriği taşır, var olan içeriğin üzerine yazılamaz.
   */
  async function put(data: Buffer): Promise<string> {
    const sha256 = sha256Of(data);
    const target = pathOf(sha256);
    const temporary = join(incoming, randomUUID());

    await mkdir(join(blobs, sha256.slice(0, 2)), { recursive: true });
    const handle = await open(temporary, "wx", READ_ONLY);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, target);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      // Aynı içerik daha önce yazılmış; var olan dosyanın sağlam olduğu doğrulanır.
      await read(sha256);
    } finally {
      await rm(temporary, { force: true });
    }
    return sha256;
  }

  // Depo, sabit bağlantıyı desteklemeyen bir dosya sistemindeyse ilk yüklemede değil, başlangıçta
  // anlaşılır.
  try {
    await put(Buffer.from("vado-package-store"));
  } catch (error) {
    throw new StartupError(
      `Paket deposu kullanılamıyor (${root}): klasör yazılabilir olmalı ve dosya sistemi sabit ` +
        `bağlantıyı (hard link) desteklemeli. ${error instanceof Error ? error.message : ""}`,
    );
  }

  return { root, pathOf, put, read };
}
