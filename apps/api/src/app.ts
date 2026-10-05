import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { ADMIN_KEY_HEADER, MEDIA_MAX_BYTES } from "@vado/contracts";
import Fastify, { type FastifyInstance } from "fastify";

import { ADMIN_ACTOR } from "./core/audit";
import type { Config } from "./core/config";
import type { AppContext, Logger } from "./core/context";
import { type Database, sql } from "./core/database";
import { AppError } from "./core/errors";
import {
  type AdminGuard,
  bearerToken,
  type Guard,
  loggerOptions,
  registerErrorHandling,
} from "./core/http";
import { createAppKeys } from "./core/keys";
import { APPS_ROUTE_PREFIX, createPackageUrls } from "./core/package-urls";
import { safeEqual } from "./core/security";
import { createLocalPackageStore } from "./providers/package-store";
import { createSmsProvider, type SmsProvider } from "./providers/sms";
import { createLocalStorage, MEDIA_ROUTE_PREFIX } from "./providers/storage";
import { createRealtime } from "./realtime/realtime";
import { registerRoutes } from "./routes";
import { createServices, type Services } from "./services";

export const API_VERSION = "2.3.1";

const JSON_BODY_LIMIT_BYTES = 100_000;

export interface AppOptions {
  config: Config;
  db: Database;
  /** Verilmezse yapılandırmadaki sağlayıcı kullanılır; testler sahte sağlayıcı verir. */
  sms?: SmsProvider;
  /** Verilmezse sunucunun günlüğü kullanılır; testler servislerin kayıtlarını görmek için verir. */
  log?: Logger;
}

export interface App {
  server: FastifyInstance;
  services: Services;
  /** HTTP sunucusunu ve gerçek zamanlı bağlantıları kapatır. Veritabanını çağıran kapatır. */
  close: () => Promise<void>;
}

/** Uygulamayı kurar; dinlemeye başlamaz. Testler ve `main.ts` aynı kurulumu kullanır. */
export async function buildApp({ config, db, sms, log }: AppOptions): Promise<App> {
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
    allowedHeaders: ["authorization", "content-type", ADMIN_KEY_HEADER],
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
    log: log ?? server.log,
    keys: createAppKeys(config.keys),
    storage,
    packageStore: await createLocalPackageStore(config.packageDir),
    sms: sms ?? createSmsProvider(config.sms, server.log),
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
  const adminGuard: AdminGuard = (request) => {
    const key = request.headers[ADMIN_KEY_HEADER];
    if (typeof key !== "string" || !safeEqual(key, config.adminApiKey)) {
      throw new AppError("admin_unauthorized");
    }
    return { actor: ADMIN_ACTOR };
  };

  server.get("/health", async () => {
    await db.one(sql`select 1 as ok`);
    return { status: "ok", version: API_VERSION };
  });
  registerRoutes(server, { config, services, guard, verifiedGuard, adminGuard });

  server.addHook("preClose", () => {
    realtime.disconnectAll();
  });
  server.addHook("onClose", () => realtime.close());

  await server.ready();
  await realtime.start(server.server, {
    authenticate: services.auth.authenticate,
    typingRecipients: services.chat.typingRecipients,
  });

  return { server, services, close: () => server.close() };
}
