import { idempotencyKeySchema } from "@vado/contracts";

import { type Database, sql } from "./database";
import { AppError } from "./errors";
import { idempotencyBodyHash } from "./idempotency";
/** Çağıran güncel kapsamı açar; tekrar kaydı platform servisleri arasında ortak ve aynı işlemdedir. */
export async function withPlatformMutation<T extends Record<string, unknown>>(
  tx: Database,
  userId: string,
  businessId: string | null,
  operation: string,
  key: string,
  body: unknown,
  run: () => Promise<T>,
): Promise<T> {
  if (!idempotencyKeySchema.safeParse(key).success) throw new AppError("validation_failed");
  const name = `${businessId ?? "account"}/${operation}`,
    hash = idempotencyBodyHash(body);
  await tx.execute(
    sql`insert into platform_mutations(user_id,business_id,operation,key,body_hash) values(${userId},${businessId},${name},${key},${hash}) on conflict(user_id,operation,key) do nothing`,
  );
  const stored = await tx.one<{ body_hash: string; response_body: T | null }>(
    sql`select body_hash,response_body from platform_mutations where user_id=${userId} and operation=${name} and key=${key} for update`,
  );
  if (stored.body_hash !== hash) throw new AppError("idempotency_conflict");
  if (stored.response_body !== null) return stored.response_body;
  const result = await run();
  await tx.execute(
    sql`update platform_mutations set response_body=${JSON.stringify(result)}::jsonb where user_id=${userId} and operation=${name} and key=${key}`,
  );
  return result;
}
