import {
  businessParamsSchema,
  businessRecordParamsSchema,
  courierMemberBodySchema,
  courierPaymentBodySchema,
  courierStepBodySchema,
  deliveryAssignmentBodySchema,
  liveReplayQuerySchema,
  locationKeySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";
export function courierRoutes(server: FastifyInstance, { services, guard }: RouteContext) {
  const provider = services.courier;
  server.post("/v1/courier/:businessId/socket-ticket", async (request) => {
    const { userId, sessionId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    parse(z.object({}).strict(), request.body ?? {});
    return provider.issueTicket(await provider.authorise(userId, businessId), sessionId);
  });
  server.get("/v1/courier/:businessId/live-events", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const { cursor } = parse(liveReplayQuerySchema, request.query);
    return provider.replay(await provider.authorise(userId, businessId), cursor);
  });
  server.get("/v1/business/:businessId/couriers", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return {
      items: await provider.members(
        await services.businessManagement.authorise(userId, businessId),
      ),
    };
  });
  server.post("/v1/business/:businessId/couriers", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const key = parse(locationKeySchema, request.headers["idempotency-key"]);
    const body = parse(courierMemberBodySchema, request.body);
    return provider.setMember(
      await services.businessManagement.authorise(userId, businessId),
      key,
      body,
    );
  });
  server.put("/v1/business/:businessId/orders/:id/delivery-assignment", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    const key = parse(locationKeySchema, request.headers["idempotency-key"]);
    const body = parse(deliveryAssignmentBodySchema, request.body);
    return provider.assign(
      await services.businessManagement.authorise(userId, businessId),
      id,
      key,
      body,
    );
  });
  server.get("/v1/courier/:businessId/jobs", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return { items: await provider.jobs(await provider.authorise(userId, businessId)) };
  });
  server.get("/v1/courier/:businessId/jobs/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return provider.job(await provider.authorise(userId, businessId), id);
  });
  for (const operation of ["depart", "deliver", "payment"] as const)
    server.post(`/v1/courier/:businessId/jobs/:id/${operation}`, async (request) => {
      const { userId } = await guard(request);
      const { businessId, id } = parse(businessRecordParamsSchema, request.params);
      const key = parse(locationKeySchema, request.headers["idempotency-key"]);
      const body = parse(
        operation === "payment" ? courierPaymentBodySchema : courierStepBodySchema,
        request.body,
      );
      return provider.mutate(
        await provider.authorise(userId, businessId),
        id,
        key,
        operation,
        body,
      );
    });
}
