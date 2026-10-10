import {
  businessListQuerySchema,
  businessParamsSchema,
  createBusinessBodySchema,
  MEDIA_MAX_BYTES,
  MEDIA_UPLOAD_FIELD,
  publishStudioBodySchema,
  saveStudioBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { idParamsSchema, parse, readUpload } from "../../core/http";
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

  server.get("/v1/business/:businessId/studio", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const scope = await services.businessManagement.authorise(userId, businessId);
    return businesses.studio(scope);
  });

  server.put("/v1/business/:businessId/studio", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const scope = await services.businessManagement.authorise(userId, businessId);
    return businesses.saveStudio(scope, parse(saveStudioBodySchema, request.body));
  });

  server.post("/v1/business/:businessId/studio/media", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const scope = await services.businessManagement.authorise(userId, businessId);
    const data = await readUpload(request, {
      field: MEDIA_UPLOAD_FIELD, maxBytes: MEDIA_MAX_BYTES,
      invalid: "media_invalid", tooLarge: "media_too_large",
    });
    return services.media.uploadBusiness(scope, data);
  });

  server.get("/v1/business/:businessId/studio/media/usage", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const scope = await services.businessManagement.authorise(userId, businessId);
    return services.media.businessUsage(scope);
  });

  server.post("/v1/business/:businessId/studio/media/prune", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const scope = await services.businessManagement.authorise(userId, businessId);
    return services.media.pruneBusiness(scope);
  });

  server.post("/v1/business/:businessId/studio/publish", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const scope = await services.businessManagement.authorise(userId, businessId);
    return businesses.publishStudio(scope, parse(publishStudioBodySchema, request.body));
  });

  server.get("/v1/businesses/:id", async (request) => {
    await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    return businesses.get(id);
  });
}
