import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PACKAGE_ARCHIVE_MAX_MB_DEFAULT,
  type PackageFinding,
  type PackageProblem,
} from "@vado/contracts";

import { AppError, StartupError } from "../core/errors";
import { buildPackage } from "../modules/packages/package-directory";

/**
 * Derlenmiş bir mini uygulamayı yüklenmeye hazır pakete çevirir:
 *
 *   npm run miniapp:pack -- <klasör> [--out <dosya.zip>] [--dev]
 *
 * Klasör, kökünde `vado.app.json` bulunan derleme çıktısıdır (ör. `miniapps/appointment/dist`).
 * Paket, sunucunun yüklemede uygulayacağı kurallarla denetlenir; kurallara uymuyorsa dosya
 * yazılmaz. `--dev`, yalnızca geliştirme ortamında kabul edilen şifresiz adreslere izin verir.
 */
const USAGE = "Kullanım: npm run miniapp:pack -- <klasör> [--out <dosya.zip>] [--dev]";
const LEVEL_LABELS: Record<PackageFinding["level"], string> = {
  blocked: "ENGELLENİR",
  review: "İNCELENİR",
  info: "BİLGİ",
};

interface Options {
  directory: string;
  out: string | null;
  dev: boolean;
}

function parseArguments(args: readonly string[]): Options {
  const options: Options = { directory: "", out: null, dev: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--dev") options.dev = true;
    else if (argument === "--out") options.out = args[(index += 1)] ?? "";
    else if (argument.startsWith("--") || options.directory !== "") throw new StartupError(USAGE);
    else options.directory = argument;
  }
  if (options.directory === "" || options.out === "") throw new StartupError(USAGE);
  return options;
}

const kilobytes = (bytes: number) => `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
const listOf = (items: readonly string[]) => (items.length === 0 ? "yok" : items.join(", "));

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  // npm betiği paketin klasöründe çalıştırır; yollar ise komutun yazıldığı klasöre göredir.
  const base = process.env.INIT_CWD ?? process.cwd();
  const directory = resolve(base, options.directory);

  const { archive, inspected, skipped } = await buildPackage(directory, {
    maxArchiveBytes: PACKAGE_ARCHIVE_MAX_MB_DEFAULT * 1024 * 1024,
    allowInsecureNetwork: options.dev,
  }).catch((error: unknown) => {
    if (error instanceof AppError) throw error;
    throw new StartupError(`Klasör okunamadı: ${directory}`);
  });
  const { manifest, files, findings } = inspected;
  const out = resolve(base, options.out ?? `${manifest.id}-${manifest.version}.zip`);
  writeFileSync(out, archive);

  const lines = [
    `Paket:    ${manifest.id} ${manifest.version} (${manifest.name})`,
    `Dosyalar: ${files.length} dosya, ${kilobytes(inspected.sizeBytes)} (arşiv ${kilobytes(archive.length)})`,
    `Özet:     ${inspected.digest}`,
    `Yetkiler: ${listOf(manifest.permissions)}`,
    `Adresler: ${listOf(manifest.network)}`,
    `Ayarlar:  ${listOf(manifest.config.map((field) => field.key))}`,
    ...(skipped.length === 0 ? [] : [`Atlanan:  ${skipped.join(", ")}`]),
    ...findings.map(
      (finding) => `${LEVEL_LABELS[finding.level]}: ${finding.file ?? "paket"}: ${finding.message}`,
    ),
    `Yazıldı:  ${out}`,
  ];
  console.log(lines.join("\n"));
}

function describe(error: unknown): unknown {
  if (error instanceof StartupError) return error.message;
  if (!(error instanceof AppError)) return error;
  const problems = Array.isArray(error.details) ? (error.details as PackageProblem[]) : [];
  return [
    error.message,
    ...problems.map((problem) => `  - ${problem.file ?? "arşiv"}: ${problem.message}`),
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(describe(error));
  process.exit(1);
});
