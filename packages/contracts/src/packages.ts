import { z } from "zod";

import { actorSchema } from "./admin-accounts";
import { CAPABILITIES, capabilitySchema } from "./capabilities";
import { timestampSchema } from "./common";

/**
 * Mini uygulama paketleri.
 *
 * Paket, incelenmiş koddur: bir zip dosyası olarak yüklenir, içeriği özetlenir ve bir daha
 * değiştirilemez. Uygulama kaydı (bkz. miniapps.ts) bir işletmenin vitrinidir: adı, simgesi,
 * ayarları ve yayınladığı paket sürümü. Aynı paketi çok sayıda uygulama kaydı kullanabilir.
 */

/** Paket kimliği: küçük harf, rakam ve tire (3-40 karakter). */
export const packageIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/,
    "Kimlik 3-40 karakter olmalı; küçük harf, rakam ve tire içerebilir",
  );

/** Sürüm numarası: `ana.alt.yama`; her bölüm en çok beş basamak, başta sıfır olmaz. */
export const versionSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/,
    "Sürüm numarası ana.alt.yama biçiminde olmalı (örnek: 1.4.0)",
  );

/** İki sürüm numarasını karşılaştırır: soldaki küçükse negatif, büyükse pozitif, eşitse 0. */
export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

// -- Paketin biçimi -----------------------------------------------------------

/** Paketin kökünde bulunması gereken bildirim dosyası. */
export const PACKAGE_MANIFEST_FILE = "vado.app.json";
export const PACKAGE_MANIFEST_VERSION = 1;
/** Çok parçalı yükleme isteğinde paket arşivinin bulunduğu alanın adı. */
export const PACKAGE_UPLOAD_FIELD = "package";

/**
 * Paket boyutu sınırları. WeChat ana pakette 2 MB uygular; VADO'nun kesin sınırı gerçek
 * cihazlarda açılış süresi ölçüldükten sonra belirlenecektir. Arşiv sınırı o zamana kadar sunucu
 * ayarıyla değiştirilebilir (`VADO_PACKAGE_MAX_MB`); açılmış boyut sınırı ona göre ölçeklenir.
 */
export const PACKAGE_ARCHIVE_MAX_MB_DEFAULT = 5;
/** Açılmış dosyaların toplamı, arşiv sınırının en çok bu kadar katı olabilir. */
export const PACKAGE_UNPACKED_RATIO = 4;
export const PACKAGE_MAX_FILES = 500;
/** Bu boyutun üzerindeki paketler için inceleme ekranında açılış süresi uyarısı çıkar. */
export const PACKAGE_SIZE_NOTICE_BYTES = 2 * 1024 * 1024;

const PATH_MAX = 180;
const PATH_DEPTH_MAX = 8;
/** Yol bölümü: harf, rakam, alt çizgi ya da tireyle başlar; nokta ile başlayamaz ve bitemez. */
const PATH_SEGMENT = /^[A-Za-z0-9_-](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/;

/**
 * Paket içindeki dosya yolu geçerli mi? Yollar görelidir ve `/` ile ayrılır; `..`, gizli dosyalar
 * (`.env`, `.DS_Store`), boşluk ve ASCII dışı karakterler kabul edilmez.
 */
export function isPackagePath(path: string): boolean {
  if (path.length === 0 || path.length > PATH_MAX) return false;
  const segments = path.split("/");
  return segments.length <= PATH_DEPTH_MAX && segments.every((part) => PATH_SEGMENT.test(part));
}

export const packagePathSchema = z
  .string()
  .refine(isPackagePath, "Paket içinde geçerli bir dosya yolu olmalı");

/** Pakete girebilen dosya türleri ve sunulurken kullanılan içerik türleri. */
const FILE_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

export const PACKAGE_FILE_EXTENSIONS = Object.keys(FILE_TYPES);

/** Dosyanın sunulacağı içerik türü; uzantı pakete girebilen türlerden değilse `null`. */
export function packageContentType(path: string): string | null {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return null;
  const extension = path.slice(dot + 1).toLowerCase();
  return Object.hasOwn(FILE_TYPES, extension) ? (FILE_TYPES[extension] ?? null) : null;
}

const NETWORK_PROTOCOLS = ["https:", "wss:", "http:", "ws:"];
/** Alan adı ya da IPv4 adresi: noktayla ayrılmış, harf ve rakamla başlayıp biten bölümler. */
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Paketin bağlanabileceği adres geçerli mi? Adres yalnızca şema, alan adı ve (varsayılan değilse)
 * porttan oluşur: `https://api.ornek.com`. Yol, joker ve büyük harf kabul edilmez.
 */
export function isNetworkOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    NETWORK_PROTOCOLS.includes(url.protocol) &&
    HOSTNAME.test(url.hostname) &&
    `${url.protocol}//${url.host}` === value
  );
}

/** Adres şifreli bağlantı mı kullanıyor? Canlı ortamda yalnızca bunlar kabul edilir. */
export function isSecureNetworkOrigin(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("wss://");
}

export const networkOriginSchema = z
  .string()
  .max(200)
  .refine(
    isNetworkOrigin,
    "Adres yalnızca şema ve alan adından oluşmalı (örnek: https://api.ornek.com)",
  );

// -- İşletme ayarları ---------------------------------------------------------

export const CONFIG_FIELD_TYPES = ["text", "number", "boolean", "select"] as const;
export type ConfigFieldType = (typeof CONFIG_FIELD_TYPES)[number];

/** `maxLength` verilmeyen metin alanlarının en büyük uzunluğu. */
export const CONFIG_TEXT_MAX_DEFAULT = 200;
const CONFIG_TEXT_MAX = 2000;
const CONFIG_FIELDS_MAX = 40;

export const configValueSchema = z.union([
  z.string().max(CONFIG_TEXT_MAX),
  z.number(),
  z.boolean(),
]);
export type ConfigValue = z.infer<typeof configValueSchema>;

/** Bir uygulama kaydının ayarları: alan anahtarı → değer. */
export const configValuesSchema = z.record(z.string(), configValueSchema);
export type ConfigValues = z.infer<typeof configValuesSchema>;

/**
 * Paketin, kendisini kullanan her işletmeden beklediği ayar alanı. Panel bu tanımdan form üretir;
 * sunucu, uygulama kaydının ayarlarını yayınlamadan önce bu tanıma göre doğrular.
 */
export const configFieldSchema = z
  .strictObject({
    key: z
      .string()
      .regex(
        /^[a-z][A-Za-z0-9]{0,39}$/,
        "Anahtar küçük harfle başlamalı; yalnızca harf ve rakam içerebilir",
      ),
    label: z.string().trim().min(1).max(60),
    type: z.enum(CONFIG_FIELD_TYPES),
    required: z.boolean().default(false),
    help: z.string().trim().min(1).max(200).optional(),
    /** Yalnızca `text`: en büyük uzunluk. */
    maxLength: z.number().int().min(1).max(CONFIG_TEXT_MAX).optional(),
    /** Yalnızca `select`: seçilebilecek değerler. */
    options: z
      .array(
        z.strictObject({
          value: z.string().min(1).max(60),
          label: z.string().trim().min(1).max(60),
        }),
      )
      .min(1)
      .max(50)
      .optional(),
    default: configValueSchema.optional(),
  })
  .superRefine((field, context) => {
    const issue = (path: string, message: string) => {
      context.addIssue({ code: "custom", path: [path], message });
    };
    if ((field.type === "select") !== (field.options !== undefined)) {
      issue("options", "Seçenekler yalnızca ve mutlaka `select` alanında bulunur.");
    }
    if (field.maxLength !== undefined && field.type !== "text") {
      issue("maxLength", "En büyük uzunluk yalnızca `text` alanında bulunur.");
    }
    if (field.options !== undefined) {
      const values = field.options.map((option) => option.value);
      if (new Set(values).size !== values.length)
        issue("options", "Seçenek değerleri yinelenemez.");
    }
    if (field.default !== undefined && typeof checkConfigValue(field, field.default) === "string") {
      issue("default", "Varsayılan değer alanın türüne uymuyor.");
    }
  });
export type ConfigField = z.infer<typeof configFieldSchema>;

interface ConfigFieldShape {
  type: ConfigFieldType;
  maxLength?: number | undefined;
  options?: readonly { value: string }[] | undefined;
}

/** Değer alanın türüne uyuyorsa değeri (`{ value }`), uymuyorsa nedenini (metin) döndürür. */
function checkConfigValue(
  field: ConfigFieldShape,
  value: unknown,
): { value: ConfigValue } | string {
  if (field.type === "text") {
    if (typeof value !== "string") return "Metin olmalı.";
    const max = field.maxLength ?? CONFIG_TEXT_MAX_DEFAULT;
    return value.length > max ? `En çok ${max} karakter olabilir.` : { value };
  }
  if (field.type === "number") {
    return typeof value === "number" && Number.isFinite(value) ? { value } : "Sayı olmalı.";
  }
  if (field.type === "boolean") {
    return typeof value === "boolean" ? { value } : "Evet ya da hayır olmalı.";
  }
  const allowed = field.options?.some((option) => option.value === value) ?? false;
  return typeof value === "string" && allowed ? { value } : "Listedeki seçeneklerden biri olmalı.";
}

/** Bir ayar değerinin kabul edilmeme nedeni. */
export const configProblemSchema = z.object({ key: z.string(), message: z.string() });
export type ConfigProblem = z.infer<typeof configProblemSchema>;

/**
 * Ayar değerlerini paketin bildirdiği alanlara göre doğrular. Verilmeyen alanlara varsayılan değer
 * yazılır; boş bırakılan isteğe bağlı alanlar sonuçta yer almaz. Paketin tanımadığı anahtarlar
 * sorun sayılır.
 */
export function resolveConfig(
  fields: readonly ConfigField[],
  input: Readonly<Record<string, unknown>>,
): { values: ConfigValues; problems: ConfigProblem[] } {
  const values: ConfigValues = {};
  const problems: ConfigProblem[] = [];

  const known = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(input)) {
    if (!known.has(key)) problems.push({ key, message: "Paket bu ayarı tanımıyor." });
  }
  for (const field of fields) {
    const given = input[field.key];
    const value = given === undefined || given === "" ? field.default : given;
    if (value === undefined) {
      if (field.required) problems.push({ key: field.key, message: "Bu alan zorunlu." });
      continue;
    }
    const checked = checkConfigValue(field, value);
    if (typeof checked === "string") problems.push({ key: field.key, message: checked });
    else values[field.key] = checked.value;
  }
  return { values, problems };
}

// -- Bildirim dosyası ---------------------------------------------------------

const unique = (items: readonly unknown[]) => new Set(items).size === items.length;
const REPEATED = "Aynı değer birden çok kez yazılamaz";

const isHtmlPath = (path: string) => path.toLowerCase().endsWith(".html");
const isImagePath = (path: string) => packageContentType(path)?.startsWith("image/") ?? false;

/**
 * `vado.app.json`: paketin kimliği, sürümü, istediği yetkiler ve bağlanacağı adresler.
 * Tanımlı olmayan alanlar reddedilir; yazım hatası sessizce yok sayılmaz.
 */
export const packageManifestSchema = z.strictObject({
  manifest: z.literal(PACKAGE_MANIFEST_VERSION),
  id: packageIdSchema,
  version: versionSchema,
  name: z.string().trim().min(2).max(60),
  /** Kabuğun açtığı sayfa; paket içinde bir `.html` dosyası. */
  entry: packagePathSchema
    .refine(isHtmlPath, "Giriş sayfası bir .html dosyası olmalı")
    .default("index.html"),
  /**
   * Paketin simgesi; paket içinde bir görsel. Kendi simgesini belirlemeyen uygulama kayıtları
   * bunu kullanır.
   */
  icon: packagePathSchema.refine(isImagePath, "Simge bir görsel dosyası olmalı").optional(),
  /** Paketin kabuktan isteyebileceği yetkiler. */
  permissions: z
    .array(capabilitySchema)
    .max(CAPABILITIES.length)
    .refine(unique, REPEATED)
    .default([]),
  /** Paketin bağlanabileceği adresler. Bunların dışındaki her bağlantı engellenir. */
  network: z.array(networkOriginSchema).max(20).refine(unique, REPEATED).default([]),
  /** Paketi kullanan her işletmenin dolduracağı ayarlar. */
  config: z
    .array(configFieldSchema)
    .max(CONFIG_FIELDS_MAX)
    .refine((fields) => unique(fields.map((field) => field.key)), "Ayar anahtarları yinelenemez")
    .default([]),
});
export type PackageManifest = z.infer<typeof packageManifestSchema>;

export interface PackageFileDigest {
  path: string;
  sha256: string;
  size: number;
}

/**
 * Sürümün içerik özetinin hesaplandığı metin: yol sırasıyla her dosya için bir satır,
 * `<sha256>  <boyut>  <yol>`. Özet, bu metnin SHA-256 değeridir; arşivin sıkıştırma biçiminden
 * bağımsızdır, yani aynı dosyalar her zaman aynı özeti verir.
 */
export function packageDigestInput(files: readonly PackageFileDigest[]): string {
  return [...files]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((file) => `${file.sha256}  ${file.size}  ${file.path}\n`)
    .join("");
}

// -- İnceleme -----------------------------------------------------------------

export const PACKAGE_VERSION_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "rejected",
  "withdrawn",
  "revoked",
] as const;
export const packageVersionStatusSchema = z.enum(PACKAGE_VERSION_STATUSES);
export type PackageVersionStatus = z.infer<typeof packageVersionStatusSchema>;

export const PACKAGE_VERSION_STATUS_LABELS: Record<PackageVersionStatus, string> = {
  draft: "Taslak",
  in_review: "İncelemede",
  approved: "Onaylı",
  rejected: "Reddedildi",
  withdrawn: "Vazgeçildi",
  revoked: "Geri çekildi",
};

/**
 * Otomatik bulgunun önemi. Bulgular yol göstericidir; güvence, paket sunulurken tarayıcıya
 * gönderilen güvenlik politikasıdır.
 *
 * - `blocked`: çalışma zamanında engellenir; uygulama beklendiği gibi çalışmayabilir.
 * - `review`: inceleyenin bakması gereken bir davranış.
 * - `info`: bilgi.
 */
export const PACKAGE_FINDING_LEVELS = ["blocked", "review", "info"] as const;
export type PackageFindingLevel = (typeof PACKAGE_FINDING_LEVELS)[number];

export const packageFindingSchema = z.object({
  level: z.enum(PACKAGE_FINDING_LEVELS),
  /** Bulgunun türü; aynı türdeki bulgular inceleme ekranında birlikte gösterilir. */
  code: z.string(),
  file: z.string().nullable(),
  message: z.string(),
});
export type PackageFinding = z.infer<typeof packageFindingSchema>;

/** Yüklenen arşivin reddedilme nedeni; `package_invalid` hatasının ayrıntısında listelenir. */
export const packageProblemSchema = z.object({
  file: z.string().nullable(),
  message: z.string(),
});
export type PackageProblem = z.infer<typeof packageProblemSchema>;

/** Bir sürümün önceki onaylı sürüme göre farkı. İnceleyen, neyin değiştiğine buradan bakar. */
export const packageDiffSchema = z.object({
  base: versionSchema,
  files: z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
    changed: z.array(z.string()),
    unchanged: z.number().int(),
  }),
  permissions: z.object({
    added: z.array(capabilitySchema),
    removed: z.array(capabilitySchema),
  }),
  network: z.object({ added: z.array(z.string()), removed: z.array(z.string()) }),
  /** Ayar alanlarının anahtarları. */
  configFields: z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
    changed: z.array(z.string()),
  }),
  entryChanged: z.boolean(),
  sizeDelta: z.number().int(),
});
export type PackageDiff = z.infer<typeof packageDiffSchema>;

// -- Yönetim ------------------------------------------------------------------

export const packageFileSchema = z.object({
  path: z.string(),
  sha256: z.string(),
  size: z.number().int(),
  contentType: z.string(),
});
export type PackageFile = z.infer<typeof packageFileSchema>;

export const adminPackageVersionSummarySchema = z.object({
  packageId: packageIdSchema,
  version: versionSchema,
  /** Paketin bu sürümdeki bildirim dosyasında yazan adı. */
  name: z.string(),
  status: packageVersionStatusSchema,
  /** Sürümün içerik özeti (SHA-256, onaltılık). */
  digest: z.string(),
  sizeBytes: z.number().int(),
  fileCount: z.number().int(),
  permissions: z.array(capabilitySchema),
  network: z.array(z.string()),
  findingCounts: z.object({
    blocked: z.number().int(),
    review: z.number().int(),
    info: z.number().int(),
  }),
  uploadedBy: actorSchema,
  createdAt: timestampSchema,
  /**
   * İncelemeye gönderen. 2.4'ten önce gönderilmiş sürümlerde `null`: böyle bir sürüm onaylanmadan
   * önce bir hesap tarafından yeniden incelemeye gönderilir.
   */
  submittedBy: actorSchema.nullable(),
  submittedAt: timestampSchema.nullable(),
  /** Son kararı (onay, ret ya da geri çekme) veren, kararın zamanı ve gerekçesi. */
  reviewedBy: actorSchema.nullable(),
  reviewedAt: timestampSchema.nullable(),
  reviewNote: z.string().nullable(),
});
export type AdminPackageVersionSummary = z.infer<typeof adminPackageVersionSummarySchema>;

export const adminPackageVersionSchema = adminPackageVersionSummarySchema.extend({
  entry: z.string(),
  icon: z.string().nullable(),
  configFields: z.array(configFieldSchema),
  files: z.array(packageFileSchema),
  findings: z.array(packageFindingSchema),
  /** Önceki onaylı sürüme göre fark; karşılaştırılacak onaylı sürüm yoksa `null`. */
  diff: packageDiffSchema.nullable(),
  /** Bu sürümü yayınlayan uygulama kayıtları. */
  usedBy: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type AdminPackageVersion = z.infer<typeof adminPackageVersionSchema>;

export const adminPackageSchema = z.object({
  id: packageIdSchema,
  name: z.string(),
  developerName: z.string(),
  /** En yeni sürüm başta. */
  versions: z.array(adminPackageVersionSummarySchema),
  /** Bu paketin bir sürümünü yayınlayan uygulama kaydı sayısı. */
  appCount: z.number().int(),
  createdAt: timestampSchema,
});
export type AdminPackage = z.infer<typeof adminPackageSchema>;

export const adminSavePackageBodySchema = z.object({
  name: z.string().trim().min(2).max(60),
  developerName: z.string().trim().min(2).max(80),
});
export type AdminSavePackageBody = z.infer<typeof adminSavePackageBodySchema>;

const reviewNoteSchema = z.string().trim().min(3).max(500);

/** Onay kararı; not isteğe bağlıdır. */
export const adminApproveBodySchema = z.object({ note: reviewNoteSchema.optional() });
export type AdminApproveBody = z.infer<typeof adminApproveBodySchema>;

/** Ret kararı; gerekçe zorunludur ve yükleyene gösterilir. */
export const adminReviewBodySchema = z.object({ note: reviewNoteSchema });
export type AdminReviewBody = z.infer<typeof adminReviewBodySchema>;

/**
 * Onaylı sürümü geri çeker; sürümü yayınlayan uygulama kayıtları kullanıcılara kapanır.
 * `rollback` verilirse bu kayıtlar, varsa bir önceki yayınlarına döndürülür.
 */
export const adminRevokeBodySchema = adminReviewBodySchema.extend({
  rollback: z.boolean().optional(),
});
export type AdminRevokeBody = z.infer<typeof adminRevokeBodySchema>;

/** Bir sürümün, paketin daha eski sürümlerini yayınlayan kayıtlara toplu dağıtımının sonucu. */
export const adminRolloutResultSchema = z.object({
  /** Yeni sürüme geçen uygulama kayıtları. */
  published: z.array(z.string()),
  /** Ayarları yeni sürümün beklediği alanlarla eşleşmediği için geçirilemeyen kayıtlar. */
  skipped: z.array(
    z.object({ id: z.string(), name: z.string(), problems: z.array(configProblemSchema) }),
  ),
});
export type AdminRolloutResult = z.infer<typeof adminRolloutResultSchema>;

/** İnceleyenin açtığı dosyanın içeriği. Metin olmayan ya da çok büyük dosyalarda `text` boştur. */
export const packageFileContentSchema = packageFileSchema.extend({
  text: z.string().nullable(),
});
export type PackageFileContent = z.infer<typeof packageFileContentSchema>;
