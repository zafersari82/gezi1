import { randomBytes } from "node:crypto";

import pg from "pg";
import type { TestProject } from "vitest/node";

import { migrate } from "../../src/core/migrator";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const DEFAULT_DATABASE_URL = "postgres://vado:vado@localhost:5432/vado";

let dropDatabase: (() => Promise<void>) | null = null;

/**
 * Testler gerçek PostgreSQL üzerinde, her çalıştırmada sıfırdan oluşturulan ayrı bir
 * veritabanında koşar; bittiğinde veritabanı silinir. Geliştirme verisine dokunulmaz.
 */
export async function setup(project: TestProject): Promise<void> {
  const adminUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const databaseName = `vado_test_${randomBytes(6).toString("hex")}`;
  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${databaseName}`;

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${databaseName}`);
  dropDatabase = async () => {
    await admin.query(`drop database if exists ${databaseName} with (force)`);
    await admin.end();
  };

  await migrate(testUrl.toString());
  project.provide("databaseUrl", testUrl.toString());
}

export async function teardown(): Promise<void> {
  await dropDatabase?.();
}
