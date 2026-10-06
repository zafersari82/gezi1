import { type Database, sql } from "./database";
import { StartupError } from "./errors";

/** Platform erişimi ayrı havuzu ve adı açık bu yolu kullanır; motorlarda çağrılamaz. */
export function platformScope<T>(db: Database, run: (tx: Database) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const role = await tx.one<{ valid: boolean }>(sql`
      select current_user = 'vado_platform' and rolbypassrls and not rolsuper as valid
      from pg_roles where rolname = current_user
    `);
    if (!role.valid)
      throw new StartupError("Platform bağlantısı vado_platform rolünü kullanmalıdır");
    return run(tx);
  });
}

export async function verifyDatabaseRoles(db: Database, platformDb: Database): Promise<void> {
  const role = await db.one<{ valid: boolean }>(sql`
    select current_user = 'vado_app' and not rolsuper and not rolbypassrls
      and not pg_has_role(current_user, 'vado_owner', 'MEMBER')
      and not pg_has_role(current_user, 'vado_platform', 'MEMBER')
      and not exists (select 1 from pg_class where relnamespace = 'public'::regnamespace
        and relkind in ('r', 'p') and relowner = (select oid from pg_roles where rolname = current_user))
      as valid from pg_roles where rolname = current_user
  `);
  if (!role.valid)
    throw new StartupError("API bağlantısı ayrı ve yetkisiz vado_app rolünü kullanmalıdır");
  await platformScope(platformDb, () => Promise.resolve());
}
