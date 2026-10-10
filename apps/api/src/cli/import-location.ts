import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { loadConfig, loadEnvFile } from "../core/config";
import { createDatabase } from "../core/database";
import {
  importLocationCatalog,
  LOCATION_SHA256,
  validateLocationCatalog,
} from "../modules/location/location-import";
function bundledCatalog(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 4; depth++) {
    const path = join(dir, "data", "location", "turkey-geo.json.gz");
    if (existsSync(path)) return path;
    dir = dirname(dir);
  }
  throw new Error("Paketli konum kataloğu bulunamadı.");
}
async function main(): Promise<void> {
  if (process.argv.length > 2)
    throw new Error("Komut paketli, lisanslı kataloğu kullanır; parametre kabul etmez.");
  loadEnvFile();
  const config = loadConfig();
  const raw = gunzipSync(await readFile(bundledCatalog()));
  if (createHash("sha256").update(raw).digest("hex") !== LOCATION_SHA256)
    throw new Error("Konum kataloğunun dosya özeti uyuşmuyor.");
  const catalog = validateLocationCatalog(JSON.parse(raw.toString("utf8")));
  if (
    catalog.provinces.length !== 81 ||
    catalog.districts.length !== 973 ||
    catalog.neighborhoods.length !== 73496
  )
    throw new Error("Ulusal konum kataloğunun kayıt sayıları uyuşmuyor.");
  const db = createDatabase(config.databasePlatformUrl);
  try {
    const result = await importLocationCatalog(db, raw);
    console.log(
      `Konum kataloğu yüklendi: ${result.counts.provinces} il, ${result.counts.districts} ilçe, ${result.counts.neighborhoods} mahalle/köy/yerleşim. SHA-256: ${result.sha256}`,
    );
  } finally {
    await db.close();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Konum kataloğu yüklenemedi.");
  process.exitCode = 1;
});
