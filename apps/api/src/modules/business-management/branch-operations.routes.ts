import {
  branchAvailabilityBatchBodySchema,
  branchAvailabilityGrantBodySchema,
  branchHoursExceptionBodySchema,
  branchOrderingSettingsBodySchema,
  businessRecordParamsSchema,
  catalogBranchQuerySchema,
  itemAvailabilityBodySchema,
  menuWindowsBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function branchOperationsRoutes(
  server: FastifyInstance,
  { services, guard }: RouteContext,
): void {
  const operations = services.branchOperations;
  server.get("/v1/business/:businessId/branches/availability-access/me", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(
      businessRecordParamsSchema.pick({ businessId: true }),
      request.params,
    );
    return operations.accessibleBranches(
      await services.businessManagement.authorise(userId, businessId),
    );
  });
  server.get("/v1/business/:businessId/branches/:id/availability-grants", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return operations.grants(await services.businessManagement.authorise(userId, businessId), id);
  });
  server.put("/v1/business/:businessId/branches/:id/availability-grants", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return operations.saveGrant(
      await services.businessManagement.authorise(userId, businessId),
      id,
      parse(branchAvailabilityGrantBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/branches/availability-batch", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(
      businessRecordParamsSchema.pick({ businessId: true }),
      request.params,
    );
    return operations.saveAvailabilityBatch(
      await services.businessManagement.authorise(userId, businessId),
      parse(branchAvailabilityBatchBodySchema, request.body),
    );
  });
  for (const resource of ["ordering-settings", "hours-exceptions", "availability"] as const) {
    server.get(`/v1/business/:businessId/branches/:id/${resource}`, async (request) => {
      const { userId } = await guard(request);
      const { businessId, id } = parse(businessRecordParamsSchema, request.params);
      const scope = await services.businessManagement.authorise(userId, businessId);
      if (resource === "ordering-settings") return operations.settings(scope, id);
      if (resource === "hours-exceptions") return operations.exceptions(scope, id);
      return operations.availability(scope, id);
    });
  }
  server.put("/v1/business/:businessId/branches/:id/ordering-settings", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return operations.saveSettings(
      await services.businessManagement.authorise(userId, businessId),
      id,
      parse(branchOrderingSettingsBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/branches/:id/hours-exceptions", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return operations.saveException(
      await services.businessManagement.authorise(userId, businessId),
      id,
      parse(branchHoursExceptionBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/catalog/items/:id/availability", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return operations.saveAvailability(
      await services.businessManagement.authorise(userId, businessId),
      id,
      parse(itemAvailabilityBodySchema, request.body),
    );
  });
  for (const kind of ["item", "category"] as const) {
    const path = `/v1/business/:businessId/catalog/${kind === "item" ? "items" : "categories"}/:id/menu-windows`;
    server.get(path, async (request) => {
      const { userId } = await guard(request);
      const { businessId, id } = parse(businessRecordParamsSchema, request.params);
      const { branchId } = parse(catalogBranchQuerySchema, request.query);
      return operations.menuWindows(
        await services.businessManagement.authorise(userId, businessId),
        branchId,
        id,
        kind,
      );
    });
    server.put(path, async (request) => {
      const { userId } = await guard(request);
      const { businessId, id } = parse(businessRecordParamsSchema, request.params);
      return operations.saveMenuWindows(
        await services.businessManagement.authorise(userId, businessId),
        id,
        kind,
        parse(menuWindowsBodySchema, request.body),
      );
    });
  }
}
