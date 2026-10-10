import { PACKAGE_VERSION_STATUS_LABELS } from "@vado/contracts";

import { loadConfig, loadEnvFile } from "../core/config";
import type { AppContext } from "../core/context";
import { createDatabase } from "../core/database";
import { StartupError } from "../core/errors";
import { createAppKeys } from "../core/keys";
import type { StoreProblem } from "../modules/packages/packages.service";
import { createLocalPackageStore } from "../providers/package-store";
import { createLocalStorage } from "../providers/storage";
import { createServices } from "../services";

/**
 * Paket deposunu denetler: `npm run packages:verify`, canlıda `node dist/cli/packages.js verify`.
 *
 * Veritabanındaki her sürümün dosya listesinin özetiyle, depodaki her dosyanın da kendi özetiyle
 * eşleştiğine bakar. Yedekten dönüşten ya da depo başka bir diske taşındıktan sonra çalıştırılır.
 * Sürümlere ve dosyalarına dokunmaz, API çalışırken de kullanılabilir; sorun bulursa listeler ve
 * 1 koduyla çıkar.
 */
const USAGE = "Kullanım: npm run packages:verify (canlıda: node dist/cli/packages.js verify)";

const REASONS: Record<StoreProblem["reason"], string> = {
  digest_mismatch: "dosya listesi sürümün özetiyle eşleşmiyor",
  missing: "dosya depoda yok",
  corrupt: "dosya depoda bozulmuş",
};

async function main(): Promise<void> {
  if (process.argv[2] !== "verify") throw new StartupError(USAGE);
  loadEnvFile();
  const config = loadConfig();

  const db = createDatabase(config.databaseUrl, 2);
  const platformDb = createDatabase(config.databasePlatformUrl, 2);
  try {
    const context: AppContext = {
      config,
      db,
      platformDb,
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
      keys: createAppKeys(config.keys),
      storage: await createLocalStorage(config.storageDir, config.publicUrl),
      packageStore: await createLocalPackageStore(config.packageDir),
      sms: { sendOtp: () => Promise.resolve() },
      // Komut satırından bildirim gönderilmez.
      push: { send: (messages) => Promise.resolve(messages.map(() => "sent" as const)) },
      realtime: {
        emit: () => undefined,
        emitBusiness: () => undefined,
        emitBusinessLive: () => undefined,
        emitKitchen: () => undefined,
        emitCourier: () => undefined,
        disconnectKitchenDevice: () => undefined,
        disconnectSession: () => undefined,
      },
    };
    const report = await createServices(context).packages.verifyStore();

    console.log(
      `${report.versions} sürüm, ${report.files} dosya (${report.contents} ayrı içerik) denetlendi.`,
    );
    for (const problem of report.problems) {
      const version = `${problem.packageId} ${problem.version}`;
      const status = PACKAGE_VERSION_STATUS_LABELS[problem.status];
      const subject = problem.path === null ? "" : ` ${problem.path}`;
      console.error(`SORUN: ${version} (${status})${subject}: ${REASONS[problem.reason]}`);
    }
    if (report.problems.length > 0) {
      throw new StartupError(
        `${report.problems.length} sorun bulundu. Paket deposunu (VADO_PACKAGE_DIR) veritabanıyla ` +
          "aynı ana ait yedekten geri yükleyin.",
      );
    }
    console.log("Paket deposu veritabanıyla tutarlı.");
  } finally {
    await db.close();
    await platformDb.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof StartupError ? error.message : error);
  process.exit(1);
});
