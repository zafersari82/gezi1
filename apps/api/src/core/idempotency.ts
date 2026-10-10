import { createHash } from "node:crypto";

import { z } from "zod";

import { type Database, sql } from "./database";
import { AppError } from "./errors";
import { type TenantScope, withTenant } from "./tenant-scope";

type Json = z.infer<ReturnType<typeof z.json>>;

function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key] ?? null)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** JSON nesne anahtar sırasından bağımsız tekrar parmak izi. */
export function idempotencyBodyHash(body: unknown): string {
  const parsed = z.json().safeParse(body);
  if (!parsed.success) throw new AppError("validation_failed");
  return createHash("sha256").update(canonical(parsed.data)).digest("hex");
}

export interface IdempotencyResponse<T extends Record<string, unknown>> {
  status: number;
  body: T;
}

/** Anahtar, gövde ve HTTP yanıtı müşteri/uygulama/işletme bağlamında tek SQL işlemine aittir. */
export function withIdempotency<T extends Record<string, unknown>>(
  tx: Database,
  scope: TenantScope,
  operation: string,
  key: string,
  body: unknown,
  run: () => Promise<IdempotencyResponse<T>>,
): Promise<IdempotencyResponse<T>> {
  if (
    scope.role !== "customer" ||
    scope.appInstanceId === null ||
    scope.businessCustomerId === null
  ) {
    throw new AppError("forbidden");
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new AppError("validation_failed");
  const hash = idempotencyBodyHash(body);
  return withTenant(tx, scope, async (db) => {
    await db.execute(sql`delete from idempotency_keys where business_id = ${scope.businessId}
      and app_instance_id = ${scope.appInstanceId} and business_customer_id = ${scope.businessCustomerId}
      and operation = ${operation} and key = ${key} and expires_at <= now()`);
    await db.execute(sql`
      insert into idempotency_keys(business_id, app_instance_id, business_customer_id, operation, key, body_hash)
      values (${scope.businessId}, ${scope.appInstanceId}, ${scope.businessCustomerId}, ${operation}, ${key}, ${hash})
      on conflict (business_id, app_instance_id, business_customer_id, operation, key) do nothing
    `);
    const stored = await db.one<{
      id: string;
      body_hash: string;
      response_status: number | null;
      response_body: T | null;
    }>(sql`
      select id, body_hash, response_status, response_body from idempotency_keys
      where business_id = ${scope.businessId} and app_instance_id = ${scope.appInstanceId}
        and business_customer_id = ${scope.businessCustomerId} and operation = ${operation} and key = ${key}
      for update
    `);
    if (stored.body_hash !== hash) throw new AppError("idempotency_conflict");
    if (stored.response_status !== null && stored.response_body !== null) {
      return { status: stored.response_status, body: stored.response_body };
    }
    const response = await run();
    await db.execute(sql`update idempotency_keys set response_status = ${response.status},
      response_body = ${JSON.stringify(response.body)}::jsonb where id = ${stored.id}`);
    return response;
  });
}
