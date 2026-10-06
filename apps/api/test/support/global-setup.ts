import { randomBytes } from "node:crypto";

import pg from "pg";
import type { TestProject } from "vitest/node";

import { provisionDatabaseRoles } from "../../src/core/database-roles";
import { migrate } from "../../src/core/migrator";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
    databaseMigrateUrl: string;
    databasePlatformUrl: string;
  }
}

const DEFAULT_DATABASE_URL = "postgres://postgres:vado@localhost:5432/postgres";

let dropDatabase: (() => Promise<void>) | null = null;

/**
 * Testler gerçek PostgreSQL üzerinde, her çalıştırmada sıfırdan oluşturulan ayrı bir
 * veritabanında koşar; bittiğinde veritabanı silinir. Geliştirme verisine dokunulmaz.
 */
export async function setup(project: TestProject): Promise<void> {
  const adminUrl = process.env.DATABASE_TEST_ADMIN_URL ?? DEFAULT_DATABASE_URL;
  const databaseName = `vado_test_${randomBytes(6).toString("hex")}`;
  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${databaseName}`;
  const connection = (role: string, env: string): string => {
    const url = new URL(process.env[env] ?? testUrl);
    url.pathname = `/${databaseName}`;
    url.username = role;
    if (url.password === "") url.password = "vado";
    return url.toString();
  };
  const databaseUrl = connection("vado_app", "DATABASE_URL");
  const migrateUrl = connection("vado_owner", "DATABASE_MIGRATE_URL");
  const platformUrl = connection("vado_platform", "DATABASE_PLATFORM_URL");
  await provisionDatabaseRoles(adminUrl, { databaseUrl, migrateUrl, platformUrl });

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${databaseName} owner vado_owner`);
  dropDatabase = async () => {
    await admin.query(`drop database if exists ${databaseName} with (force)`);
    await admin.end();
  };

  await migrate(migrateUrl);
  project.provide("databaseUrl", databaseUrl);
  project.provide("databaseMigrateUrl", migrateUrl);
  project.provide("databasePlatformUrl", platformUrl);
}

export async function teardown(): Promise<void> {
  await dropDatabase?.();
}
