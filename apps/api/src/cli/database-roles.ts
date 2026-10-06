import { loadConfig, loadEnvFile } from "../core/config";
import { prepareDatabaseOwnership, provisionDatabaseRoles } from "../core/database-roles";
import { StartupError } from "../core/errors";

async function main(): Promise<void> {
  loadEnvFile();
  const bootstrapUrl = process.env.DATABASE_BOOTSTRAP_URL;
  if (bootstrapUrl === undefined)
    throw new StartupError("DATABASE_BOOTSTRAP_URL kurulum yöneticisinin bağlantısı olmalıdır");
  const config = loadConfig();
  await provisionDatabaseRoles(bootstrapUrl, {
    databaseUrl: config.databaseUrl,
    migrateUrl: config.databaseMigrateUrl,
    platformUrl: config.databasePlatformUrl,
  });
  await prepareDatabaseOwnership(bootstrapUrl);
  console.log(
    "Veritabanı rolleri kuruldu; kurulum yöneticisi bağlantısını API ortamından kaldırın.",
  );
}
main().catch((error: unknown) => {
  console.error(error instanceof StartupError ? error.message : error);
  process.exit(1);
});
