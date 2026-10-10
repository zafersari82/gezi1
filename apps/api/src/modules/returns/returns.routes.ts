import {
  businessParamsSchema,
  businessRecordParamsSchema,
  idempotencyKeySchema,
  pageQuerySchema,
  reorderBodySchema,
  returnDecisionBodySchema,
  returnRequestBodySchema,
  returnWithdrawBodySchema,
  shellCartParamsSchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

// İşletme iade listesi zaman + UUID imleci kullanır; sayısal liste imleci geçerli değildir.
const returnCursorSchema = z.string().refine((cursor) => {
  const [timestamp, id, extra] = cursor.split("|");
  return (
    extra === undefined &&
    timestamp !== undefined &&
    z.iso.datetime().safeParse(timestamp).success &&
    z.uuid().safeParse(id).success
  );
});
const businessReturnsQuerySchema = pageQuerySchema.omit({ cursor: true }).extend({
  cursor: returnCursorSchema.optional(),
  status: z.enum(["pending", "approved", "rejected", "withdrawn"]).optional(),
});

export function returnRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { returns, ordering, businessManagement } = services;
  const key = (request: { headers: Record<string, unknown> }) =>
    parse(idempotencyKeySchema, request.headers["idempotency-key"]);
  server.post("/v1/shell/:businessId/:appInstanceId/orders/:id/returns", async (request) => {
    const { userId } = await guard(request);
    const p = parse(shellCartParamsSchema, request.params);
    return returns.create(
      await businessManagement.customerScope(userId, p.businessId, p.appInstanceId),
      p.id,
      key(request),
      parse(returnRequestBodySchema, request.body),
    );
  });
  server.get("/v1/shell/:businessId/:appInstanceId/orders/:id/returns", async (request) => {
    const { userId } = await guard(request);
    const p = parse(shellCartParamsSchema, request.params);
    return returns.list(
      await businessManagement.customerScope(userId, p.businessId, p.appInstanceId),
      p.id,
    );
  });
  server.post("/v1/shell/:businessId/:appInstanceId/returns/:id/withdraw", async (request) => {
    const { userId } = await guard(request);
    const p = parse(shellCartParamsSchema, request.params);
    return returns.withdraw(
      await businessManagement.customerScope(userId, p.businessId, p.appInstanceId),
      p.id,
      key(request),
      parse(returnWithdrawBodySchema, request.body),
    );
  });
  server.post("/v1/shell/:businessId/:appInstanceId/orders/:id/reorder", async (request) => {
    const { userId } = await guard(request);
    const p = parse(shellCartParamsSchema, request.params);
    return ordering.reorder(
      await businessManagement.customerScope(userId, p.businessId, p.appInstanceId),
      p.id,
      key(request),
      parse(reorderBodySchema, request.body),
    );
  });
  server.get("/v1/business/:businessId/returns", async (request) => {
    const { userId } = await guard(request);
    const p = parse(businessParamsSchema, request.params);
    const query = parse(businessReturnsQuerySchema, request.query);
    return returns.listForBusiness(
      await businessManagement.authorise(userId, p.businessId),
      { limit: query.limit, cursor: query.cursor },
      query.status,
    );
  });
  server.put("/v1/business/:businessId/returns/:id/decision", async (request) => {
    const { userId } = await guard(request);
    const p = parse(businessRecordParamsSchema, request.params);
    return returns.decide(
      await businessManagement.authorise(userId, p.businessId),
      p.id,
      key(request),
      parse(returnDecisionBodySchema, request.body),
    );
  });
}
