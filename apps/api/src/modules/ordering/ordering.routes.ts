import {
  branchPerformanceQuerySchema,
  businessParamsSchema,
  businessRecordParamsSchema,
  checkoutCartBodySchema,
  openCartBodySchema,
  orderListQuerySchema,
  replaceCartBodySchema,
  resetCartBodySchema,
  shellBusinessParamsSchema,
  shellCartParamsSchema,
  updateOrderStatusBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function orderingRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { ordering, businessManagement } = services;
  server.post("/v1/shell/:businessId/:appInstanceId/carts", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId } = parse(shellBusinessParamsSchema, request.params);
    const body = parse(openCartBodySchema, request.body);
    return ordering.openCart(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
      body.branchId,
      {
        addressId: body.addressId ?? null,
        fulfilment: body.fulfilment,
        context: body.context ?? null,
        scheduledAt: body.scheduledAt ?? null,
      },
    );
  });
  server.get("/v1/shell/:businessId/:appInstanceId/carts/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId, id } = parse(shellCartParamsSchema, request.params);
    return ordering.getCart(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
      id,
    );
  });
  server.put("/v1/shell/:businessId/:appInstanceId/carts/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId, id } = parse(shellCartParamsSchema, request.params);
    return ordering.replaceCart(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
      id,
      parse(replaceCartBodySchema, request.body),
    );
  });
  server.post("/v1/shell/:businessId/:appInstanceId/carts/:id/reset", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId, id } = parse(shellCartParamsSchema, request.params);
    return ordering.resetCart(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
      id,
      parse(resetCartBodySchema, request.body),
    );
  });
  server.post("/v1/shell/:businessId/:appInstanceId/carts/:id/checkout", async (request, reply) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId, id } = parse(shellCartParamsSchema, request.params);
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string")
      return reply
        .code(400)
        .send({ error: { code: "validation_failed", message: "Tekrar anahtarı gerekli." } });
    const result = await ordering.checkout(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
      id,
      key,
      parse(checkoutCartBodySchema, request.body),
    );
    return reply.code(result.status).send(result.body);
  });
  server.get("/v1/shell/:businessId/:appInstanceId/orders/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId, id } = parse(shellCartParamsSchema, request.params);
    return ordering.getOrder(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
      id,
    );
  });
  server.get("/v1/business/:businessId/orders", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return ordering.listOrders(
      await businessManagement.authorise(userId, businessId),
      parse(orderListQuerySchema, request.query),
    );
  });
  server.get("/v1/business/:businessId/orders/performance", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const { days } = parse(branchPerformanceQuerySchema, request.query);
    return ordering.branchPerformance(
      await businessManagement.authorise(userId, businessId),
      Number(days) as 7 | 30,
    );
  });
  server.get("/v1/business/:businessId/orders/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return ordering.getOrder(await businessManagement.authorise(userId, businessId), id);
  });
  server.put("/v1/business/:businessId/orders/:id/status", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return ordering.updateStatus(
      await businessManagement.authorise(userId, businessId),
      id,
      parse(updateOrderStatusBodySchema, request.body),
    );
  });
}
