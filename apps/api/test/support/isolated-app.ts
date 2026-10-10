import { randomBytes } from "node:crypto";

import pg from "pg";
import { inject } from "vitest";

import { migrate } from "../../src/core/migrator";
import { startTestApp } from "./harness";

/** Boş, ayrı bir test veritabanı; üç rolün bağlantı adresleri ve silme işleviyle. */
export async function createIsolatedDatabase() {
  const admin = new pg.Client({
    connectionString:
      process.env.DATABASE_TEST_ADMIN_URL ?? "postgres://postgres:vado@localhost:5432/postgres",
  });
  const name = `vado_isolated_${randomBytes(6).toString("hex")}`;
  await admin.connect();
  await admin.query(`create database ${name} owner vado_owner`);
  const connection = (source: string) => {
    const url = new URL(source);
    url.pathname = `/${name}`;
    return url.toString();
  };
  return {
    databaseUrl: connection(inject("databaseUrl")),
    migrateUrl: connection(inject("databaseMigrateUrl")),
    platformUrl: connection(inject("databasePlatformUrl")),
    drop: async () => {
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}

/** Küresel katalog boşluğu/sayımı sınanırken başka test dosyalarının örnek verisi karışmaz. */
export async function startIsolatedTestApp() {
  const database = await createIsolatedDatabase();
  try {
    await migrate(database.migrateUrl);
    const app = await startTestApp({
      DATABASE_URL: database.databaseUrl,
      DATABASE_MIGRATE_URL: database.migrateUrl,
      DATABASE_PLATFORM_URL: database.platformUrl,
    });
    return {
      ...app,
      stop: async () => {
        try {
          await app.stop();
        } finally {
          await database.drop();
        }
      },
    };
  } catch (error) {
    await database.drop();
    throw error;
  }
}
