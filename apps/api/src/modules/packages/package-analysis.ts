import {
  PACKAGE_SIZE_NOTICE_BYTES,
  type PackageFinding,
  type PackageFindingLevel,
  type PackageManifest,
} from "@vado/contracts";

/**
 * Yüklenen paketin otomatik incelemesi. Bulgular inceleyene yol gösterir; güvence değildir.
 * Güvenceyi, paket sunulurken gönderilen güvenlik politikası, sarmalayıcı belge ve kabuktaki
 * gezinme kilidi sağlar: burada `blocked` diye işaretlenen her şey, bulgu gözden kaçsa da çalışma
 * anında engellenir. `review` bulguları inceleyenin karar vermesi gerekenlerdir; aralarında
 * çalışma anında engellenemeyen tek kullanım WebRTC'dir (bkz. `peer_connection`).
 */

export interface AnalyzedFile {
  path: string;
  data: Buffer;
}

interface Rule {
  code: string;
  level: PackageFindingLevel;
  pattern: RegExp;
  message: string;
}

const FINDINGS_MAX = 100;
const OCCURRENCES_MAX = 99;
/** Bu boyutun üzerindeki dosyalar taranmaz; paket sınırı zaten bunun altındadır. */
const SCAN_MAX_BYTES = 8 * 1024 * 1024;
const EXCERPT_BEFORE = 24;
const EXCERPT_AFTER = 56;

const SCRIPT_EXTENSIONS = new Set(["js", "mjs"]);
const MARKUP_EXTENSIONS = new Set(["html", "svg"]);
const STYLE_EXTENSIONS = new Set(["css"]);

const NAVIGATION_MESSAGE =
  "Sayfa başka bir adrese götürülüyor ya da yeniden yükleniyor olabilir. Mini uygulama açıldığı " +
  "belgeden ayrılamaz; denerse kapatılır.";

/** Betik dosyalarında aranan kalıplar. Hiçbirinde iç içe yineleme yoktur; tarama doğrusaldır. */
const SCRIPT_RULES: Rule[] = [
  {
    code: "dynamic_code",
    level: "blocked",
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(\s*["'`]/g,
    message: "Metinden kod çalıştırma (eval, new Function) engellenir.",
  },
  {
    code: "web_storage",
    level: "blocked",
    pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b|\bdocument\.cookie\b/g,
    message:
      "Tarayıcı deposu ve çerezler kum havuzunda kullanılamaz; veri için vado.storage kullanılmalı.",
  },
  {
    code: "worker",
    level: "blocked",
    pattern: /\bnavigator\.serviceWorker\b|\bnew\s+(?:Shared)?Worker\s*\(/g,
    message: "Arka plan çalışanları (Worker, Service Worker) engellenir.",
  },
  {
    code: "wasm",
    level: "blocked",
    pattern: /\bWebAssembly\b/g,
    message: "WebAssembly engellenir.",
  },
  {
    code: "popup",
    level: "blocked",
    pattern: /\bwindow\.open\s*\(/g,
    message: "Yeni pencere açılamaz.",
  },
  {
    code: "remote_script",
    level: "blocked",
    pattern: /\bimport\s*\(\s*["'`](?:https?:)?\/\//g,
    message: "Başka sunucudan kod yüklenemez; paket yalnızca kendi dosyalarını çalıştırır.",
  },
  {
    code: "navigation",
    level: "review",
    pattern:
      /\b(?:top|parent|window|document|self)\.location\s*=[^=]|\blocation\.(?:href\s*=[^=]|assign\s*\(|replace\s*\(|reload\s*\()/g,
    message: NAVIGATION_MESSAGE,
  },
  {
    code: "peer_connection",
    level: "review",
    pattern: /\b(?:webkit|moz)?RTCPeerConnection\b|\bRTCDataChannel\b/g,
    message:
      "WebRTC bağlantısı kuruluyor olabilir. Tarayıcılar bu bağlantıları güvenlik politikasıyla " +
      "sınırlamaz: paket, bildirmediği bir adrese veri gönderebilir. Gerekçesi açık değilse " +
      "sürüm onaylanmamalı.",
  },
];

interface TagRule {
  code: string;
  level: PackageFindingLevel;
  matches: (name: string, attributes: string) => boolean;
  message: string;
}

/** Etiketin niteliklerinde `ad=` ile başlayan bölümü yakalar; değer en çok 300 karaktere bakılır. */
const ATTRIBUTES = {
  src: /(?:^|\s)src\s*=\s*(.{0,300})/is,
  href: /(?:^|\s)href\s*=\s*(.{0,300})/is,
  action: /(?:^|\s)action\s*=\s*(.{0,300})/is,
};
const REMOTE_URL = /^["']?\s*(?:https?:)?\/\//i;
const DATA_BLOCK = /(?:^|\s)type\s*=\s*["']?application\/(?:ld\+)?json/i;
const META_REFRESH = /(?:^|\s)http-equiv\s*=\s*["']?refresh/i;
const INLINE_HANDLER = /\son[a-z]+\s*=/i;
const FRAME_TAGS = new Set(["iframe", "frame", "object", "embed", "base"]);

const attribute = (attributes: string, name: keyof typeof ATTRIBUTES): string | null =>
  ATTRIBUTES[name].exec(attributes)?.[1] ?? null;
const isRemote = (value: string | null) => value !== null && REMOTE_URL.test(value);

/** HTML ve SVG dosyalarındaki etiketlerde aranan kalıplar. */
const TAG_RULES: TagRule[] = [
  {
    code: "inline_script",
    level: "blocked",
    matches: (name, attributes) =>
      name === "script" && attribute(attributes, "src") === null && !DATA_BLOCK.test(attributes),
    message: "Satır içi betik çalışmaz; kod ayrı bir .js dosyasına taşınmalı.",
  },
  {
    code: "remote_script",
    level: "blocked",
    matches: (name, attributes) => name === "script" && isRemote(attribute(attributes, "src")),
    message: "Başka sunucudan kod yüklenemez; paket yalnızca kendi dosyalarını çalıştırır.",
  },
  {
    code: "remote_resource",
    level: "blocked",
    matches: (name, attributes) => name === "link" && isRemote(attribute(attributes, "href")),
    message: "Başka sunucudan stil ya da yazı tipi yüklenemez; dosyalar pakete eklenmeli.",
  },
  {
    code: "inline_handler",
    level: "blocked",
    matches: (_name, attributes) => INLINE_HANDLER.test(attributes),
    message: "Etiket içine yazılan olay işleyicileri (onclick=…) çalışmaz.",
  },
  {
    code: "embedded_frame",
    level: "blocked",
    matches: (name) => FRAME_TAGS.has(name),
    message: "Çerçeve, gömülü nesne ve <base> etiketi engellenir.",
  },
  {
    code: "form_action",
    level: "blocked",
    matches: (name, attributes) => name === "form" && attribute(attributes, "action") !== null,
    message: "Form bir adrese gönderilemez; gönderim kodla ele alınmalı.",
  },
  {
    code: "navigation",
    level: "review",
    matches: (name, attributes) => name === "meta" && META_REFRESH.test(attributes),
    message: NAVIGATION_MESSAGE,
  },
];

/** Etiket adı ve nitelikleri. Nitelik uzunluğu sınırlıdır; tarama doğrusal kalır. */
const TAG = /<([a-z][a-z0-9-]{0,30})\b([^<>]{0,4000})>/gi;
const JAVASCRIPT_URL = /\bjavascript\s*:/gi;
const ABSOLUTE_URL = /\b(https?|wss?):\/\/([a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)(:\d{1,5})?/gi;
/** XML ad alanları adres gibi görünür ama bağlantı kurulmaz. */
const NAMESPACE_HOSTS = new Set(["www.w3.org"]);

function extensionOf(path: string): string {
  return path.slice(path.lastIndexOf(".") + 1).toLowerCase();
}

/** Eşleşmenin çevresinden, inceleyene gösterilecek kısa bir alıntı. */
function excerpt(text: string, index: number): string {
  return text
    .slice(Math.max(0, index - EXCERPT_BEFORE), index + EXCERPT_AFTER)
    .replace(/[\p{Cc}\s]+/gu, " ")
    .trim();
}

function describe(message: string, count: number, sample: string): string {
  if (count === 1) return `${message} Geçtiği yer: «${sample}»`;
  const places = count > OCCURRENCES_MAX ? `${OCCURRENCES_MAX}+` : String(count);
  return `${message} ${places} yerde geçiyor; ilki: «${sample}»`;
}

function scanScript(path: string, text: string): PackageFinding[] {
  return SCRIPT_RULES.flatMap((rule) => {
    const matches = [...text.matchAll(rule.pattern)];
    const first = matches[0];
    if (first === undefined) return [];
    const message = describe(rule.message, matches.length, excerpt(text, first.index));
    return [{ level: rule.level, code: rule.code, file: path, message }];
  });
}

function scanMarkup(path: string, text: string): PackageFinding[] {
  const hits = new Map<TagRule, { count: number; sample: string }>();
  for (const tag of text.matchAll(TAG)) {
    const name = (tag[1] ?? "").toLowerCase();
    const attributes = tag[2] ?? "";
    for (const rule of TAG_RULES) {
      if (!rule.matches(name, attributes)) continue;
      const hit = hits.get(rule);
      if (hit === undefined) hits.set(rule, { count: 1, sample: excerpt(text, tag.index) });
      else hit.count += 1;
    }
  }
  const findings: PackageFinding[] = [...hits].map(([rule, hit]) => ({
    level: rule.level,
    code: rule.code,
    file: path,
    message: describe(rule.message, hit.count, hit.sample),
  }));

  const urls = [...text.matchAll(JAVASCRIPT_URL)];
  const first = urls[0];
  if (first !== undefined) {
    findings.push({
      level: "blocked",
      code: "javascript_url",
      file: path,
      message: describe("javascript: adresleri çalışmaz.", urls.length, excerpt(text, first.index)),
    });
  }
  return findings;
}

/** Dosyada geçen adreslerin kaynakları (şema + alan adı + port). */
function originsIn(text: string): Set<string> {
  const origins = new Set<string>();
  for (const match of text.matchAll(ABSOLUTE_URL)) {
    const host = (match[2] ?? "").toLowerCase();
    if (NAMESPACE_HOSTS.has(host)) continue;
    origins.add(`${(match[1] ?? "").toLowerCase()}://${host}${match[3] ?? ""}`);
  }
  return origins;
}

const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1).replace(".", ",");

export function analyzePackage(
  manifest: PackageManifest,
  files: readonly AnalyzedFile[],
): PackageFinding[] {
  const findings: PackageFinding[] = [];
  /** Bildirilmemiş adres → ilk geçtiği dosya. */
  const undeclared = new Map<string, string>();
  const declared = new Set(manifest.network);

  for (const file of files) {
    const extension = extensionOf(file.path);
    const scannable =
      SCRIPT_EXTENSIONS.has(extension) ||
      MARKUP_EXTENSIONS.has(extension) ||
      STYLE_EXTENSIONS.has(extension);
    if (!scannable || file.data.length > SCAN_MAX_BYTES) continue;

    const text = file.data.toString("utf8");
    if (SCRIPT_EXTENSIONS.has(extension)) findings.push(...scanScript(file.path, text));
    if (MARKUP_EXTENSIONS.has(extension)) findings.push(...scanMarkup(file.path, text));
    for (const origin of originsIn(text)) {
      if (!declared.has(origin) && !undeclared.has(origin)) undeclared.set(origin, file.path);
    }
  }

  for (const [origin, path] of undeclared) {
    findings.push({
      level: "info",
      code: "undeclared_host",
      file: path,
      message: `Kodda geçen ${origin} adresi bildirim dosyasında yok; bu adrese bağlantı kurulamaz.`,
    });
  }

  const maps = files.filter((file) => extensionOf(file.path) === "map");
  if (maps.length > 0) {
    findings.push({
      level: "info",
      code: "source_map",
      file: maps[0]?.path ?? null,
      message: `Pakette ${maps.length} kaynak haritası (.map) var; boyutu artırır ve kaynak kodu açık eder.`,
    });
  }

  const total = files.reduce((sum, file) => sum + file.data.length, 0);
  if (total > PACKAGE_SIZE_NOTICE_BYTES) {
    findings.push({
      level: "info",
      code: "large_package",
      file: null,
      message: `Paket açıldığında ${megabytes(total)} MB tutuyor; yavaş bağlantıda açılış süresi uzar.`,
    });
  }

  const order: PackageFindingLevel[] = ["blocked", "review", "info"];
  return findings
    .sort((left, right) => order.indexOf(left.level) - order.indexOf(right.level))
    .slice(0, FINDINGS_MAX);
}
