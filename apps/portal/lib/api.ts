import "server-only";

import {
  ADMIN_CLIENT_AGENT_HEADER,
  ADMIN_CLIENT_IP_HEADER,
  ADMIN_KEY_HEADER,
  type AdminMe,
  adminMeSchema,
  type AdminOverview,
  adminOverviewSchema,
  apiErrorBodySchema,
  ERROR_MESSAGES,
  type ErrorCode,
  isErrorCode,
} from "@vado/contracts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { z } from "zod";

import { env, isProduction } from "./env";
import { PENDING_COOKIE, readToken, SESSION_COOKIE } from "./session";

/** API'nin geliştirme ortamındaki varsayılan yönetici anahtarı (bkz. apps/api/src/core/config.ts). */
const DEV_ADMIN_API_KEY = "vado-development-admin-key";

type Method = "GET" | "PUT" | "PATCH" | "POST" | "DELETE";

/**
 * Çağrının hangi oturumla yapıldığı: açık oturum (`session`), ikinci adımı bekleyen yarım oturum
 * (`pending`) ya da oturumsuz (`none`, yalnızca giriş).
 */
export type Credential = "session" | "pending" | "none";

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

/** Yöneticinin tarayıcısı: oturum listesinde ve denetim kaydında panel sunucusu değil o görünür. */
async function clientHeaders(): Promise<Record<string, string>> {
  const request = await headers();
  // Panelin önündeki ters vekil (Nginx) tarayıcının adresini bu başlıklara yazar.
  const forwarded = request.get("x-forwarded-for")?.split(",", 1).join("").trim() ?? "";
  const ip = forwarded === "" ? (request.get("x-real-ip") ?? "") : forwarded;
  const agent = request.get("user-agent");
  return {
    ...(ip === "" ? {} : { [ADMIN_CLIENT_IP_HEADER]: ip }),
    ...(agent === null ? {} : { [ADMIN_CLIENT_AGENT_HEADER]: agent }),
  };
}

/**
 * Gövde bir form (dosya yükleme) ise olduğu gibi, değilse JSON olarak gönderilir. Oturumun
 * belirteci çerezden okunur ve API'ye taşınır; hesabı ve yetkisini API doğrular. Oturum
 * geçersizse giriş sayfasına, parolanın değişmesi gerekiyorsa hesap sayfasına, okuma izni yoksa
 * yetki sayfasına gidilir.
 */
async function send(
  method: Method,
  path: string,
  body?: unknown,
  credential: Credential = "session",
): Promise<Response> {
  const { apiUrl, adminKey } = settings();
  const token =
    credential === "none"
      ? null
      : await readToken(credential === "session" ? SESSION_COOKIE : PENDING_COOKIE);
  if (credential !== "none" && token === null) redirect("/login");
  const upload = body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      cache: "no-store",
      headers: {
        [ADMIN_KEY_HEADER]: adminKey,
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        ...(await clientHeaders()),
        ...(body === undefined || upload ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: upload ? body : JSON.stringify(body) }),
    });
  } catch {
    throw new AdminApiError("unreachable", "API'ye ulaşılamıyor.");
  }
  if (response.ok) return response;
  const error = await toError(response);
  if (error.code === "admin_session_invalid") redirect("/login");
  if (error.code === "admin_password_change_required") redirect("/account");
  // Rolünün göremediği bir bölümün adresi açıldıysa sayfa, hata yerine nedenini gösterir.
  if (error.code === "forbidden" && method === "GET") redirect("/forbidden");
  throw error;
}

/** Yönetim uç noktasından veri okur ve yanıtı sözleşmedeki şemayla doğrular. */
export async function adminGet<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  credential: Credential = "session",
): Promise<z.infer<Schema>> {
  const response = await send("GET", path, undefined, credential);
  return schema.parse(await response.json());
}

/** Yönetim uç noktasına değişiklik gönderir. */
export async function adminSend(
  method: "PUT" | "PATCH" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  credential: Credential = "session",
): Promise<void> {
  await send(method, path, body, credential);
}

/** Değişiklik gönderir ve API'nin döndürdüğü sonucu sözleşmedeki şemayla doğrular. */
export async function adminCall<Schema extends z.ZodType>(
  schema: Schema,
  method: "PUT" | "PATCH" | "POST",
  path: string,
  body?: unknown,
  credential: Credential = "session",
): Promise<z.infer<Schema>> {
  const response = await send(method, path, body, credential);
  return schema.parse(await response.json());
}

/** Genel bakış hem kenar çubuğunda hem ana sayfada kullanılır; aynı istekte bir kez okunur. */
export const getOverview = cache((): Promise<AdminOverview> =>
  adminGet(adminOverviewSchema, "/v1/admin/overview"),
);

/** Giriş yapmış hesap ve izinleri; kenar çubuğu, sayfalar ve işlevler aynı istekte bir kez okur. */
export const getMe = cache((): Promise<AdminMe> => adminGet(adminMeSchema, "/v1/admin/me"));
