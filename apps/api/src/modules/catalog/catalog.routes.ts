import {
  branchPriceBatchBodySchema,
  businessParamsSchema,
  businessRecordParamsSchema,
  catalogBranchQuerySchema,
  catalogCategoryBodySchema,
  catalogItemBodySchema,
  catalogOptionGroupBodySchema,
  catalogPriceBodySchema,
  catalogQuoteBodySchema,
  itemOptionGroupsBodySchema,
  shellBusinessParamsSchema,
  studioItemImageBodySchema,
  studioStarterCatalogBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function catalogRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { catalog, businessManagement } = services;
  server.post("/v1/business/:businessId/catalog/quote", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const body = parse(catalogQuoteBodySchema, request.body);
    return catalog.preview(
      await businessManagement.authorise(userId, businessId),
      body.branchId,
      body.lines,
    );
  });
  server.get("/v1/shell/:businessId/:appInstanceId/catalog", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId } = parse(shellBusinessParamsSchema, request.params);
    const { branchId, includeUnavailable, at } = parse(catalogBranchQuerySchema, request.query);
    return catalog.customerCatalog(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
      branchId,
      { includeUnavailable, at },
    );
  });
  server.get("/v1/business/:businessId/catalog", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return catalog.get(await businessManagement.authorise(userId, businessId));
  });
  server.post("/v1/business/:businessId/catalog/starter-items", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const body = parse(studioStarterCatalogBodySchema, request.body);
    return catalog.importStarterItems(await businessManagement.authorise(userId, businessId), body);
  });
  server.post("/v1/business/:businessId/catalog/categories", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return catalog.saveCategory(
      await businessManagement.authorise(userId, businessId),
      parse(catalogCategoryBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/catalog/categories/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return catalog.saveCategory(
      await businessManagement.authorise(userId, businessId),
      parse(catalogCategoryBodySchema, request.body),
      id,
    );
  });
  server.post("/v1/business/:businessId/catalog/items", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return catalog.saveItem(
      await businessManagement.authorise(userId, businessId),
      parse(catalogItemBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/catalog/items/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return catalog.saveItem(
      await businessManagement.authorise(userId, businessId),
      parse(catalogItemBodySchema, request.body),
      id,
    );
  });
  server.put("/v1/business/:businessId/catalog/items/:id/image", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return catalog.setItemImage(
      await businessManagement.authorise(userId, businessId),
      id, parse(studioItemImageBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/catalog/branch-prices", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return catalog.saveBranchPrices(
      await businessManagement.authorise(userId, businessId),
      parse(branchPriceBatchBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/catalog/items/:id/prices", async (request, reply) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    await catalog.savePrice(
      await businessManagement.authorise(userId, businessId),
      id,
      parse(catalogPriceBodySchema, request.body),
    );
    return noContent(reply);
  });
  server.put("/v1/business/:businessId/catalog/items/:id/option-groups", async (request, reply) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    await catalog.setOptionGroups(
      await businessManagement.authorise(userId, businessId),
      id,
      parse(itemOptionGroupsBodySchema, request.body).groupIds,
    );
    return noContent(reply);
  });
  server.post("/v1/business/:businessId/catalog/option-groups", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return catalog.saveOptionGroup(
      await businessManagement.authorise(userId, businessId),
      parse(catalogOptionGroupBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/catalog/option-groups/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return catalog.saveOptionGroup(
      await businessManagement.authorise(userId, businessId),
      parse(catalogOptionGroupBodySchema, request.body),
      id,
    );
  });
}
