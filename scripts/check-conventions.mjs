/**
 * ESLint ve Prettier'in denetleyemediği proje kurallarını denetler: `npm run conventions`.
 * Kuralların gerekçeleri docs/KOD_STANDARTLARI.md dosyasındadır.
 *
 * Her kural bir dosyayı alır ve bulduğu sorunları döndürür. Sorun yoksa betik sessizce biter;
 * sorun varsa hepsini dosya ve satır numarasıyla yazar ve 1 koduyla çıkar.
 */
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".expo",
  "dist",
  "coverage",
  "storage",
  "package-store",
  "android",
  "ios",
]);
/** Çatıların ürettiği, depoya girmeyen tip dosyaları. */
const GENERATED_FILES = new Set(["expo-env.d.ts", "next-env.d.ts"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".js", ".mjs", ".css", ".sql"]);
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".js", ".mjs"]);

/** Çatıların (Expo Router, Next.js, araçlar) adını kendisinin belirlediği dosyalar. */
const FRAMEWORK_FILE = /^(_layout|\+[a-z-]+|\[[a-zA-Z.]+\])\.tsx?$/;
const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)*$/;
const MIGRATION_FILE = /^(\d{4})_[a-z0-9]+(_[a-z0-9]+)*\.sql$/;

const SUPPRESSION = /eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck/;
const LEFTOVER_NOTE = /\b(TODO|FIXME|XXX|HACK)\b/;
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
const MANUAL_MEMO = /\b(useMemo|useCallback)\(|\bmemo\(/;
const WEB_DEPRECATED =
  /\bpointerEvents=|\b(textAlignVertical|accessibilityElementsHidden|importantForAccessibility)\b/;
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']*)["']/;
/** Çalışma alanı paketlerinin kök klasörü: apps/api, packages/contracts, miniapps/appointment… */
const PACKAGE_ROOT = /^(?:apps|packages|miniapps)\/[^/]+/;

/** @typedef {{ path: string, name: string, extension: string, lines: string[] }} SourceFile */
/** @typedef {{ file: string, line: number, message: string }} Problem */

const toPosix = (path) => path.split(sep).join("/");

/** @returns {AsyncGenerator<string>} */
async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (IGNORED_DIRECTORIES.has(entry.name) || GENERATED_FILES.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) yield path;
  }
}

/**
 * Her satırı denetleyip eşleşenleri sorun olarak döndüren kural üretir.
 * @param {(file: SourceFile) => boolean} applies
 * @param {RegExp} pattern
 * @param {string} message
 */
function lineRule(applies, pattern, message) {
  /** @param {SourceFile} file @returns {Problem[]} */
  return (file) =>
    applies(file)
      ? file.lines.flatMap((text, index) =>
          pattern.test(text) ? [{ file: file.path, line: index + 1, message }] : [],
        )
      : [];
}

const isCode = (file) => CODE_EXTENSIONS.has(file.extension);
const isThisScript = (file) => file.path === "scripts/check-conventions.mjs";

const rules = [
  // Dosya adları: küçük harf ve tire. Çatıların zorunlu tuttuğu adlar hariç.
  (file) => {
    if (FRAMEWORK_FILE.test(file.name) || file.extension === ".sql") return [];
    return KEBAB_CASE.test(file.name)
      ? []
      : [{ file: file.path, line: 1, message: "Dosya adı küçük harf ve tire ile yazılmalı" }];
  },

  // Veritabanı şema dosyaları: 0001_aciklama.sql
  (file) => {
    if (file.extension !== ".sql") return [];
    return MIGRATION_FILE.test(file.name)
      ? []
      : [{ file: file.path, line: 1, message: "Şema dosyası NNNN_aciklama.sql biçiminde olmalı" }];
  },

  lineRule(
    (file) => !isThisScript(file),
    SUPPRESSION,
    "Kural susturulmaz; kodu kurala uyacak biçimde düzelt",
  ),
  lineRule(
    (file) => !isThisScript(file),
    LEFTOVER_NOTE,
    "Yarım bırakılmış iş notu; işi bitir ya da docs/YOL_HARITASI.md dosyasına taşı",
  ),
  // Paketler birbirinin içine göreli yolla uzanmaz; yalnızca @vado/* adıyla içe aktarır.
  (file) => {
    const packageRoot = PACKAGE_ROOT.exec(file.path)?.[0];
    if (packageRoot === undefined || !isCode(file)) return [];
    return file.lines.flatMap((text, index) => {
      const specifier = RELATIVE_IMPORT.exec(text)?.[1];
      if (specifier === undefined) return [];
      const target = posix.join(posix.dirname(file.path), specifier);
      return target.startsWith(`${packageRoot}/`)
        ? []
        : [{ file: file.path, line: index + 1, message: "Paket dışına göreli yolla çıkılmaz" }];
    });
  },

  // Renkler yalnızca tema dosyalarında tanımlanır.
  lineRule(
    (file) =>
      file.path.startsWith("apps/mobile/src/") &&
      isCode(file) &&
      file.path !== "apps/mobile/src/theme/tokens.ts",
    RAW_COLOR,
    "Renk doğrudan yazılmaz; theme/tokens.ts içindeki adı kullan",
  ),
  lineRule(
    (file) => file.path.startsWith("apps/portal/") && isCode(file),
    RAW_COLOR,
    "Renk doğrudan yazılmaz; app/globals.css içindeki değişkeni kullan",
  ),

  // React Compiler açıkken elle ezberleme (memoization) yazılmaz.
  lineRule(
    (file) => file.path.startsWith("apps/mobile/src/") && isCode(file),
    MANUAL_MEMO,
    "React Compiler açık; useMemo, useCallback ve memo kullanılmaz",
  ),

  // Web önizlemesinde uyarı veren özelliklerin her ortamda geçerli karşılıkları kullanılır.
  lineRule(
    (file) => file.path.startsWith("apps/mobile/src/") && isCode(file),
    WEB_DEPRECATED,
    "Web'de uyarı verir; stilde pointerEvents ve verticalAlign, gizlemek için aria-hidden kullan",
  ),
];

/** Şema dosyaları 0001'den başlayıp boşluksuz artmalıdır. */
function checkMigrationSequence(files) {
  const migrations = files
    .filter((file) => file.extension === ".sql" && MIGRATION_FILE.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  return migrations.flatMap((file, index) => {
    const expected = String(index + 1).padStart(4, "0");
    return file.name.startsWith(expected)
      ? []
      : [{ file: file.path, line: 1, message: `Sıra numarası ${expected} olmalı` }];
  });
}

/** Tüm paketler kök paketle aynı sürümü taşır. */
async function checkVersions() {
  const read = async (path) => JSON.parse(await readFile(join(ROOT, path), "utf8"));
  const root = await read("package.json");
  const problems = [];
  for (const group of ["apps", "packages", "miniapps"]) {
    for (const entry of await readdir(join(ROOT, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = `${group}/${entry.name}/package.json`;
      const manifest = await read(path);
      if (manifest.version !== root.version) {
        problems.push({ file: path, line: 1, message: `Sürüm ${root.version} olmalı` });
      }
    }
  }
  return problems;
}

/** @type {SourceFile[]} */
const files = [];
for await (const absolutePath of walk(ROOT)) {
  const path = toPosix(relative(ROOT, absolutePath));
  const content = await readFile(absolutePath, "utf8");
  files.push({
    path,
    name: basename(path),
    extension: extname(path),
    lines: content.split("\n"),
  });
}

const problems = [
  ...files.flatMap((file) => rules.flatMap((rule) => rule(file))),
  ...checkMigrationSequence(files),
  ...(await checkVersions()),
];

if (problems.length > 0) {
  for (const { file, line, message } of problems) console.error(`${file}:${line}  ${message}`);
  console.error(`\n${problems.length} kural ihlali bulundu.`);
  process.exit(1);
}
console.log(`Kurallara uygun: ${files.length} dosya denetlendi.`);
