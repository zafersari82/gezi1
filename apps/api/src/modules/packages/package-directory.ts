import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeZip, type ZipEntry } from "../../core/zip";
import { type InspectedPackage, type InspectionRules, inspectPackage } from "./package-inspection";

/** Klasörden okunan paket dosyaları ve pakete alınmayanlar. */
export interface PackageDirectory {
  entries: ZipEntry[];
  /** Adı nokta ile başladığı için atlanan dosya ve klasörler (`.DS_Store`, `.vite` gibi). */
  skipped: string[];
}

/** Klasörden üretilen, yüklenmeye hazır paket. */
export interface BuiltPackage extends PackageDirectory {
  archive: Buffer;
  inspected: InspectedPackage;
}

/**
 * Derlenmiş mini uygulamanın klasörünü okur. Yollar pakette görüneceği biçimde, klasöre göre ve
 * `/` ile ayrılmış olarak döner. Gizli dosyalar pakete giremediği için baştan atlanır.
 */
export async function readPackageDirectory(directory: string): Promise<PackageDirectory> {
  const entries: ZipEntry[] = [];
  const skipped: string[] = [];

  async function walk(prefix: string): Promise<void> {
    const children = await readdir(join(directory, prefix), { withFileTypes: true });
    for (const child of children.sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const path = prefix === "" ? child.name : `${prefix}/${child.name}`;
      if (child.name.startsWith(".")) skipped.push(path);
      else if (child.isDirectory()) await walk(path);
      else if (child.isFile()) entries.push({ path, data: await readFile(join(directory, path)) });
      else skipped.push(path);
    }
  }
  await walk("");
  return { entries, skipped };
}

/**
 * Klasörü paketler ve sunucunun yüklemede uygulayacağı kurallarla denetler. Aynı dosyalar her
 * çalıştırmada bayt bayt aynı arşivi ve aynı içerik özetini verir. Kurallara uymayan klasör,
 * sunucudaki gibi `package_invalid` hatasına yol açar.
 */
export async function buildPackage(
  directory: string,
  rules: InspectionRules,
): Promise<BuiltPackage> {
  const { entries, skipped } = await readPackageDirectory(directory);
  const archive = writeZip(entries);
  return { entries, skipped, archive, inspected: inspectPackage(archive, rules) };
}
