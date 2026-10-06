import pg from "pg";

import { StartupError } from "./errors";

interface RoleConnections {
  databaseUrl: string;
  migrateUrl: string;
  platformUrl: string;
}

/** İlk kurulum yöneticisi çalıştırır; rol adı sabittir, parola SQL değeri olarak ayrı kaçar. */
export async function provisionDatabaseRoles(
  bootstrapUrl: string,
  connections: RoleConnections,
): Promise<void> {
  const client = new pg.Client({ connectionString: bootstrapUrl });
  await client.connect();
  try {
    for (const [name, address, privileges] of [
      ["vado_owner", connections.migrateUrl, "nosuperuser nobypassrls createdb"],
      ["vado_app", connections.databaseUrl, "nosuperuser nobypassrls nocreatedb"],
      ["vado_platform", connections.platformUrl, "nosuperuser bypassrls nocreatedb"],
    ] as const) {
      const url = new URL(address);
      if (decodeURIComponent(url.username) !== name || url.password === "") {
        throw new StartupError(`${name} bağlantısında rol adı ve parola bulunmalıdır`);
      }
      const existing = await client.query("select 1 from pg_roles where rolname = $1", [name]);
      if (existing.rowCount === 0) await client.query(`create role ${name}`);
      const escaped = await client.query<{ password: string }>(
        "select quote_literal($1) as password",
        [decodeURIComponent(url.password)],
      );
      const password = escaped.rows[0]?.password;
      if (password === undefined) throw new StartupError("Rol parolası hazırlanamadı");
      await client.query(
        `alter role ${name} login noinherit nocreaterole noreplication ${privileges} password ${password}`,
      );
      await client.query(`alter role ${name} set timezone = 'UTC'`);
    }
    await client.query("revoke vado_owner, vado_platform from vado_app");
  } finally {
    await client.end();
  }
}

/** Eski şema yalnızca seçilen veritabanında taşınır; başka veritabanlarına dokunulmaz. */
export async function prepareDatabaseOwnership(bootstrapUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: bootstrapUrl });
  await client.connect();
  try {
    const database = await client.query<{ name: string; identifier: string }>(
      "select current_database() as name, quote_ident(current_database()) as identifier",
    );
    const row = database.rows[0];
    if (row === undefined || ["postgres", "template0", "template1"].includes(row.name)) {
      throw new StartupError("Rol kurulumu VADO veritabanının bağlantısını gerektirir");
    }
    await client.query("begin");
    await client.query(`alter database ${row.identifier} owner to vado_owner`);
    await client.query("grant usage, create on schema public to vado_owner");
    const relations = await client.query<{ name: string; kind: string }>(`
      select quote_ident(n.nspname) || '.' || quote_ident(c.relname) as name, c.relkind as kind
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
        and not exists (select 1 from pg_depend d where d.objid = c.oid
          and d.classid = 'pg_class'::regclass and d.deptype in ('e', 'a', 'i'))
      order by case when c.relkind in ('r', 'p') then 0 else 1 end, c.relname
    `);
    for (const relation of relations.rows) {
      const kind =
        relation.kind === "v"
          ? "view"
          : relation.kind === "m"
            ? "materialized view"
            : relation.kind === "S"
              ? "sequence"
              : "table";
      await client.query(`alter ${kind} ${relation.name} owner to vado_owner`);
    }
    const functions = await client.query<{ signature: string }>(`
      select p.oid::regprocedure::text as signature from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
        and not exists (select 1 from pg_depend d where d.objid = p.oid
          and d.classid = 'pg_proc'::regclass and d.deptype = 'e')
    `);
    for (const fn of functions.rows)
      await client.query(`alter function ${fn.signature} owner to vado_owner`);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
