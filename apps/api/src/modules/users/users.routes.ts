import { updateMeBodySchema, userSearchQuerySchema } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { idParamsSchema, noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function userRoutes(
  server: FastifyInstance,
  { services, guard, verifiedGuard }: RouteContext,
): void {
  const { users } = services;

  server.get("/v1/me", async (request) => {
    const { userId } = await guard(request);
    return users.getMe(userId);
  });

  server.patch("/v1/me", async (request) => {
    const { userId } = await guard(request);
    const body = parse(updateMeBodySchema, request.body);
    return users.updateMe(userId, body);
  });

  server.delete("/v1/me", async (request, reply) => {
    const { userId } = await verifiedGuard(request);
    await users.deleteMe(userId);
    return noContent(reply);
  });

  server.get("/v1/users/search", async (request) => {
    const { userId } = await guard(request);
    const { q } = parse(userSearchQuerySchema, request.query);
    return { items: await users.search(userId, q) };
  });

  server.get("/v1/users/:id", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    return users.getProfile(userId, id);
  });
}
