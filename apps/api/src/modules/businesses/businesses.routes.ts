import { businessListQuerySchema, createBusinessBodySchema } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { idParamsSchema, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function businessRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { businesses } = services;

  server.get("/v1/businesses", async (request) => {
    await guard(request);
    const { category } = parse(businessListQuerySchema, request.query);
    return { items: await businesses.list(category) };
  });

  server.get("/v1/businesses/mine", async (request) => {
    const { userId } = await guard(request);
    return { items: await businesses.listOwned(userId) };
  });

  server.post("/v1/businesses", async (request) => {
    const { userId } = await guard(request);
    const body = parse(createBusinessBodySchema, request.body);
    return businesses.create(userId, body);
  });

  server.get("/v1/businesses/:id", async (request) => {
    await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    return businesses.get(id);
  });
}
