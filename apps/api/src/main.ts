import { buildApp } from "./app";
import { type Config, loadConfig, loadEnvFile } from "./core/config";
import { createDatabase } from "./core/database";
import { StartupError } from "./core/errors";
import { describeKeyring } from "./core/key-management";
import { migrate, pendingMigrations } from "./core/migrator";

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Geliştirme ortamında bekleyen şema dosyalarını kendiliğinden uygular.
 * Canlı ortamda şema değişikliği bilinçli bir adımdır; bekleyen dosya varsa API başlamaz.
 */
async function ensureSchema(config: Config): Promise<string[]> {
  if (config.env !== "production") return migrate(config.databaseMigrateUrl);

  const pending = await pendingMigrations(config.databaseUrl);
  if (pending.length > 0) {
    throw new StartupError(
      `Uygulanmamış şema dosyaları var (${pending.join(", ")}). ` +
        "Önce `node dist/cli/migrate.js` komutunu çalıştırın.",
    );
  }
  return [];
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const applied = await ensureSchema(config);

  const db = createDatabase(config.databaseUrl);
  const platformDb = createDatabase(config.databasePlatformUrl);
  const app = await buildApp({ config, db, platformDb });
  const { log } = app.server;
  app.services.events.start();
  if (applied.length > 0) log.info({ applied }, "Şema güncellendi");
  if (config.demoMode) log.warn("Demo modu açık: SMS gönderilmez, doğrulama kodu 000000");
  // Anahtar değişikliğinden sonra süreçlerin yeni halkayı aldığı buradan görülür; yalnızca
  // kimlikler yazılır.
  const rings = {
    otp: describeKeyring(config.keys.otp, Date.now()),
    qr: describeKeyring(config.keys.qr, Date.now()),
  };
  log.info(
    { otp: rings.otp.map((key) => key.id), qr: rings.qr.map((key) => key.id) },
    "İmza anahtarları yüklendi",
  );
  for (const [family, ring] of Object.entries(rings)) {
    for (const key of ring.filter((status) => status.expired)) {
      log.warn(
        { family, keyId: key.id, validThrough: key.validThrough },
        "Süresi dolmuş anahtar halkada duruyor; ortam değişkeninden çıkarılabilir",
      );
    }
  }
  if (config.env === "production" && config.legacySecretPresent) {
    log.warn(
      "VADO_APP_SECRET hâlâ tanımlı. Yeni anahtarların eski sistemle uyumu doğrulandı: mini " +
        "uygulama kimlikleri ve eski QR kodları korunuyor. Bu değişkeni artık kaldırın.",
    );
  }
  if (!(await app.services.adminAccounts.hasActiveOwner())) {
    log.warn(
      "Panelde etkin bir sahip hesabı yok; panele kimse giremez. İlk hesabı komut satırından " +
        "açın: npm run admins -- create --username <ad> --name <görünen ad> --role owner " +
        "(canlıda: node dist/cli/admins.js create …).",
    );
  }
  db.onIdleError((error) => {
    log.warn(error, "Boştaki veritabanı bağlantısı koptu; havuz yenisini açacak");
  });

  const maintenance = setInterval(() => {
    Promise.all([
      app.services.auth.purgeExpired(),
      app.services.events.purgeExpiredKeys(),
      app.services.tenantMaintenance.purgeCarts(),
      app.services.tenantMaintenance.purgeBusinessTickets(),
      app.services.tenantMaintenance.purgeDeviceEvents(),
      app.services.adminAccounts.purgeExpired(),
    ]).catch((error: unknown) => {
      log.error(error, "Bakım görevi başarısız");
    });
  }, MAINTENANCE_INTERVAL_MS);
  maintenance.unref();

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "Kapanış başladı");
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    clearInterval(maintenance);

    app
      .close()
      .then(() => Promise.all([db.close(), platformDb.close()]))
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        log.error(error, "Kapanış başarısız");
        process.exit(1);
      });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  await app.server.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error(error instanceof StartupError ? error.message : error);
  process.exit(1);
});
