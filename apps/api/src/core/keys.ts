import { createHmac } from "node:crypto";

import { safeEqual } from "./security";

/**
 * VADO'nun imza anahtarları. Üç bağımsız aile vardır; birinin değişmesi diğerlerini etkilemez:
 *
 * - OTP: doğrulama kodlarının özeti. Halka; gerektiğinde değiştirilir.
 * - QR: QR kodlarının imzası. Halka; kod, imzalayan anahtarın kimliğini taşır.
 * - OpenID: mini uygulamalara verilen takma kimlik. Tek ve uzun ömürlü anahtar; değişirse tüm
 *   kimlikler değişir.
 *
 * Kurulum, eski sistemden geçiş ve anahtar değiştirme adımları docs/ANAHTARLAR.md belgesindedir.
 */

/** Anahtarların en kısa uzunluğu: 256 bit. */
export const KEY_BYTES = 32;
/**
 * Rastgele üretilmiş 32 baytta ortalama 30 farklı bayt bulunur. Elle yazılmış ya da yinelenen bir
 * desenden oluşan değerlerde bu sayı çok düşüktür; öyle bir anahtar kabul edilmez.
 */
const MIN_DISTINCT_BYTES = 16;
const KEY_ID = /^[a-z0-9][a-z0-9-]{0,15}$/;
const HEX = /^(?:[0-9a-f]{2})+$/i;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Anahtar kimliği taşımayan imzaları doğrulayan anahtarın ayrılmış kimliği. 2.1 ve öncesinde
 * üretilmiş QR kodları ve doğrulama kodu özetleri kimlik taşımaz; halkada bu kimlikle bir anahtar
 * varsa onunla doğrulanır.
 */
export const LEGACY_KEY_ID = "legacy";

const DEV_KEY_ID = "dev";
const DEV_APP_SECRET = "vado-development-secret-not-for-production";

const PURPOSES = ["otp", "qr", "openid"] as const;
type Purpose = (typeof PURPOSES)[number];

/** Halkadaki tek anahtar. Ortam değişkeninde `kimlik:anahtar` ya da `kimlik:anahtar:YYYY-AA-GG`. */
export interface KeyEntry {
  /** İmzanın içinde taşınan kimlik. Bir kez kullanılan kimlik başka bir anahtara verilmez. */
  id: string;
  key: Buffer;
  /**
   * Anahtarın doğrulamada geçerli olduğu son gün (UTC, gün sonuna kadar); `null` ise anahtar
   * halkadan çıkarılana kadar geçerlidir. İmzalayan anahtarda bulunmaz.
   */
  validThrough: string | null;
}

/** Üç anahtar ailesinin yapılandırmadan okunmuş hali. */
export interface KeyConfig {
  otp: KeyEntry[];
  qr: KeyEntry[];
  openId: Buffer;
}

/** Anahtarların okunduğu ortam değişkenleri. */
export interface KeyEnv {
  VADO_OTP_KEYS?: string | undefined;
  VADO_QR_KEYS?: string | undefined;
  VADO_OPENID_KEY?: string | undefined;
  /** 2.1 ve öncesinin tek ana anahtarı. Yalnızca geçişte ve geliştirmede okunur. */
  VADO_APP_SECRET?: string | undefined;
}

/** İmzayı doğrulayan anahtar. */
export interface VerifiedKey {
  keyId: string;
  /** İmza, halkanın güncel (imzalayan) anahtarıyla mı atılmış? */
  current: boolean;
}

/** Sürümlü anahtar halkası: ilk anahtar imzalar, diğerleri yalnızca eski imzaları doğrular. */
export interface Keyring {
  /** Değeri güncel anahtarla imzalar. Sonuç `<anahtar kimliği>.<imza>` biçimindedir. */
  sign: (value: string) => string;
  /**
   * İmzayı, taşıdığı kimliğin gösterdiği anahtarla doğrular. Kimlik halkada yoksa, anahtarın
   * süresi dolmuşsa ya da imza tutmuyorsa `null` döner.
   */
  verify: (value: string, signature: string) => VerifiedKey | null;
}

export interface AppKeys {
  otp: Keyring;
  qr: Keyring;
  /** Kullanıcının bir mini uygulamaya özgü, geri çevrilemeyen takma kimliğini türetir. */
  openId: (miniAppId: string, userId: string) => string;
}

const mac = (key: Buffer, value: string) =>
  createHmac("sha256", key).update(value).digest("base64url");

/** Değişken tanımlı ve dolu mu? Boş bırakılmış değişken tanımsız sayılır. */
export const isPresent = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "";

/** Günün bittiği an (UTC). Değer geçerli bir takvim günü değilse `NaN` döner. */
function endOfDay(day: string): number {
  const match = DAY.exec(day);
  if (match === null) return Number.NaN;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const start = new Date(Date.UTC(year, month - 1, date));
  const exists =
    start.getUTCFullYear() === year &&
    start.getUTCMonth() === month - 1 &&
    start.getUTCDate() === date;
  return exists ? start.getTime() + DAY_MS : Number.NaN;
}

/** Metin `YYYY-AA-GG` biçiminde, takvimde var olan bir gün mü? */
export function isDay(text: string): boolean {
  return !Number.isNaN(endOfDay(text));
}

/** Anahtarın doğrulamada geçerliliğini yitirdiği an; süresiz anahtarda sonsuz. */
export function expiryOf(entry: KeyEntry): number {
  return entry.validThrough === null ? Number.POSITIVE_INFINITY : endOfDay(entry.validThrough);
}

function keyProblem(key: Buffer): string | null {
  if (key.length < KEY_BYTES) {
    return `anahtar en az ${KEY_BYTES * 2} hex karakter (256 bit) olmalıdır`;
  }
  if (new Set(key).size < MIN_DISTINCT_BYTES) {
    return "anahtar rastgele üretilmiş görünmüyor; `openssl rand -hex 32` ile üretin";
  }
  return null;
}

/** Halkanın kurallarını denetler ve bulduğu sorunları döndürür. İletilere anahtar yazılmaz. */
export function keyringProblems(entries: readonly KeyEntry[]): string[] {
  const [current] = entries;
  if (current === undefined) return ["en az bir anahtar gerekir"];

  const problems: string[] = [];
  if (current.id === LEGACY_KEY_ID) {
    problems.push(`"${LEGACY_KEY_ID}" anahtarı yalnızca eski imzaları doğrular; ilk sırada olamaz`);
  }
  if (current.validThrough !== null) {
    problems.push("ilk anahtar imzalar; son geçerlilik günü taşıyamaz");
  }
  for (const [index, entry] of entries.entries()) {
    const earlier = entries.slice(0, index);
    // Kimlik yerine yanlışlıkla anahtarın kendisi yazılmış olabilir; geçersiz kimlik iletiye girmez.
    const validId = KEY_ID.test(entry.id);
    const label = validId ? `"${entry.id}" anahtarı` : `${index + 1}. anahtar`;
    if (!validId) {
      problems.push(`${label}: kimlik küçük harf, rakam ve tireden oluşur; en çok 16 karakterdir`);
    }
    const weakness = keyProblem(entry.key);
    if (weakness !== null) problems.push(`${label}: ${weakness}`);
    if (Number.isNaN(expiryOf(entry))) {
      problems.push(
        `${label}: son geçerlilik günü YYYY-AA-GG biçiminde geçerli bir tarih olmalıdır`,
      );
    }
    if (validId && earlier.some((other) => other.id === entry.id)) {
      problems.push(`${label}: kimlik halkada birden çok kez geçiyor`);
    }
    if (earlier.some((other) => other.key.equals(entry.key))) {
      problems.push(`${label}: aynı anahtar halkada daha önce de geçiyor`);
    }
  }
  return problems;
}

export function createKeyring(entries: readonly KeyEntry[], now: () => number = Date.now): Keyring {
  const problems = keyringProblems(entries);
  const [current] = entries;
  if (current === undefined || problems.length > 0) {
    throw new Error(`Anahtar halkası geçersiz: ${problems.join("; ")}`);
  }
  const verifiers = new Map(
    entries.map((entry) => [entry.id, { key: entry.key, expiresAt: expiryOf(entry) }]),
  );

  return {
    sign: (value) => `${current.id}.${mac(current.key, value)}`,
    verify(value, signature) {
      // Kimlik taşımayan imza eski sistemindir. "legacy" kimliği imzanın içinde yazılı gelemez:
      // aynı imzanın iki ayrı yazımı olmamalıdır.
      const separator = signature.indexOf(".");
      const keyId = separator === -1 ? LEGACY_KEY_ID : signature.slice(0, separator);
      if (separator !== -1 && keyId === LEGACY_KEY_ID) return null;

      const verifier = verifiers.get(keyId);
      // "Süresi dolmadı mı" diye sorulur: geçersiz bir tarih (NaN) anahtarı açık bırakmaz.
      if (verifier === undefined || !(now() < verifier.expiresAt)) return null;
      return safeEqual(mac(verifier.key, value), signature.slice(separator + 1))
        ? { keyId, current: keyId === current.id }
        : null;
    },
  };
}

export function createAppKeys(config: KeyConfig): AppKeys {
  return {
    otp: createKeyring(config.otp),
    qr: createKeyring(config.qr),
    openId: (miniAppId, userId) => mac(config.openId, `${miniAppId}:${userId}`),
  };
}

/**
 * 2.1 ve öncesinde tek bir ana anahtar (`VADO_APP_SECRET`) vardı ve her amaç ondan türetilen bir
 * anahtarla imzalanırdı. Bu işlev o türetmeyi yineler: geçişte mini uygulama kimliklerini ve
 * basılmış QR kodlarını korumak için, geliştirmede ise ayarsız çalışmak için kullanılır.
 */
export function legacyKey(appSecret: string, purpose: Purpose): Buffer {
  return createHmac("sha256", appSecret).update(`vado:${purpose}`).digest();
}

/**
 * Anahtar halkasını (`VADO_OTP_KEYS`, `VADO_QR_KEYS`) çözümler. Biçim: virgülle ayrılmış
 * `kimlik:anahtar` ya da `kimlik:anahtar:YYYY-AA-GG`. Sorun varsa halka boş döner.
 */
export function parseKeyring(text: string): { entries: KeyEntry[]; problems: string[] } {
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

  const entries: KeyEntry[] = [];
  const problems: string[] = [];
  for (const [index, part] of parts.entries()) {
    const [id = "", hex = "", validThrough = null, ...rest] = part.split(":");
    if (hex === "" || rest.length > 0) {
      problems.push(
        `${index + 1}. anahtar: biçim "kimlik:anahtar" ya da "kimlik:anahtar:YYYY-AA-GG" olmalıdır`,
      );
    } else if (!HEX.test(hex)) {
      problems.push(`${index + 1}. anahtar: anahtar onaltılık (hex) yazılmalıdır`);
    } else {
      entries.push({ id, key: Buffer.from(hex, "hex"), validThrough });
    }
  }
  if (problems.length === 0) problems.push(...keyringProblems(entries));
  return problems.length === 0 ? { entries, problems } : { entries: [], problems };
}

/** Halkayı ortam değişkenine yazılacak biçime çevirir. */
export function formatKeyring(entries: readonly KeyEntry[]): string {
  return entries
    .map(({ id, key, validThrough }) =>
      [id, key.toString("hex"), ...(validThrough === null ? [] : [validThrough])].join(":"),
    )
    .join(",");
}

function parseKey(text: string): { key: Buffer | null; problems: string[] } {
  const hex = text.trim();
  if (!HEX.test(hex)) return { key: null, problems: ["anahtar onaltılık (hex) yazılmalıdır"] };
  const key = Buffer.from(hex, "hex");
  const weakness = keyProblem(key);
  return weakness === null ? { key, problems: [] } : { key: null, problems: [weakness] };
}

/**
 * Eski ana anahtar hâlâ tanımlıyken yeni anahtarların onunla uyumunu denetler. Geçişte anahtarlar
 * yanlışlıkla sıfırdan üretilirse sistem sorunsuz açılır ama mini uygulamaların tanıdığı kimlikler
 * ve basılmış QR kodları sessizce geçersiz kalır; bu denetim onu başlangıçta yakalar.
 */
function migrationProblems(appSecret: string, keys: KeyConfig): string[] {
  const problems: string[] = [];
  const deliberate = "Bilerek yapıyorsanız VADO_APP_SECRET değişkenini kaldırın.";
  if (!keys.openId.equals(legacyKey(appSecret, "openid"))) {
    problems.push(
      "VADO_OPENID_KEY, VADO_APP_SECRET ile kullanılan anahtar değil: mini uygulamaların gördüğü " +
        `kullanıcı kimlikleri değişir. Geçişte \`keys migrate\` çıktısını kullanın. ${deliberate}`,
    );
  }
  const legacy = legacyKey(appSecret, "qr");
  if (!keys.qr.some((entry) => entry.id === LEGACY_KEY_ID && entry.key.equals(legacy))) {
    problems.push(
      `VADO_QR_KEYS içinde VADO_APP_SECRET ile imzalanmış kodları doğrulayan "${LEGACY_KEY_ID}" ` +
        "anahtarı yok: basılmış QR kodları geçersiz olur. Geçişte `keys migrate` çıktısını " +
        `kullanın. ${deliberate}`,
    );
  }
  return problems;
}

/**
 * Anahtarları ortam değişkenlerinden okur; sorunları `problems` listesine ekler ve sorun varsa
 * `null` döner.
 *
 * Canlı ortamda üç değişken de açıkça tanımlanmalıdır. Geliştirmede ve testte tanımlanmayanlar eski
 * ana anahtardan (`VADO_APP_SECRET`, o da yoksa sabit geliştirme değeri) türetilir: kurulum ayarsız
 * çalışır ve önceki sürümle üretilmiş mini uygulama kimlikleri değişmez.
 */
export function loadKeyConfig(
  env: KeyEnv,
  production: boolean,
  problems: string[],
): KeyConfig | null {
  const found: string[] = [];
  const missing: string[] = [];
  const appSecret = isPresent(env.VADO_APP_SECRET) ? env.VADO_APP_SECRET : null;
  const derived = (purpose: Purpose) => legacyKey(appSecret ?? DEV_APP_SECRET, purpose);

  const readRing = (name: "VADO_OTP_KEYS" | "VADO_QR_KEYS", purpose: Purpose): KeyEntry[] => {
    const text = env[name];
    if (isPresent(text)) {
      const ring = parseKeyring(text);
      found.push(...ring.problems.map((problem) => `${name}: ${problem}`));
      return ring.entries;
    }
    if (production) {
      missing.push(name);
      return [];
    }
    return [{ id: DEV_KEY_ID, key: derived(purpose), validThrough: null }];
  };
  const readOpenId = (): Buffer | null => {
    const text = env.VADO_OPENID_KEY;
    if (isPresent(text)) {
      const parsed = parseKey(text);
      found.push(...parsed.problems.map((problem) => `VADO_OPENID_KEY: ${problem}`));
      return parsed.key;
    }
    if (production) {
      missing.push("VADO_OPENID_KEY");
      return null;
    }
    return derived("openid");
  };

  const otp = readRing("VADO_OTP_KEYS", "otp");
  const qr = readRing("VADO_QR_KEYS", "qr");
  const openId = readOpenId();
  if (missing.length > 0) {
    found.push(
      `${missing.join(", ")} tanımlı değil. Yeni kurulumda \`keys generate\`, 2.1 ve öncesinden ` +
        "yükseltmede `keys migrate` çıktısını kullanın (bkz. docs/ANAHTARLAR.md)",
    );
  }
  if (openId === null || found.length > 0) {
    problems.push(...found);
    return null;
  }
  const keys: KeyConfig = { otp, qr, openId };

  const developmentKeys = PURPOSES.map((purpose) => legacyKey(DEV_APP_SECRET, purpose));
  const labelled = [
    ...otp.map((entry) => ({ label: `VADO_OTP_KEYS "${entry.id}"`, key: entry.key })),
    ...qr.map((entry) => ({ label: `VADO_QR_KEYS "${entry.id}"`, key: entry.key })),
    { label: "VADO_OPENID_KEY", key: openId },
  ];
  for (const [index, { label, key }] of labelled.entries()) {
    // Aynı halkadaki yinelenmeyi halkanın kendi denetimi yakalar; buraya ulaşan, aileler arasıdır.
    const shared = labelled.slice(0, index).find((other) => other.key.equals(key));
    if (shared !== undefined) {
      found.push(`${label} ile ${shared.label} aynı anahtar; her ailenin anahtarı ayrı olmalıdır`);
    }
    if (production && developmentKeys.some((development) => development.equals(key))) {
      found.push(`${label}: geliştirme anahtarı canlı ortamda kullanılamaz`);
    }
  }
  if (production && appSecret !== null) found.push(...migrationProblems(appSecret, keys));

  problems.push(...found);
  return found.length === 0 ? keys : null;
}
