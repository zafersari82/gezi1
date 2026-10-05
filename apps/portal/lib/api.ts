import "server-only";

import {
  ADMIN_KEY_HEADER,
  type AdminOverview,
  adminOverviewSchema,
  apiErrorBodySchema,
  ERROR_MESSAGES,
  type ErrorCode,
  isErrorCode,
} from "@vado/contracts";
import { cache } from "react";
import type { z } from "zod";

import { env, isProduction } from "./env";
import { requireOperator } from "./operator";

/** API'nin geliştirme ortamındaki varsayılan yönetici anahtarı (bkz. apps/api/src/core/config.ts). */
const DEV_ADMIN_API_KEY = "vado-development-admin-key";

type Method = "GET" | "PUT" | "PATCH" | "POST";

/** API'nin reddettiği veya API'ye ulaşılamayan çağrı. `message` panelde gösterilebilir. */
export class AdminApiError extends Error {
  constructor(
    readonly code: ErrorCode | "unreachable",
    message: string,
    /** Hatanın ayrıntısı: reddedilen paketin sorunları, uymayan ayar alanları gibi. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

function settings(): { apiUrl: string; adminKey: string } {
  const apiUrl = env("VADO_API_INTERNAL_URL") ?? "http://localhost:4000";
  return {
    apiUrl: apiUrl.replace(/\/+$/, ""),
    // Canlı ortamda anahtar tanımlı değilse API isteği reddeder; geliştirme anahtarına düşülmez.
    adminKey: env("VADO_ADMIN_API_KEY") ?? (isProduction ? "" : DEV_ADMIN_API_KEY),
  };
}

async function toError(response: Response): Promise<AdminApiError> {
  const body = apiErrorBodySchema.safeParse(await response.json().catch(() => null));
  const code = body.success && isErrorCode(body.data.error.code) ? body.data.error.code : null;
  return new AdminApiError(
    code ?? "internal_error",
    ERROR_MESSAGES[code ?? "internal_error"],
    body.success ? body.data.error.details : undefined,
  );
}

/** Gövde bir form (dosya yükleme) ise olduğu gibi, değilse JSON olarak gönderilir. */
async function send(method: Method, path: string, body?: unknown): Promise<Response> {
  await requireOperator();
  const { apiUrl, adminKey } = settings();
  const upload = body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      cache: "no-store",
      headers: {
        [ADMIN_KEY_HEADER]: adminKey,
        ...(body === undefined || upload ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: upload ? body : JSON.stringify(body) }),
    });
  } catch {
    throw new AdminApiError("unreachable", "API'ye ulaşılamıyor.");
  }
  if (!response.ok) throw await toError(response);
  return response;
}

/** Yönetim uç noktasından veri okur ve yanıtı sözleşmedeki şemayla doğrular. */
export async function adminGet<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
): Promise<z.infer<Schema>> {
  const response = await send("GET", path);
  return schema.parse(await response.json());
}

/** Yönetim uç noktasına değişiklik gönderir. */
export async function adminSend(
  method: "PUT" | "PATCH" | "POST",
  path: string,
  body?: unknown,
): Promise<void> {
  await send(method, path, body);
}

/** Değişiklik gönderir ve API'nin döndürdüğü sonucu sözleşmedeki şemayla doğrular. */
export async function adminCall<Schema extends z.ZodType>(
  schema: Schema,
  method: "PUT" | "POST",
  path: string,
  body?: unknown,
): Promise<z.infer<Schema>> {
  const response = await send(method, path, body);
  return schema.parse(await response.json());
}

/** Genel bakış hem kenar çubuğunda hem ana sayfada kullanılır; aynı istekte bir kez okunur. */
export const getOverview = cache((): Promise<AdminOverview> =>
  adminGet(adminOverviewSchema, "/v1/admin/overview"),
);
