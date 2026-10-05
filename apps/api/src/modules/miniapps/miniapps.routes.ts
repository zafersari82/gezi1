import { miniAppListQuerySchema } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { miniAppParamsSchema, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

/** Açık anahtar listesinin önbellekte kalabileceği süre; anahtar değişimi bundan uzun sürer. */
const IDENTITY_KEYS_MAX_AGE_SECONDS = 600;

export function miniAppRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { miniApps } = services;

  server.get("/v1/miniapps", async (request) => {
    await guard(request);
    const { category } = parse(miniAppListQuerySchema, request.query);
    return { items: await miniApps.list(category) };
  });

  server.get("/v1/miniapps/:id", async (request) => {
    await guard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    return miniApps.get(id);
  });

  server.get("/v1/miniapps/:id/identity", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    return miniApps.identity(userId, id);
  });

  server.post("/v1/miniapps/:id/identity-token", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    return miniApps.identityToken(userId, id);
  });

  // Mini uygulamaların sunucuları belirteci bu anahtarlarla doğrular; oturum gerekmez. Anahtar
  // değiştirildiğinde eskisi süresi dolana kadar listede kalır, yenisi hemen görünür.
  server.get("/v1/identity-keys", (_request, reply) => {
    void reply.header("cache-control", `public, max-age=${IDENTITY_KEYS_MAX_AGE_SECONDS}`);
    return miniApps.identityKeys();
  });
}
