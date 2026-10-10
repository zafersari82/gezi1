import { type Database, sql } from "./database";
import { AppError } from "./errors";
/** Hesap adresleri işletmeden bağımsızdır; kapsam yalnız bu işlemin etkin kullanıcısına aittir. */
export function withUser<T>(
  db: Database,
  userId: string,
  run: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const current = await tx.one<{ user_id: string | null }>(
      sql`select nullif(current_setting('vado.user_id',true),'') as user_id`,
    );
    if (current.user_id !== null && current.user_id !== userId) throw new AppError("forbidden");
    const user = await tx.maybeOne(
      sql`select id from users where id=${userId} and status='active' for share`,
    );
    if (user === null) throw new AppError("unauthorized");
    await tx.execute(sql`select set_config('vado.user_id',${userId},true)`);
    return run(tx);
  });
}
