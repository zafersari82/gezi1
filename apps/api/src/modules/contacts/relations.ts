import { type Database, sql } from "../../core/database";

/** İki kullanıcı birbirinin kişisi mi? */
export async function areContacts(db: Database, userId: string, otherId: string): Promise<boolean> {
  const row = await db.maybeOne(sql`
    select 1 from contacts where user_id = ${userId} and contact_id = ${otherId}
  `);
  return row !== null;
}

/** Verilen kimliklerden kullanıcının kişisi olanları döndürür. */
export async function filterContacts(
  db: Database,
  userId: string,
  candidateIds: readonly string[],
): Promise<string[]> {
  if (candidateIds.length === 0) return [];
  const rows = await db.many<{ contact_id: string }>(sql`
    select contact_id from contacts
    where user_id = ${userId} and contact_id = any(${candidateIds}::uuid[])
  `);
  return rows.map((row) => row.contact_id);
}

/** İki kullanıcıdan herhangi biri diğerini engellemiş mi? */
export async function isBlockedEitherWay(
  db: Database,
  userId: string,
  otherId: string,
): Promise<boolean> {
  const row = await db.maybeOne(sql`
    select 1 from blocks
    where (user_id = ${userId} and blocked_id = ${otherId})
       or (user_id = ${otherId} and blocked_id = ${userId})
  `);
  return row !== null;
}
