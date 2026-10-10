import {
  businessParamsSchema,
  businessRecordParamsSchema,
  businessRegionAssignmentSchema,
  businessRegionBodySchema,
  businessRegionOperatorBodySchema,
  businessRegionUpdateSchema,
  orderGrantBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

/** All region mutations resolve the actor's business membership on the server. */
export function regionManagementRoutes(
  server: FastifyInstance,
  { services, guard }: RouteContext,
): void {
  const regions = services.regionManagement;
  server.get("/v1/business/:businessId/regions", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return regions.regions(await services.businessManagement.authorise(userId, businessId));
  });
  server.post("/v1/business/:businessId/regions", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const { name } = parse(businessRegionBodySchema, request.body);
    return regions.createRegion(
      await services.businessManagement.authorise(userId, businessId),
      name,
    );
  });
  server.put("/v1/business/:businessId/regions/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    const { name, expectedVersion } = parse(businessRegionUpdateSchema, request.body);
    return regions.renameRegion(
      await services.businessManagement.authorise(userId, businessId),
      id,
      name,
      expectedVersion,
    );
  });
  server.get("/v1/business/:businessId/regions/branches", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return regions.assignments(await services.businessManagement.authorise(userId, businessId));
  });
  server.put("/v1/business/:businessId/regions/branches/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return regions.assignBranch(
      await services.businessManagement.authorise(userId, businessId),
      id,
      parse(businessRegionAssignmentSchema, request.body),
    );
  });
  server.get("/v1/business/:businessId/regions/:id/operators", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return regions.operators(await services.businessManagement.authorise(userId, businessId), id);
  });
  server.put("/v1/business/:businessId/regions/:id/operators", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return regions.saveOperator(
      await services.businessManagement.authorise(userId, businessId),
      id,
      parse(businessRegionOperatorBodySchema, request.body),
    );
  });
  for (const kind of ["branch", "region"] as const) {
    const segment = kind === "branch" ? "branches" : "regions";
    server.get(`/v1/business/:businessId/${segment}/:id/order-grants`, async (request) => {
      const { userId } = await guard(request);
      const { businessId, id } = parse(businessRecordParamsSchema, request.params);
      return regions.orderGrants(
        await services.businessManagement.authorise(userId, businessId),
        kind,
        id,
      );
    });
    server.put(`/v1/business/:businessId/${segment}/:id/order-grants`, async (request) => {
      const { userId } = await guard(request);
      const { businessId, id } = parse(businessRecordParamsSchema, request.params);
      return regions.saveOrderGrant(
        await services.businessManagement.authorise(userId, businessId),
        kind,
        id,
        parse(orderGrantBodySchema, request.body),
      );
    });
  }
}
