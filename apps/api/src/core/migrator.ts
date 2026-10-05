import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;
const ADVISORY_LOCK_KEY = 7_230_001;

/**
 * `migrations` klasörünü bu dosyadan yukarı doğru arar. Böylece kaynak koddan (src/core),
 * derlenmiş çıktıdan (dist) ve testlerden çalıştırıldığında aynı klasör bulunur.
 */
function findMigrationsDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = join(dir, "migrations");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("migrations klasörü bulunamadı");
}

async function listMigrationFiles(dir: string): Promise<string[]> {
  const files = await readdir(dir);
  return files.filter((file) => MIGRATION_FILE.test(file)).sort();
}

async function withClient<T>(
  databaseUrl: string,
  run: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function appliedMigrations(client: pg.Client): Promise<Set<string>> {
  const table = await client.query<{ exists: boolean }>(
    "select to_regclass('schema_migrations') is not null as exists",
  );
  if (table.rows[0]?.exists !== true) return new Set();
  const result = await client.query<{ name: string }>("select name from schema_migrations");
  return new Set(result.rows.map((row) => row.name));
}

/** Henüz uygulanmamış şema dosyalarının adlarını döndürür; veritabanında değişiklik yapmaz. */
export async function pendingMigrations(databaseUrl: string): Promise<string[]> {
  const files = await listMigrationFiles(findMigrationsDir());
  return withClient(databaseUrl, async (client) => {
    const applied = await appliedMigrations(client);
    return files.filter((file) => !applied.has(file));
  });
}

/**
 * Bekleyen şema dosyalarını sırayla uygular ve uygulananların adlarını döndürür.
 * Her dosya kendi işlemi içinde çalışır; aynı anda başlayan ikinci bir süreç kilit sayesinde bekler.
 */
export async function migrate(databaseUrl: string): Promise<string[]> {
  const dir = findMigrationsDir();
  const files = await listMigrationFiles(dir);

  return withClient(databaseUrl, async (client) => {
    await client.query("select pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    try {
      await client.query(`
        create table if not exists schema_migrations (
          name text primary key,
          applied_at timestamptz not null default now()
        )
      `);
      const applied = await appliedMigrations(client);
      const done: string[] = [];
      for (const file of files) {
        if (applied.has(file)) continue;
        const script = await readFile(join(dir, file), "utf8");
        await client.query("begin");
        try {
          await client.query(script);
          await client.query("insert into schema_migrations (name) values ($1)", [file]);
          await client.query("commit");
        } catch (error) {
          await client.query("rollback");
          throw new Error(`${file} uygulanamadı`, { cause: error });
        }
        done.push(file);
      }
      return done;
    } finally {
      await client.query("select pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    }
  });
}
