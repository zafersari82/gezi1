import { miniAppListQuerySchema } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { miniAppParamsSchema, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

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
}
