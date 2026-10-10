import {
  acceptOrderBodySchema,
  approveOperationDeviceBodySchema,
  businessParamsSchema,
  businessRecordParamsSchema,
  idSchema,
  liveReplayQuerySchema,
  orderListQuerySchema,
  pollDevicePairingBodySchema,
  rejectOrderBodySchema,
  updateOrderStatusBodySchema,
} from "@vado/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { bearerToken, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function operationDeviceRoutes(server: FastifyInstance, { services, guard }: RouteContext) {
  const { operationDevices, ordering, businessManagement, liveReplay } = services;
  const empty = z.object({}).strict();
  const idParams = z.object({ id: idSchema });
  async function business(request: FastifyRequest) {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return businessManagement.authorise(userId, businessId);
  }
  async function device(request: FastifyRequest) {
    const token = bearerToken(request);
    if (token === null) throw new AppError("unauthorized");
    return operationDevices.authenticate(token);
  }
  server.post(
    "/v1/device-pairings",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      parse(empty, request.body ?? {});
      return operationDevices.begin();
    },
  );
  server.post(
    "/v1/device-pairings/:id/poll",
    { config: { rateLimit: { max: 100, timeWindow: "1 minute" } } },
    async (request) =>
      operationDevices.poll(
        parse(idParams, request.params).id,
        parse(pollDevicePairingBodySchema, request.body).secret,
      ),
  );
  server.get("/v1/business/:businessId/devices", async (request) =>
    operationDevices.list(await business(request)),
  );
  server.post(
    "/v1/business/:businessId/devices",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request) =>
      operationDevices.approve(
        await business(request),
        parse(approveOperationDeviceBodySchema, request.body),
      ),
  );
  server.post("/v1/business/:businessId/devices/:id/revoke", async (request) => {
    parse(empty, request.body ?? {});
    return operationDevices.revoke(
      await business(request),
      parse(businessRecordParamsSchema, request.params).id,
    );
  });
  server.get("/v1/device/device", async (request) => operationDevices.info(await device(request)));
  server.get("/v1/device/queue", async (request) =>
    ordering.listQueue(await device(request), parse(orderListQuerySchema, request.query)),
  );
  server.get("/v1/device/orders", async (request) =>
    ordering.listOrders(await device(request), parse(orderListQuerySchema, request.query)),
  );
  server.get("/v1/device/orders/:id", async (request) =>
    ordering.getOrder(await device(request), parse(idParams, request.params).id),
  );
  server.post("/v1/device/orders/:id/accept", async (request) =>
    ordering.accept(
      await device(request),
      parse(idParams, request.params).id,
      parse(acceptOrderBodySchema, request.body),
    ),
  );
  server.post("/v1/device/orders/:id/reject", async (request) =>
    ordering.reject(
      await device(request),
      parse(idParams, request.params).id,
      parse(rejectOrderBodySchema, request.body),
    ),
  );
  server.put("/v1/device/orders/:id/status", async (request) =>
    ordering.updateStatus(
      await device(request),
      parse(idParams, request.params).id,
      parse(updateOrderStatusBodySchema, request.body),
    ),
  );
  server.post("/v1/device/socket-ticket", async (request) => {
    parse(empty, request.body ?? {});
    return operationDevices.issueTicket(await device(request));
  });
  server.get("/v1/device/live-events", async (request) =>
    liveReplay.replay(await device(request), parse(liveReplayQuerySchema, request.query).cursor),
  );
}
