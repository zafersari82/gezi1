import { parseArgs } from "node:util";

import { StartupError } from "../core/errors";
import {
  describeKeyring,
  generateKeys,
  type KeyStatus,
  migrateKeys,
  rotateKeyring,
  toKeyEnv,
  utcDay,
} from "../core/key-management";
import {
  DAY_MS,
  formatKeyring,
  isDay,
  isPresent,
  type KeyEnv,
  keyringProblems,
  loadKeyConfig,
  parseKeyring,
} from "../core/keys";

/**
 * `keys` komutunun işi: anahtar üretir, eski sistemden geçirir, döndürür ve denetler. Komutlar
 * hiçbir dosyayı değiştirmez ve veritabanına bağlanmaz; ürettikleri satırlar `.env` dosyasına elle
 * yazılır. Adımların anlatımı docs/ANAHTARLAR.md belgesindedir.
 */
const USAGE = `Kullanım:
  keys generate               Yeni kurulum için anahtar üretir.
  keys migrate                VADO_APP_SECRET kullanan kurulumu (2.1 ve öncesi) yeni anahtarlara geçirir.
  keys rotate <otp|qr>        Halkaya yeni bir imza anahtarı ekler; eskisi doğrulamayı sürdürür.
      --until YYYY-AA-GG      Eski anahtar bu günün sonuna (UTC) kadar doğrular.
      --drop-old              Eski anahtarlar hemen çıkarılır (anahtar sızdıysa).
  keys check                  Tanımlı anahtarları canlı ortam kurallarıyla denetler ve özetler.

  --from <dosya>              Değişkenler ortam yerine bu dosyadan okunur ("-": standart girdi).

Komutlar dosya değiştirmez; çıktıdaki satırları .env dosyasına siz yazarsınız.
Ayrıntılar: docs/ANAHTARLAR.md`;

const RINGS = { otp: "VADO_OTP_KEYS", qr: "VADO_QR_KEYS" } as const;
type Family = keyof typeof RINGS;
const isFamily = (value: string | undefined): value is Family =>
  value !== undefined && Object.hasOwn(RINGS, value);

/** Eski anahtarlar hemen çıkarılınca ne olur? */
const DROP_CONSEQUENCE: Record<Family, string> = {
  otp: "yoldaki doğrulama kodları geçersiz olur; kullanıcılar yeni kod ister.",
  qr: "bu ana kadar üretilmiş tüm QR kodları geçersiz olur; basılmış kodlar yeniden alınmalıdır.",
};

const KEY_VARIABLES = [RINGS.otp, RINGS.qr, "VADO_OPENID_KEY"] as const;
const definedKeys = (env: KeyEnv) => KEY_VARIABLES.filter((name) => isPresent(env[name]));

interface Arguments {
  positionals: string[];
  from: string | undefined;
  until: string | undefined;
  dropOld: boolean;
}

function readArguments(args: string[]): Arguments {
  try {
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        from: { type: "string" },
        until: { type: "string" },
        "drop-old": { type: "boolean", default: false },
      },
    });
    return {
      positionals,
      from: values.from,
      until: values.until,
      dropOld: values["drop-old"],
    };
  } catch {
    throw new StartupError(USAGE);
  }
}

/** Değişkenleri ortamdan ya da verilen dosyadan okur. */
export type ReadKeyEnv = (file: string | undefined) => KeyEnv;

const fail = (title: string, problems: string[]) =>
  new StartupError(`${title}\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);

/** Üretilen anahtarların canlı ortamda kabul edileceğini, yazdırmadan önce doğrular. */
function ensureAccepted(env: KeyEnv): void {
  const problems: string[] = [];
  if (loadKeyConfig(env, true, problems) === null) throw fail("Anahtarlar üretilemedi:", problems);
}

function describeStatus({ role, validThrough, expired }: KeyStatus): string {
  if (role === "signs") return "imzalar";
  if (validThrough === null) return "halkadan çıkarılana kadar doğrular";
  return expired
    ? `süresi ${validThrough} günü doldu; halkadan çıkarılabilir`
    : `${validThrough} gününün sonuna kadar (UTC) doğrular`;
}

function generate(env: KeyEnv): string[] {
  if (isPresent(env.VADO_APP_SECRET)) {
    throw new StartupError(
      "VADO_APP_SECRET tanımlı: bu kurulum eski anahtarı kullanıyor. Mini uygulama kimliklerini " +
        "ve basılmış QR kodlarını korumak için `keys migrate` kullanın.",
    );
  }
  const defined = definedKeys(env);
  if (defined.length > 0) {
    throw new StartupError(
      `Anahtarlar zaten tanımlı (${defined.join(", ")}). Yeniden üretmek mini uygulama ` +
        "kimliklerini değiştirir ve tüm QR kodlarını geçersiz kılar. Tek bir aileyi değiştirmek " +
        "için `keys rotate`, bilerek sıfırdan üretmek için bu değişkenlerin tanımlı olmadığı bir " +
        "ortamda çalıştırın.",
    );
  }

  const lines = toKeyEnv(generateKeys());
  ensureAccepted(lines);
  return [
    "# VADO imza anahtarları. Canlı ortamın .env dosyasına yazın ve güvenli bir yerde yedekleyin.",
    "# Doğrulama kodları. Değiştirmek için: keys rotate otp",
    `VADO_OTP_KEYS=${lines.VADO_OTP_KEYS}`,
    "# QR kodları. Değiştirmek için: keys rotate qr",
    `VADO_QR_KEYS=${lines.VADO_QR_KEYS}`,
    "# Mini uygulama kimlikleri. Değişirse tüm kimlikler değişir; değiştirmeyin.",
    `VADO_OPENID_KEY=${lines.VADO_OPENID_KEY}`,
  ];
}

function migrate(env: KeyEnv, now: number): string[] {
  const appSecret = env.VADO_APP_SECRET;
  if (!isPresent(appSecret)) {
    throw new StartupError(
      "VADO_APP_SECRET tanımlı değil. Geçiş, eski kurulumun kullandığı değerle yapılır: değişkeni " +
        "ortamda tanımlayın ya da bulunduğu dosyayı --from ile gösterin. Yeni kurulum için: " +
        "keys generate",
    );
  }
  const defined = definedKeys(env);
  if (defined.length > 0) {
    throw new StartupError(
      `Yeni anahtarlar zaten tanımlı (${defined.join(", ")}); geçiş bir kez yapılır. Denetlemek ` +
        "için `keys check`, anahtar değiştirmek için `keys rotate` kullanın.",
    );
  }

  const otpGraceDay = utcDay(now + DAY_MS);
  const lines = toKeyEnv(migrateKeys(appSecret, otpGraceDay));
  ensureAccepted({ ...lines, VADO_APP_SECRET: appSecret });
  return [
    "# VADO_APP_SECRET kullanan kurulumdan geçiş. Bu satırları .env dosyasına ekleyin ve",
    "# `keys check` ile denetleyin. API yeni sürümle açıldıktan sonra VADO_APP_SECRET satırını silin.",
    `# Doğrulama kodları: yeni anahtar. Yolda olan kodlar ${otpGraceDay} gününün sonuna kadar geçer.`,
    `VADO_OTP_KEYS=${lines.VADO_OTP_KEYS}`,
    '# QR kodları: yeni anahtar imzalar; daha önce üretilmiş kodları "legacy" anahtarı doğrular.',
    `VADO_QR_KEYS=${lines.VADO_QR_KEYS}`,
    "# Mini uygulama kimlikleri: eski sistemle aynı anahtar; kimlikler değişmez.",
    `VADO_OPENID_KEY=${lines.VADO_OPENID_KEY}`,
  ];
}

function rotate(env: KeyEnv, family: Family, options: Arguments, now: number): string[] {
  const name = RINGS[family];
  const text = env[name];
  if (!isPresent(text)) {
    throw new StartupError(
      `${name} tanımlı değil. Değişkeni ortamda tanımlayın ya da bulunduğu dosyayı --from ` +
        "ile gösterin.",
    );
  }
  const current = parseKeyring(text);
  if (current.problems.length > 0) throw fail(`${name} geçersiz:`, current.problems);
  if (options.dropOld && options.until !== undefined) {
    throw new StartupError("--until ve --drop-old birlikte kullanılamaz.");
  }
  if (options.until !== undefined && (!isDay(options.until) || options.until < utcDay(now))) {
    throw new StartupError(
      "--until, bugün ya da sonrası için YYYY-AA-GG biçiminde bir gün olmalıdır.",
    );
  }

  // Doğrulama kodları birkaç dakika yaşar; eski anahtarın ertesi günün sonuna kadar kalması yeter.
  // QR kodları basılmış olabilir; ne kadar geçerli kalacaklarına işleten karar verir.
  const until = options.until ?? (family === "otp" ? utcDay(now + DAY_MS) : null);
  const rotated = rotateKeyring(current.entries, until, now);
  const ring = options.dropOld ? rotated.slice(0, 1) : rotated;
  const problems = keyringProblems(ring);
  if (problems.length > 0) throw fail("Halka döndürülemedi:", problems);

  const kept = new Set(ring.map((entry) => entry.id));
  const dropped = current.entries.filter((entry) => !kept.has(entry.id)).map((entry) => entry.id);
  return [
    ...describeKeyring(ring, now).map((status) => `# "${status.id}": ${describeStatus(status)}`),
    ...(dropped.length > 0 ? [`# Halkadan çıkarıldı: ${dropped.join(", ")}`] : []),
    ...(options.dropOld ? [`# Dikkat: ${DROP_CONSEQUENCE[family]}`] : []),
    `# .env dosyasındaki ${name} satırını bununla değiştirin ve API'yi yeniden başlatın.`,
    `${name}=${formatKeyring(ring)}`,
  ];
}

function check(env: KeyEnv, now: number): string[] {
  const problems: string[] = [];
  const keys = loadKeyConfig(env, true, problems);
  if (keys === null) throw fail("Anahtarlar geçersiz:", problems);

  const width = Math.max(...[...keys.otp, ...keys.qr].map((entry) => entry.id.length));
  const ring = (family: Family) =>
    describeKeyring(keys[family], now).map(
      (status) => `  ${status.id.padEnd(width)}  ${describeStatus(status)}`,
    );
  return [
    RINGS.otp,
    ...ring("otp"),
    RINGS.qr,
    ...ring("qr"),
    "VADO_OPENID_KEY",
    "  tanımlı",
    ...(isPresent(env.VADO_APP_SECRET)
      ? [
          "VADO_APP_SECRET",
          "  Yeni anahtarlar eski sistemle uyumlu: mini uygulama kimlikleri ve daha önce üretilmiş",
          "  QR kodları korunuyor. Bu değişken artık gerekmiyor; kaldırabilirsiniz.",
        ]
      : []),
    "Anahtarlar canlı ortam için geçerli.",
  ];
}

/**
 * Komutu çalıştırır ve yazdırılacak satırları döndürür. Kullanım hataları ve reddedilen işlemler
 * `StartupError` olarak fırlatılır.
 */
export function runKeyCommand(args: string[], readEnv: ReadKeyEnv, now: number): string[] {
  const options = readArguments(args);
  const [command, family, ...rest] = options.positionals;

  if (command === "rotate") {
    if (!isFamily(family) || rest.length > 0) throw new StartupError(USAGE);
    return rotate(readEnv(options.from), family, options, now);
  }
  if (family !== undefined || options.until !== undefined || options.dropOld) {
    throw new StartupError(USAGE);
  }
  if (command === "generate") return generate(readEnv(options.from));
  if (command === "migrate") return migrate(readEnv(options.from), now);
  if (command === "check") return check(readEnv(options.from), now);
  throw new StartupError(USAGE);
}
