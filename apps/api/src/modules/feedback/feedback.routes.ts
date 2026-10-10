import {
  businessParamsSchema,
  businessRecordParamsSchema,
  favoriteBodySchema,
  idempotencyKeySchema,
  pageQuerySchema,
  reviewBodySchema,
  reviewEditBodySchema,
  reviewReplyBodySchema,
  shellBusinessParamsSchema,
  shellCartParamsSchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";
export function feedbackRoutes(server: FastifyInstance, { services, guard }: RouteContext) {
  const { feedback, businessManagement } = services;
  server.get("/v1/shell/:businessId/:appInstanceId/reviews", async (request) => {
    const { userId } = await guard(request),
      p = parse(shellBusinessParamsSchema, request.params);
    return feedback.listReviews(
      await businessManagement.customerScope(userId, p.businessId, p.appInstanceId),
      parse(pageQuerySchema, request.query),
    );
  });
  server.post("/v1/shell/:businessId/:appInstanceId/orders/:id/review", async (request) => {
    const { userId } = await guard(request),
      p = parse(shellCartParamsSchema, request.params);
    return feedback.createReview(
      await businessManagement.customerScope(userId, p.businessId, p.appInstanceId),
      p.id,
      parse(idempotencyKeySchema, request.headers["idempotency-key"]),
      parse(reviewBodySchema, request.body),
    );
  });
  server.put("/v1/shell/:businessId/:appInstanceId/reviews/:id", async (request) => {
    const { userId } = await guard(request),
      p = parse(shellCartParamsSchema, request.params);
    return feedback.editReview(
      await businessManagement.customerScope(userId, p.businessId, p.appInstanceId),
      p.id,
      parse(idempotencyKeySchema, request.headers["idempotency-key"]),
      parse(reviewEditBodySchema, request.body),
    );
  });
  server.get("/v1/business/:businessId/reviews", async (request) => {
    const { userId } = await guard(request),
      p = parse(businessParamsSchema, request.params);
    return feedback.listReviews(
      await businessManagement.authorise(userId, p.businessId),
      parse(pageQuerySchema, request.query),
      true,
    );
  });
  server.put("/v1/business/:businessId/reviews/:id/reply", async (request) => {
    const { userId } = await guard(request),
      p = parse(businessRecordParamsSchema, request.params);
    return feedback.editReview(
      await businessManagement.authorise(userId, p.businessId),
      p.id,
      parse(idempotencyKeySchema, request.headers["idempotency-key"]),
      parse(reviewReplyBodySchema, request.body),
    );
  });
  server.get("/v1/shell/:businessId/:appInstanceId/favorites", async (request) => {
    const { userId } = await guard(request),
      p = parse(shellBusinessParamsSchema, request.params);
    return feedback.listFavorites(
      await businessManagement.customerScope(userId, p.businessId, p.appInstanceId),
      parse(pageQuerySchema, request.query),
    );
  });
  server.put("/v1/shell/:businessId/:appInstanceId/favorites", async (request) => {
    const { userId } = await guard(request),
      p = parse(shellBusinessParamsSchema, request.params);
    return feedback.saveFavorite(
      await businessManagement.customerScope(userId, p.businessId, p.appInstanceId),
      parse(idempotencyKeySchema, request.headers["idempotency-key"]),
      parse(favoriteBodySchema, request.body),
    );
  });
}
