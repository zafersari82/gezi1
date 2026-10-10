import { locationKeySchema } from "@vado/contracts";

import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { idempotencyBodyHash } from "../../core/idempotency";
/** Çağıran kullanıcı/tenant kapsamını açar; kayıt kilidi ile mutasyon ve yanıt birlikte kesinleşir. */
export async function locationMutation<T extends Record<string, unknown>>(
  tx: Database,
  userId: string,
  businessId: string | null,
  operation: string,
  key: string,
  body: unknown,
  run: () => Promise<T>,
): Promise<T> {
  if (!locationKeySchema.safeParse(key).success) throw new AppError("validation_failed");
  const hash = idempotencyBodyHash(body);
  await tx.execute(
    sql`insert into location_idempotency_keys(user_id,business_id,operation,key,body_hash) values(${userId},${businessId},${operation},${key},${hash}) on conflict(user_id,operation,key) do nothing`,
  );
  const stored = await tx.one<{ body_hash: string; response_body: T | null }>(
    sql`select body_hash,response_body from location_idempotency_keys where user_id=${userId} and operation=${operation} and key=${key} for update`,
  );
  if (stored.body_hash !== hash) throw new AppError("idempotency_conflict");
  if (stored.response_body !== null) return stored.response_body;
  const response = await run();
  await tx.execute(
    sql`update location_idempotency_keys set response_body=${JSON.stringify(response)}::jsonb where user_id=${userId} and operation=${operation} and key=${key}`,
  );
  return response;
}
