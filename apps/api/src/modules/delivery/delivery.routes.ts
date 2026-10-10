import {
  deliveryQuoteBodySchema,
  deliveryRegionBodySchema,
  idSchema,
  shellBusinessParamsSchema,
  shellCartParamsSchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";
export function deliveryRoutes(server: FastifyInstance, { services, guard }: RouteContext) {
  server.post("/v1/shell/:businessId/:appInstanceId/delivery-quote", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId } = parse(shellBusinessParamsSchema, request.params);
    const body = parse(deliveryQuoteBodySchema, request.body);
    return services.delivery.quote(
      await services.businessManagement.customerScope(userId, businessId, appInstanceId),
      body,
    );
  });
  server.get(
    "/v1/shell/:businessId/:appInstanceId/orders/:id/delivery-snapshot",
    async (request) => {
      const { userId } = await guard(request);
      const { businessId, appInstanceId, id } = parse(shellCartParamsSchema, request.params);
      return services.delivery.snapshot(
        await services.businessManagement.customerScope(userId, businessId, appInstanceId),
        id,
      );
    },
  );
  server.put(
    "/v1/business/:businessId/branches/:branchId/delivery-regions/:id",
    async (request) => {
      const { userId } = await guard(request);
      const { businessId, branchId, id } = parse(
        z.object({ businessId: idSchema, branchId: idSchema, id: idSchema }),
        request.params,
      );
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string") throw new AppError("validation_failed");
      return services.delivery.setRegion(
        await services.businessManagement.authorise(userId, businessId),
        branchId,
        id,
        key,
        parse(deliveryRegionBodySchema, request.body),
      );
    },
  );
}
