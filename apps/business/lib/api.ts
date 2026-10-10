import "server-only";

import { apiErrorBodySchema, ERROR_MESSAGES, isErrorCode } from "@vado/contracts";
import { headers } from "next/headers";
import type { z } from "zod";

import { sessionToken } from "./session";

export class BusinessApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
export async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
  authenticated = true,
  credentialOverride?: string,
  idempotencyKey?: string,
): Promise<Response> {
  const token = authenticated ? (credentialOverride ?? (await sessionToken())) : null;
  if (authenticated && token === null)
    throw new BusinessApiError(401, "unauthorized", "VADO hesabınla giriş yap.");
  const incoming = await headers();
  const forwarded = incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip");
  let response: Response;
  try {
    response = await fetch(
      `${(process.env.VADO_API_INTERNAL_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "")}${path}`,
      {
        method,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: {
          ...(token === null ? {} : { authorization: `Bearer ${token}` }),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(idempotencyKey === undefined ? {} : { "idempotency-key": idempotencyKey }),
          ...(forwarded === null ? {} : { "x-forwarded-for": forwarded }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
  } catch {
    throw new BusinessApiError(503, "unreachable", "Şu anda bağlantı kurulamıyor. Tekrar dene.");
  }
  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(await response.json().catch(() => null));
    const code = parsed.success ? parsed.data.error.code : "internal_error";
    throw new BusinessApiError(
      response.status,
      code,
      isErrorCode(code) ? ERROR_MESSAGES[code] : "İşlem tamamlanamadı.",
      parsed.success ? parsed.data.error.details : undefined,
    );
  }
  return response;
}
export async function apiGet<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  authenticated = true,
): Promise<z.infer<Schema>> {
  return schema.parse(await (await apiRequest("GET", path, undefined, authenticated)).json());
}

/** İkili görselin gövdesi yeniden JSON'a çevrilmeden API'ye aktarılır. */
export async function apiUpload(path: string, form: FormData): Promise<Response> {
  const token = await sessionToken();
  if (token === null) throw new BusinessApiError(401, "unauthorized", "VADO hesabınla giriş yap.");
  let response: Response;
  try {
    response = await fetch(
      `${(process.env.VADO_API_INTERNAL_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "")}${path}`,
      {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Bearer ${token}` },
        body: form,
      },
    );
  } catch {
    throw new BusinessApiError(503, "unreachable", "Görsel yüklenemedi. Tekrar dene.");
  }
  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(await response.json().catch(() => null));
    const code = parsed.success ? parsed.data.error.code : "internal_error";
    throw new BusinessApiError(
      response.status,
      code,
      isErrorCode(code) ? ERROR_MESSAGES[code] : "Görsel yüklenemedi.",
    );
  }
  return response;
}
