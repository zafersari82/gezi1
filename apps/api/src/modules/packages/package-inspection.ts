import {
  isPackagePath,
  isSecureNetworkOrigin,
  PACKAGE_MANIFEST_FILE,
  PACKAGE_MAX_FILES,
  PACKAGE_UNPACKED_RATIO,
  packageContentType,
  packageDigestInput,
  type PackageFinding,
  type PackageManifest,
  packageManifestSchema,
  type PackageProblem,
} from "@vado/contracts";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { sha256 } from "../../core/security";
import { readZip, ZipError } from "../../core/zip";
import { analyzePackage } from "./package-analysis";

/** Yüklenen arşive uygulanan, ortama bağlı kurallar. */
export interface InspectionRules {
  /** Arşivin en büyük boyutu (bayt); açılmış boyut sınırı buna göre ölçeklenir. */
  maxArchiveBytes: number;
  /** Şifresiz (http, ws) adreslere izin var mı? Yalnızca geliştirme ortamında. */
  allowInsecureNetwork: boolean;
}

export interface InspectedFile {
  path: string;
  data: Buffer;
  sha256: string;
  size: number;
  contentType: string;
}

export interface InspectedPackage {
  manifest: PackageManifest;
  files: InspectedFile[];
  /** Sürümün içerik özeti: arşivin sıkıştırma biçiminden bağımsızdır. */
  digest: string;
  sizeBytes: number;
  findings: PackageFinding[];
}

const PROBLEMS_MAX = 50;
const BYTE_ORDER_MARK = "\uFEFF";
const turkish = z.locales.tr().localeError;

function invalid(problems: PackageProblem[]): AppError {
  return new AppError("package_invalid", problems.slice(0, PROBLEMS_MAX));
}

/** Bildirim dosyasını okur; sorun varsa `problems` listesine ekler ve `null` döndürür. */
function readManifest(
  files: readonly InspectedFile[],
  problems: PackageProblem[],
): PackageManifest | null {
  const file = files.find((candidate) => candidate.path === PACKAGE_MANIFEST_FILE);
  if (file === undefined) {
    problems.push({
      file: PACKAGE_MANIFEST_FILE,
      message:
        "Bildirim dosyası arşivin kökünde bulunmalı. Klasörün kendisi değil, içindekiler sıkıştırılmalı.",
    });
    return null;
  }

  let json: unknown;
  try {
    const text = file.data.toString("utf8");
    json = JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text);
  } catch {
    problems.push({ file: PACKAGE_MANIFEST_FILE, message: "Dosya geçerli bir JSON değil." });
    return null;
  }

  const parsed = packageManifestSchema.safeParse(json, { error: turkish });
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) {
    const field = issue.path.join(".");
    problems.push({
      file: PACKAGE_MANIFEST_FILE,
      message: field === "" ? issue.message : `${field}: ${issue.message}`,
    });
  }
  return null;
}

/**
 * Yüklenen arşivi açar ve paket kurallarına göre denetler. Kurallara uymayan arşiv, bulunan
 * sorunların listesiyle `package_invalid` hatasına yol açar; hiçbir dosya saklanmaz.
 */
export function inspectPackage(archive: Buffer, rules: InspectionRules): InspectedPackage {
  if (archive.length > rules.maxArchiveBytes) throw new AppError("package_too_large");

  let entries;
  try {
    entries = readZip(archive, {
      files: PACKAGE_MAX_FILES,
      totalBytes: rules.maxArchiveBytes * PACKAGE_UNPACKED_RATIO,
    });
  } catch (error) {
    if (error instanceof ZipError) throw invalid([{ file: null, message: error.message }]);
    throw error;
  }

  const problems: PackageProblem[] = [];
  const files: InspectedFile[] = [];
  for (const { path, data } of entries) {
    const contentType = packageContentType(path);
    if (!isPackagePath(path)) {
      problems.push({
        file: path,
        message:
          "Dosya yolu kurallara uymuyor: yalnızca harf, rakam, nokta, tire ve alt çizgi " +
          "kullanılabilir; gizli dosya, boşluk ve üst klasöre çıkan yol olamaz.",
      });
    } else if (contentType === null) {
      problems.push({ file: path, message: "Bu dosya türü pakete giremez." });
    } else {
      files.push({ path, data, sha256: sha256(data), size: data.length, contentType });
    }
  }

  const manifest = readManifest(files, problems);
  if (manifest !== null) {
    const paths = new Set(files.map((file) => file.path));
    if (!paths.has(manifest.entry)) {
      problems.push({ file: manifest.entry, message: "Giriş sayfası pakette yok." });
    }
    if (manifest.icon !== undefined && !paths.has(manifest.icon)) {
      problems.push({ file: manifest.icon, message: "Simge dosyası pakette yok." });
    }
    if (!rules.allowInsecureNetwork) {
      for (const origin of manifest.network.filter((item) => !isSecureNetworkOrigin(item))) {
        problems.push({
          file: PACKAGE_MANIFEST_FILE,
          message: `Yalnızca şifreli (https, wss) adreslere bağlanılabilir: ${origin}`,
        });
      }
    }
  }
  if (manifest === null || problems.length > 0) throw invalid(problems);

  return {
    manifest,
    files,
    digest: sha256(packageDigestInput(files)),
    sizeBytes: files.reduce((total, file) => total + file.size, 0),
    findings: analyzePackage(manifest, files),
  };
}
