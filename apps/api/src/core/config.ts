import { existsSync } from "node:fs";

import {
  PACKAGE_ARCHIVE_MAX_MB_DEFAULT,
  type PaymentMode,
  paymentModeSchema,
} from "@vado/contracts";
import { z } from "zod";

import { StartupError } from "./errors";
import { isPresent, type KeyConfig, loadKeyConfig } from "./keys";
import { appsHostSuffix } from "./package-urls";

const DEV_ADMIN_API_KEY = "vado-development-admin-key";

const flagSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().default("postgres://vado:vado@localhost:5432/vado"),
  REDIS_URL: z.string().optional(),
  VADO_PUBLIC_URL: z.url().default("http://localhost:4000"),
  VADO_OTP_KEYS: z.string().optional(),
  VADO_QR_KEYS: z.string().optional(),
  VADO_OPENID_KEY: z.string().optional(),
  VADO_IDENTITY_KEYS: z.string().optional(),
  VADO_APP_SECRET: z.string().optional(),
  VADO_ADMIN_API_KEY: z.string().default(DEV_ADMIN_API_KEY),
  VADO_DEMO_MODE: flagSchema.default(true),
  VADO_PAYMENT_MODE: paymentModeSchema.default("sandbox"),
  VADO_CORS_ORIGINS: z
    .string()
    .default("http://localhost:8081,http://localhost:3000,http://localhost:5173"),
  VADO_SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  VADO_USER_QR_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(600),
  VADO_STORAGE_DIR: z.string().default("storage"),
  VADO_PACKAGE_DIR: z.string().default("package-store"),
  VADO_PACKAGE_MAX_MB: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(PACKAGE_ARCHIVE_MAX_MB_DEFAULT),
  VADO_APPS_ORIGIN: z.string().optional(),
  VADO_MINIAPP_DEV_MODE: flagSchema.optional(),
  VADO_TRUST_PROXY: flagSchema.default(false),
  VADO_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(600),
  VADO_SMS_PROVIDER: z.enum(["log", "webhook"]).default("log"),
  VADO_SMS_WEBHOOK_URL: z.url().optional(),
  VADO_SMS_WEBHOOK_SECRET: z.string().optional(),
  VADO_PUSH_PROVIDER: z.enum(["log", "expo"]).default("log"),
  /** Expo hesabında "Enhanced push security" açıksa gerekir; değilse boş kalabilir. */
  VADO_EXPO_ACCESS_TOKEN: z.string().optional(),
});

export type SmsConfig = { provider: "log" } | { provider: "webhook"; url: string; secret: string };

export type PushConfig = { provider: "log" } | { provider: "expo"; accessToken: string | null };

export interface Config {
  env: "development" | "test" | "production";
  port: number;
  host: string;
  logLevel: string;
  databaseUrl: string;
  redisUrl: string | null;
  /** API'nin dışarıdan erişilen adresi; medya bağlantıları bununla kurulur. */
  publicUrl: string;
  /** Doğrulama kodu, QR ve mini uygulama kimliği anahtarları (bkz. docs/ANAHTARLAR.md). */
  keys: KeyConfig;
  /**
   * 2.1 ve öncesinin ana anahtarı (`VADO_APP_SECRET`) hâlâ tanımlı mı? Canlı ortamda tanımlıysa
   * yeni anahtarların onunla uyumu başlangıçta doğrulanmıştır; değişken artık kaldırılabilir.
   */
  legacySecretPresent: boolean;
  adminApiKey: string;
  /** Açıkken SMS gönderilmez, doğrulama kodu her zaman 000000 olur. */
  demoMode: boolean;
  paymentMode: PaymentMode;
  corsOrigins: string[];
  sessionDays: number;
  userQrTtlSeconds: number;
  storageDir: string;
  /** İçerik adresli paket deposunun klasörü. Medya klasöründen ayrıdır ve doğrudan sunulmaz. */
  packageDir: string;
  /** Yüklenebilecek paket arşivinin en büyük boyutu (bayt). */
  packageMaxBytes: number;
  /**
   * Her uygulama kaydına ayrı alt alan adı veren şablon (`https://{app}.mini.ornek.com`).
   * Verilmezse paketler API'nin adresinde, kayda özel bir yolun altından sunulur.
   */
  appsOrigin: string | null;
  /**
   * Geliştiricinin kendi sunucusundan açılan uygulama kayıtlarına ve şifresiz adreslere izin
   * verir. Canlı ortamda kapalıdır: yalnızca VADO'ya yüklenmiş, onaylı paketler çalışır.
   */
  miniAppDevMode: boolean;
  /** Yalnızca API bir ters vekilin (Nginx vb.) arkasındaysa açılmalıdır. */
  trustProxy: boolean;
  /**
   * Bir IP adresinin dakikada gönderebileceği istek sayısı. Mobil operatörlerde çok sayıda
   * kullanıcı aynı adresi paylaşabildiği (CGNAT) için kullanıcı sayısı arttıkça yükseltilmelidir.
   */
  rateLimitPerMinute: number;
  sms: SmsConfig;
  push: PushConfig;
}

export class ConfigError extends StartupError {
  constructor(problems: string[]) {
    super(`Yapılandırma geçersiz:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/**
 * Çalışma klasöründe `.env` dosyası varsa ortam değişkenlerine yükler.
 * Ortamda zaten tanımlı olan değişkenler dosyadaki değerlerle ezilmez.
 */
export function loadEnvFile(): void {
  if (existsSync(".env")) process.loadEnvFile(".env");
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  const env = parsed.data;

  const problems: string[] = [];
  // Compose tanımsız değişkeni boş metin olarak geçirir; boş belirteç "yok" demektir.
  const expoAccessToken = env.VADO_EXPO_ACCESS_TOKEN?.trim() ?? "";
  let sms: SmsConfig = { provider: "log" };
  if (env.VADO_SMS_PROVIDER === "webhook") {
    if (env.VADO_SMS_WEBHOOK_URL === undefined || env.VADO_SMS_WEBHOOK_SECRET === undefined) {
      problems.push(
        "VADO_SMS_PROVIDER=webhook için VADO_SMS_WEBHOOK_URL ve VADO_SMS_WEBHOOK_SECRET gerekir",
      );
    } else {
      sms = {
        provider: "webhook",
        url: env.VADO_SMS_WEBHOOK_URL,
        secret: env.VADO_SMS_WEBHOOK_SECRET,
      };
    }
  }

  if (env.NODE_ENV === "production") {
    if (env.VADO_DEMO_MODE) {
      problems.push("Canlı ortamda VADO_DEMO_MODE=false olmalıdır");
    }
    if (env.VADO_ADMIN_API_KEY === DEV_ADMIN_API_KEY || env.VADO_ADMIN_API_KEY.length < 32) {
      problems.push("VADO_ADMIN_API_KEY en az 32 karakterlik rastgele bir değer olmalıdır");
    }
    if (env.VADO_SMS_PROVIDER === "log") {
      problems.push("Canlı ortamda gerçek bir SMS sağlayıcısı gerekir (VADO_SMS_PROVIDER=webhook)");
    }
    if (env.VADO_MINIAPP_DEV_MODE === true) {
      problems.push(
        "Canlı ortamda VADO_MINIAPP_DEV_MODE=false olmalıdır: adresle açılan mini uygulamalar " +
          "yalnızca geliştirme içindir",
      );
    }
  }
  const publicUrl = env.VADO_PUBLIC_URL.replace(/\/+$/, "");
  const appsOrigin = isPresent(env.VADO_APPS_ORIGIN) ? env.VADO_APPS_ORIGIN.trim() : null;
  if (appsOrigin !== null) {
    const suffix = appsHostSuffix(appsOrigin);
    if (suffix === null) {
      problems.push(
        "VADO_APPS_ORIGIN, uygulama kimliğinin yerini {app} ile gösteren bir adres olmalıdır " +
          "(örnek: https://{app}.mini.ornek.com)",
      );
    } else if (new URL(publicUrl).host.endsWith(suffix)) {
      problems.push(
        "VADO_PUBLIC_URL, VADO_APPS_ORIGIN ile ayrılan alan adının altında olamaz: API ile mini " +
          "uygulamalar ayrı alan adlarından sunulmalıdır",
      );
    } else if (env.NODE_ENV === "production" && !appsOrigin.startsWith("https://")) {
      problems.push("Canlı ortamda VADO_APPS_ORIGIN https ile başlamalıdır");
    }
  }
  const keys = loadKeyConfig(env, env.NODE_ENV === "production", problems);
  if (keys === null || problems.length > 0) throw new ConfigError(problems);

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL ?? null,
    publicUrl,
    keys,
    legacySecretPresent: isPresent(env.VADO_APP_SECRET),
    adminApiKey: env.VADO_ADMIN_API_KEY,
    demoMode: env.VADO_DEMO_MODE,
    paymentMode: env.VADO_PAYMENT_MODE,
    corsOrigins: env.VADO_CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ""),
    sessionDays: env.VADO_SESSION_DAYS,
    userQrTtlSeconds: env.VADO_USER_QR_TTL_SECONDS,
    storageDir: env.VADO_STORAGE_DIR,
    packageDir: env.VADO_PACKAGE_DIR,
    packageMaxBytes: env.VADO_PACKAGE_MAX_MB * 1024 * 1024,
    appsOrigin,
    miniAppDevMode: env.VADO_MINIAPP_DEV_MODE ?? env.NODE_ENV !== "production",
    trustProxy: env.VADO_TRUST_PROXY,
    rateLimitPerMinute: env.VADO_RATE_LIMIT_PER_MINUTE,
    sms,
    push:
      env.VADO_PUSH_PROVIDER === "expo"
        ? { provider: "expo", accessToken: expoAccessToken === "" ? null : expoAccessToken }
        : { provider: "log" },
  };
}
