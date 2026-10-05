import { createPaymentBodySchema, pageQuerySchema } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { idParamsSchema, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function paymentRoutes(
  server: FastifyInstance,
  { services, guard, verifiedGuard }: RouteContext,
): void {
  const { payments } = services;

  server.get("/v1/payments", async (request) => {
    const { userId } = await guard(request);
    const page = parse(pageQuerySchema, request.query);
    return payments.list(userId, page);
  });

  server.post("/v1/payments", async (request) => {
    const { userId } = await guard(request);
    const body = parse(createPaymentBodySchema, request.body);
    return payments.create(userId, body);
  });

  server.get("/v1/payments/:id", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    return payments.get(userId, id);
  });

  server.post("/v1/payments/:id/confirm", async (request) => {
    const { userId } = await verifiedGuard(request);
    const { id } = parse(idParamsSchema, request.params);
    return payments.confirm(userId, id);
  });

  server.post("/v1/payments/:id/cancel", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    return payments.cancel(userId, id);
  });
}
