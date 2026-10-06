import {
  businessRecordParamsSchema,
  capabilitySettingBodySchema,
  engineCapabilityIdSchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

const capabilityParams = businessRecordParamsSchema.extend({
  capabilityId: engineCapabilityIdSchema,
});
export function capabilityRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  server.get("/v1/capabilities", () => services.capabilities.catalog());
  server.get("/v1/business/:businessId/app-instances/:id/capabilities", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return services.capabilities.get(
      await services.businessManagement.authorise(userId, businessId),
      id,
    );
  });
  server.put(
    "/v1/business/:businessId/app-instances/:id/capabilities/:capabilityId",
    async (request) => {
      const { userId } = await guard(request);
      const { businessId, id, capabilityId } = parse(capabilityParams, request.params);
      return services.capabilities.set(
        await services.businessManagement.authorise(userId, businessId),
        id,
        capabilityId,
        parse(capabilitySettingBodySchema, request.body),
      );
    },
  );
}
