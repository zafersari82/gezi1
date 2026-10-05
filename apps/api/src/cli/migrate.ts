import { loadConfig, loadEnvFile } from "../core/config";
import { StartupError } from "../core/errors";
import { migrate } from "../core/migrator";

/** Bekleyen şema dosyalarını uygular: `npm run db:migrate` veya canlıda `node dist/cli/migrate.js`. */
async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const applied = await migrate(config.databaseUrl);
  if (applied.length === 0) {
    console.log("Şema güncel; uygulanacak dosya yok.");
    return;
  }
  for (const file of applied) console.log(`Uygulandı: ${file}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof StartupError ? error.message : error);
  process.exit(1);
});
