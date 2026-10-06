import {
  acceptOrderBodySchema,
  approveKitchenDeviceBodySchema,
  businessParamsSchema,
  businessRecordParamsSchema,
  idSchema,
  liveReplayQuerySchema,
  orderListQuerySchema,
  pollKitchenPairingBodySchema,
  rejectOrderBodySchema,
  updateOrderStatusBodySchema,
} from "@vado/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { bearerToken, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function kitchenDeviceRoutes(server: FastifyInstance, { services, guard }: RouteContext) {
  const { kitchenDevices, ordering, businessManagement, liveReplay } = services;
  const empty = z.object({}).strict();
  const idParams = z.object({ id: idSchema });
  async function business(request: FastifyRequest) {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return businessManagement.authorise(userId, businessId);
  }
  async function kitchen(request: FastifyRequest) {
    const token = bearerToken(request);
    if (token === null) throw new AppError("unauthorized");
    return kitchenDevices.authenticate(token);
  }
  server.post(
    "/v1/kitchen-pairings",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      parse(empty, request.body ?? {});
      return kitchenDevices.begin();
    },
  );
  server.post(
    "/v1/kitchen-pairings/:id/poll",
    { config: { rateLimit: { max: 100, timeWindow: "1 minute" } } },
    async (request) =>
      kitchenDevices.poll(
        parse(idParams, request.params).id,
        parse(pollKitchenPairingBodySchema, request.body).secret,
      ),
  );
  server.get("/v1/business/:businessId/kitchen-devices", async (request) =>
    kitchenDevices.list(await business(request)),
  );
  server.post(
    "/v1/business/:businessId/kitchen-devices",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request) =>
      kitchenDevices.approve(
        await business(request),
        parse(approveKitchenDeviceBodySchema, request.body),
      ),
  );
  server.post("/v1/business/:businessId/kitchen-devices/:id/revoke", async (request) => {
    parse(empty, request.body ?? {});
    return kitchenDevices.revoke(
      await business(request),
      parse(businessRecordParamsSchema, request.params).id,
    );
  });
  server.get("/v1/kitchen/device", async (request) => kitchenDevices.info(await kitchen(request)));
  server.get("/v1/kitchen/queue", async (request) =>
    ordering.listQueue(await kitchen(request), parse(orderListQuerySchema, request.query)),
  );
  server.get("/v1/kitchen/orders", async (request) =>
    ordering.listOrders(await kitchen(request), parse(orderListQuerySchema, request.query)),
  );
  server.get("/v1/kitchen/orders/:id", async (request) =>
    ordering.getOrder(await kitchen(request), parse(idParams, request.params).id),
  );
  server.post("/v1/kitchen/orders/:id/accept", async (request) =>
    ordering.accept(
      await kitchen(request),
      parse(idParams, request.params).id,
      parse(acceptOrderBodySchema, request.body),
    ),
  );
  server.post("/v1/kitchen/orders/:id/reject", async (request) =>
    ordering.reject(
      await kitchen(request),
      parse(idParams, request.params).id,
      parse(rejectOrderBodySchema, request.body),
    ),
  );
  server.put("/v1/kitchen/orders/:id/status", async (request) =>
    ordering.updateStatus(
      await kitchen(request),
      parse(idParams, request.params).id,
      parse(updateOrderStatusBodySchema, request.body),
    ),
  );
  server.post("/v1/kitchen/socket-ticket", async (request) => {
    parse(empty, request.body ?? {});
    return kitchenDevices.issueTicket(await kitchen(request));
  });
  server.get("/v1/kitchen/live-events", async (request) =>
    liveReplay.replay(await kitchen(request), parse(liveReplayQuerySchema, request.query).cursor),
  );
}
