import { discoveryQuerySchema } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

/** Filtre ve imleç birlikte doğrulanır; oturum şartı diğer Keşfet uçlarıyla aynıdır. */
export function discoveryRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  server.get("/v1/discovery/search", async (request) => {
    const { userId } = await guard(request);
    return services.discovery.search(parse(discoveryQuerySchema, request.query), userId);
  });
}
