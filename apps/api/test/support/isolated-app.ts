import { randomBytes } from "node:crypto";

import pg from "pg";
import { inject } from "vitest";

import { migrate } from "../../src/core/migrator";
import { startTestApp } from "./harness";

/** Küresel katalog boşluğu/sayımı sınanırken başka test dosyalarının örnek verisi karışmaz. */
export async function startIsolatedTestApp() {
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
  const databaseUrl = connection(inject("databaseUrl"));
  const migrateUrl = connection(inject("databaseMigrateUrl"));
  const platformUrl = connection(inject("databasePlatformUrl"));
  const cleanup = async () => {
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  };
  try {
    await migrate(migrateUrl);
    const app = await startTestApp({
      DATABASE_URL: databaseUrl,
      DATABASE_MIGRATE_URL: migrateUrl,
      DATABASE_PLATFORM_URL: platformUrl,
    });
    return {
      ...app,
      stop: async () => {
        try {
          await app.stop();
        } finally {
          await cleanup();
        }
      },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
