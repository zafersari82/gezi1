import {
  acceptOrderBodySchema,
  businessParamsSchema,
  businessRecordParamsSchema,
  catalogBranchQuerySchema,
  expectedVersionSchema,
  joinTableSessionBodySchema,
  liveReplayQuerySchema,
  orderListQuerySchema,
  recordOrderPaymentBodySchema,
  rejectOrderBodySchema,
  restaurantTableBodySchema,
  shellBusinessParamsSchema,
  shellCartParamsSchema,
  tableRequestBodySchema,
  updateRestaurantTableBodySchema,
} from "@vado/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function restaurantRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { restaurant, ordering, businessManagement } = services;
  const version = z.object({ expectedVersion: expectedVersionSchema }).strict();
  async function shell(request: FastifyRequest) {
    const { userId } = await guard(request);
    const { businessId, appInstanceId } = parse(shellBusinessParamsSchema, request.params);
    return businessManagement.customerScope(userId, businessId, appInstanceId);
  }
  async function business(request: FastifyRequest) {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return businessManagement.authorise(userId, businessId);
  }
  server.get("/v1/business/:businessId/live-events", async (request) =>
    services.liveReplay.replay(
      await business(request),
      parse(liveReplayQuerySchema, request.query).cursor,
    ),
  );
  server.get("/v1/shell/:businessId/:appInstanceId/live-events", async (request) =>
    services.liveReplay.replay(
      await shell(request),
      parse(liveReplayQuerySchema, request.query).cursor,
    ),
  );
  server.get("/v1/shell/:businessId/:appInstanceId/restaurant", async (request) =>
    services.storefrontContext(await shell(request)),
  );
  server.get("/v1/shell/:businessId/:appInstanceId/fulfilment-slots", async (request) =>
    restaurant.slots(await shell(request), parse(catalogBranchQuerySchema, request.query).branchId),
  );
  server.get("/v1/shell/:businessId/:appInstanceId/orders", async (request) =>
    ordering.listOrders(await shell(request), parse(orderListQuerySchema, request.query)),
  );
  server.post("/v1/shell/:businessId/:appInstanceId/table-sessions", async (request) =>
    restaurant.join(await shell(request), parse(joinTableSessionBodySchema, request.body).qr),
  );
  server.get("/v1/shell/:businessId/:appInstanceId/table-sessions/:id", async (request) =>
    restaurant.getSession(await shell(request), parse(shellCartParamsSchema, request.params).id),
  );
  server.get("/v1/shell/:businessId/:appInstanceId/table-sessions/:id/bill", async (request) =>
    restaurant.bill(await shell(request), parse(shellCartParamsSchema, request.params).id),
  );
  server.post(
    "/v1/shell/:businessId/:appInstanceId/table-sessions/:id/requests",
    async (request, reply) => {
      const scope = await shell(request);
      const { id } = parse(shellCartParamsSchema, request.params);
      const { kind } = parse(tableRequestBodySchema, request.body);
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string") throw new AppError("validation_failed");
      const result = await restaurant.request(scope, id, kind, key);
      return reply.code(result.status).send(result.body);
    },
  );
  server.get("/v1/business/:businessId/kitchen-queue", async (request) =>
    ordering.listQueue(await business(request), parse(orderListQuerySchema, request.query)),
  );
  server.get("/v1/business/:businessId/tables", async (request) =>
    restaurant.tables(await business(request)),
  );
  server.post("/v1/business/:businessId/tables", async (request) =>
    restaurant.createTable(await business(request), parse(restaurantTableBodySchema, request.body)),
  );
  server.put("/v1/business/:businessId/tables/:id", async (request) =>
    restaurant.updateTable(
      await business(request),
      parse(businessRecordParamsSchema, request.params).id,
      parse(updateRestaurantTableBodySchema, request.body),
    ),
  );
  server.post("/v1/business/:businessId/tables/:id/qr", async (request) => {
    parse(z.object({}).strict(), request.body ?? {});
    return restaurant.tableQr(
      await business(request),
      parse(businessRecordParamsSchema, request.params).id,
    );
  });
  server.get("/v1/business/:businessId/table-requests", async (request) =>
    restaurant.requests(await business(request)),
  );
  server.post("/v1/business/:businessId/table-requests/:id/resolve", async (request) =>
    restaurant.resolveRequest(
      await business(request),
      parse(businessRecordParamsSchema, request.params).id,
      parse(version, request.body).expectedVersion,
    ),
  );
  server.get("/v1/business/:businessId/table-sessions/:id/bill", async (request) =>
    restaurant.bill(await business(request), parse(businessRecordParamsSchema, request.params).id),
  );
  server.post("/v1/business/:businessId/table-sessions/:id/close", async (request) =>
    restaurant.closeSession(
      await business(request),
      parse(businessRecordParamsSchema, request.params).id,
      parse(version, request.body).expectedVersion,
    ),
  );
  server.post("/v1/business/:businessId/orders/:id/accept", async (request) =>
    ordering.accept(
      await business(request),
      parse(businessRecordParamsSchema, request.params).id,
      parse(acceptOrderBodySchema, request.body),
    ),
  );
  server.post("/v1/business/:businessId/orders/:id/reject", async (request) =>
    ordering.reject(
      await business(request),
      parse(businessRecordParamsSchema, request.params).id,
      parse(rejectOrderBodySchema, request.body),
    ),
  );
  server.post("/v1/business/:businessId/orders/:id/payment", async (request) =>
    ordering.recordPayment(
      await business(request),
      parse(businessRecordParamsSchema, request.params).id,
      parse(recordOrderPaymentBodySchema, request.body),
    ),
  );
}
