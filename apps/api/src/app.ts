import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import {
  ADMIN_CLIENT_AGENT_HEADER,
  ADMIN_CLIENT_IP_HEADER,
  ADMIN_KEY_HEADER,
  MEDIA_MAX_BYTES,
  roleHasPermission,
  SCOPED_PERMISSIONS,
} from "@vado/contracts";
import Fastify, { type FastifyInstance } from "fastify";

import type { Config } from "./core/config";
import type { AppContext, Logger } from "./core/context";
import { type Database, sql } from "./core/database";
import { AppError } from "./core/errors";
import {
  type AdminGuard,
  type AdminKeyGuard,
  type AdminRoute,
  bearerToken,
  collectAdminRoutes,
  type Guard,
  loggerOptions,
  registerErrorHandling,
} from "./core/http";
import { createAppKeys } from "./core/keys";
import { APPS_ROUTE_PREFIX, createPackageUrls } from "./core/package-urls";
import { verifyDatabaseRoles } from "./core/platform-scope";
import { safeEqual } from "./core/security";
import { createLocalPackageStore } from "./providers/package-store";
import { createPushProvider, type PushProvider } from "./providers/push";
import { createSmsProvider, type SmsProvider } from "./providers/sms";
import { createLocalStorage, MEDIA_ROUTE_PREFIX } from "./providers/storage";
import { createRealtime } from "./realtime/realtime";
import { registerRoutes } from "./routes";
import { createServices, type Services } from "./services";

export const API_VERSION = "2.7.0";

const JSON_BODY_LIMIT_BYTES = 100_000;

export interface AppOptions {
  config: Config;
  db: Database;
  platformDb: Database;
  /** Verilmezse yapılandırmadaki sağlayıcı kullanılır; testler sahte sağlayıcı verir. */
  sms?: SmsProvider;
  /** Verilmezse yapılandırmadaki bildirim sağlayıcısı kullanılır; testler sahtesini verir. */
  push?: PushProvider;
  /** Verilmezse sunucunun günlüğü kullanılır; testler servislerin kayıtlarını görmek için verir. */
  log?: Logger;
}

export interface App {
  server: FastifyInstance;
  services: Services;
  /** Yönetim uçları ve bildirdikleri erişim; izin tablosu testi bu listeyi dolaşır. */
  adminRoutes: AdminRoute[];
  /** HTTP sunucusunu ve gerçek zamanlı bağlantıları kapatır. Veritabanını çağıran kapatır. */
  close: () => Promise<void>;
}

/** Uygulamayı kurar; dinlemeye başlamaz. Testler ve `main.ts` aynı kurulumu kullanır. */
export async function buildApp({
  config,
  db,
  platformDb,
  sms,
  push,
  log,
}: AppOptions): Promise<App> {
  await verifyDatabaseRoles(db, platformDb);
  const packageUrls = createPackageUrls(config.publicUrl, config.appsOrigin);
  const server = Fastify({
    logger: config.env === "test" ? false : loggerOptions(config.logLevel),
    trustProxy: config.trustProxy,
    bodyLimit: JSON_BODY_LIMIT_BYTES,
    // Bir uygulama kaydının alan adına gelen her istek o kaydın paket yoluna çevrilir; böylece bu
    // alan adlarından API'nin hiçbir uç noktasına ulaşılamaz.
    rewriteUrl(request) {
      const url = request.url ?? "/";
      const appId = packageUrls.appOfHost(request.headers.host);
      return appId === null ? url : `${APPS_ROUTE_PREFIX}${appId}${url}`;
    },
  });
  registerErrorHandling(server);

  await server.register(helmet, {
    // Medya dosyaları web önizlemesinde başka bir kaynaktan (origin) görüntülenir.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
  await server.register(cors, {
    origin: config.corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: [
      "authorization",
      "content-type",
      "idempotency-key",
      ADMIN_KEY_HEADER,
      ADMIN_CLIENT_IP_HEADER,
      ADMIN_CLIENT_AGENT_HEADER,
    ],
  });
  if (config.env !== "test") {
    await server.register(rateLimit, {
      max: config.rateLimitPerMinute,
      timeWindow: "1 minute",
      // Görseller ve paket dosyaları tek ekranda onlarca istek üretir; adresleri içerikle birlikte
      // değiştiği için önbelleğe alınırlar ve istek sınırına sayılmazlar.
      allowList: (request) =>
        request.url.startsWith(MEDIA_ROUTE_PREFIX) || request.url.startsWith(APPS_ROUTE_PREFIX),
    });
  }
  await server.register(multipart, {
    limits: { fileSize: MEDIA_MAX_BYTES, files: 1, fields: 0 },
  });

  const storage = await createLocalStorage(config.storageDir, config.publicUrl);
  await server.register(fastifyStatic, {
    root: storage.root,
    prefix: MEDIA_ROUTE_PREFIX,
    index: false,
    immutable: true,
    maxAge: "365d",
  });

  const realtime = createRealtime(config, server.log);
  const context: AppContext = {
    config,
    db,
    platformDb,
    log: log ?? server.log,
    keys: createAppKeys(config.keys),
    storage,
    packageStore: await createLocalPackageStore(config.packageDir),
    sms: sms ?? createSmsProvider(config.sms, server.log),
    push: push ?? createPushProvider(config.push, log ?? server.log),
    realtime,
  };
  const services = createServices(context);

  const guard: Guard = (request) => {
    const token = bearerToken(request);
    if (token === null) throw new AppError("unauthorized");
    return services.auth.authenticate(token, request.ip);
  };
  const verifiedGuard: Guard = async (request) => {
    const context = await guard(request);
    await services.auth.requireRecentVerification(context);
    return context;
  };

  // Yönetim uçlarında iki katman vardır: yönetici anahtarı isteğin panel sunucusundan geldiğini,
  // panel oturumu isteği yapan hesabı kanıtlar. İzin, ucun bildirdiği erişime göre denetlenir.
  const adminKeyGuard: AdminKeyGuard = (request) => {
    if (request.routeOptions.config.admin !== "public") {
      throw new Error(`Oturum gerektiren uçta yalnızca anahtar denetlendi: ${request.url}`);
    }
    requireAdminKey(request.headers[ADMIN_KEY_HEADER]);
  };
  const adminGuard: AdminGuard = async (request) => {
    const access = request.routeOptions.config.admin;
    if (access === undefined || access === "public") {
      throw new Error(`Uç, oturum gerektiren bir erişim bildirmiyor: ${request.url}`);
    }
    requireAdminKey(request.headers[ADMIN_KEY_HEADER]);
    const token = bearerToken(request);
    if (token === null) throw new AppError("admin_session_invalid");
    const context = await services.adminAccounts.authenticate(
      token,
      access === "second_factor" ? "second_factor" : "active",
    );
    if (access === "session" || access === "second_factor") return context;
    if (context.mustChangePassword) throw new AppError("admin_password_change_required");
    if (!roleHasPermission(context.role, access)) throw new AppError("forbidden");
    // Kapsamlı hesap yalnızca kapsamı uygulayan uçlara girer; rol tablosu yanlışlıkla
    // genişletilse bile bütün kayıtları gösteren bir uca erişemez.
    if (context.businessId !== null && !SCOPED_PERMISSIONS.includes(access)) {
      throw new AppError("forbidden");
    }
    return context;
  };
  function requireAdminKey(key: unknown): void {
    if (typeof key !== "string" || !safeEqual(key, config.adminApiKey)) {
      throw new AppError("admin_unauthorized");
    }
  }

  const adminRoutes = collectAdminRoutes(server);

  server.get("/health", async () => {
    await db.one(sql`select 1 as ok`);
    return { status: "ok", version: API_VERSION };
  });
  registerRoutes(server, { config, services, guard, verifiedGuard, adminGuard, adminKeyGuard });

  server.addHook("preClose", () => {
    realtime.disconnectAll();
  });
  server.addHook("onClose", async () => {
    await services.events.stop();
    await services.notifications.idle();
    await realtime.close();
  });

  await server.ready();
  await realtime.start(server.server, {
    authenticate: services.auth.authenticate,
    authenticateKitchenTicket: (ticket) => services.kitchenDevices.consumeTicket(ticket),
    isKitchenDeviceActive: (id) => services.kitchenDevices.isActive(id),
    authenticateBusinessTicket: services.businessSockets.consume,
    typingRecipients: services.chat.typingRecipients,
  });

  return { server, services, adminRoutes, close: () => server.close() };
}
