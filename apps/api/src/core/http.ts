import {
  type AdminPermission,
  type AdminRole,
  type ApiErrorBody,
  ERROR_MESSAGES,
  type ErrorCode,
  idSchema,
  miniAppIdSchema,
} from "@vado/contracts";
import type { FastifyInstance, FastifyLoggerOptions, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError, StartupError } from "./errors";

/** Kimliği doğrulanmış isteğin sahibi. */
export interface AuthContext {
  userId: string;
  sessionId: string;
}

/** İsteğin oturumunu doğrular; geçersizse `unauthorized` hatası fırlatır. */
export type Guard = (request: FastifyRequest) => Promise<AuthContext>;

/** Panel oturumunun aşaması: parola geçildi ve ikinci adım bekleniyor, ya da oturum açık. */
export type AdminSessionStage = "second_factor" | "active";

/** Yönetim isteğinin sahibi; `actor` denetim kaydına ve inceleme kararlarına yazılır. */
export interface AdminContext {
  /** Hesabın kimliği; denetim kaydına ve "kim yaptı" sütunlarına bu yazılır. */
  actor: string;
  accountId: string;
  sessionId: string;
  role: AdminRole;
  /**
   * Hesabın kapsamı: işletme hesabında bağlı olduğu işletme, VADO ekibinin hesaplarında `null`.
   * Kapsamı uygulayan uçlar (bkz. `SCOPED_PERMISSIONS`) kayıtları buna göre süzer.
   */
  businessId: string | null;
  mustChangePassword: boolean;
}

/**
 * Bir yönetim ucunun istediği erişim. Her `/v1/admin/` ucu bunu rota ayarında (`config.admin`)
 * bildirir; bildirmeyen uç kaydedilemez (bkz. app.ts).
 *
 * - bir izin (`packages.review` gibi): açık oturum ve hesabın rolünde bu izin
 * - `session`: açık oturum, izin gerekmez (kendi hesabım, çıkış)
 * - `second_factor`: parolası geçilmiş, ikinci adımı bekleyen yarım oturum
 * - `public`: oturum gerekmez (giriş); yönetici anahtarı yine gerekir
 */
export type AdminAccess = AdminPermission | "session" | "second_factor" | "public";

declare module "fastify" {
  interface FastifyContextConfig {
    admin?: AdminAccess;
  }
}

/** Yönetim isteğini, ucun bildirdiği erişime göre doğrular: yönetici anahtarı, oturum ve izin. */
export type AdminGuard = (request: FastifyRequest) => Promise<AdminContext>;

/** Yalnızca yönetici anahtarını doğrular; oturum gerektirmeyen giriş uçları için. */
export type AdminKeyGuard = (request: FastifyRequest) => void;

/** Yönetim ucunun yöntemi, adresi ve bildirdiği erişim; izin tablosu testi bu listeyi dolaşır. */
export interface AdminRoute {
  method: string;
  url: string;
  access: AdminAccess;
}

/** Bu önekle başlayan her uç, gerektirdiği erişimi bildirmek zorundadır (`config.admin`). */
const ADMIN_ROUTE_PREFIX = "/v1/admin/";

/**
 * Yönetim uçlarını kaydedilirken toplar. Erişim bildirmeyen bir yönetim ucu kaydedilemez:
 * uygulama hiç başlamaz. Rotalardan önce çağrılmalıdır.
 */
export function collectAdminRoutes(server: FastifyInstance): AdminRoute[] {
  const routes: AdminRoute[] = [];
  server.addHook("onRoute", (route) => {
    if (!route.url.startsWith(ADMIN_ROUTE_PREFIX)) return;
    const access = route.config?.admin;
    if (access === undefined) {
      throw new StartupError(`Yönetim ucu gerektirdiği erişimi bildirmiyor: ${route.url}`);
    }
    for (const method of [route.method].flat()) {
      if (method !== "HEAD") routes.push({ method, url: route.url, access });
    }
  });
  return routes;
}

/** Rota ayarı olarak yazılır: `server.get(url, adminAccess("users.read"), …)`. */
export function adminAccess(access: AdminAccess) {
  return { config: { admin: access } };
}

export const idParamsSchema = z.object({ id: idSchema });
export const miniAppParamsSchema = z.object({ id: miniAppIdSchema });

/** Şemanın kendi iletisi olmayan alanlar için Zod'un Türkçe hata iletileri. */
export const turkishErrors = z.locales.tr().localeError;

/**
 * Girdiyi şemayla doğrular; uymuyorsa alan bazında ayrıntıyla `validation_failed` fırlatır.
 * Şemanın kendi iletisi olmayan alanlarda neden Türkçe yazılır.
 */
export function parse<Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> {
  const result = schema.safeParse(input, { error: turkishErrors });
  if (result.success) return result.data;
  throw new AppError(
    "validation_failed",
    result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token === "" ? null : token;
}

export function noContent(reply: FastifyReply): FastifyReply {
  return reply.code(204).send();
}

/** @fastify/multipart, dosya boyut sınırı aşıldığında bu kodla hata fırlatır. */
const FILE_TOO_LARGE = "FST_REQ_FILE_TOO_LARGE";

export interface UploadRules {
  /** Dosyanın çok parçalı istekte bulunduğu alanın adı. */
  field: string;
  maxBytes: number;
  /** İstek çok parçalı değilse ya da dosya beklenen alanda gelmediyse fırlatılacak hata. */
  invalid: ErrorCode;
  tooLarge: ErrorCode;
}

/** Çok parçalı istekle yüklenen tek dosyayı okur; sınırı aşan dosya belleğe alınmaz. */
export async function readUpload(request: FastifyRequest, rules: UploadRules): Promise<Buffer> {
  if (!request.isMultipart()) throw new AppError(rules.invalid);
  const file = await request.file({ limits: { fileSize: rules.maxBytes } });
  if (file?.fieldname !== rules.field) throw new AppError(rules.invalid);

  try {
    return await file.toBuffer();
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    if (code === FILE_TOO_LARGE) throw new AppError(rules.tooLarge);
    throw error;
  }
}

/**
 * Sunucu günlüğünün ayarları. İstek adresinin sorgu bölümü (`?q=…`) günlüğe yazılmaz:
 * arama uç noktalarında telefon numarası gibi kişisel veri taşır.
 */
export function loggerOptions(level: string): FastifyLoggerOptions {
  return {
    level,
    serializers: {
      req: (request) => ({
        method: request.method,
        url: request.url.split("?", 1)[0],
        host: request.host,
        remoteAddress: request.ip,
        remotePort: request.socket.remotePort,
      }),
    },
  };
}

function errorBody(code: ErrorCode, details?: unknown): ApiErrorBody {
  const error = { code, message: ERROR_MESSAGES[code] };
  return { error: details === undefined ? error : { ...error, details } };
}

function statusCodeOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  return typeof error.statusCode === "number" ? error.statusCode : null;
}

/** Tüm hataları sözleşmedeki tek biçime (`{ error: { code, message } }`) çevirir. */
export function registerErrorHandling(server: FastifyInstance): void {
  server.setNotFoundHandler((_request, reply) => reply.code(404).send(errorBody("not_found")));

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.details));
    }

    const statusCode = statusCodeOf(error);
    if (statusCode === 429) return reply.code(429).send(errorBody("rate_limited"));
    if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send(errorBody("validation_failed"));
    }

    request.log.error(error);
    return reply.code(500).send(errorBody("internal_error"));
  });
}
