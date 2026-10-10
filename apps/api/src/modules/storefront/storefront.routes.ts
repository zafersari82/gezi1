import { shellBusinessParamsSchema } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

/** Aynı vitrin bağlamını bütün sipariş sektörlerine sunar. */
export function storefrontRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { businessManagement, storefrontContext } = services;
  server.get("/v1/shell/:businessId/:appInstanceId/store", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId } = parse(shellBusinessParamsSchema, request.params);
    return storefrontContext(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
    );
  });
}
