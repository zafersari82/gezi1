import {
  applyCartIncentivesBodySchema,
  businessParamsSchema,
  businessRecordParamsSchema,
  idempotencyKeySchema,
  incentiveRuleBodySchema,
  incentiveSettingsBodySchema,
  shellBusinessParamsSchema,
  shellCartParamsSchema,
  updateIncentiveRuleBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";
export function incentiveRoutes(server: FastifyInstance, { services, guard }: RouteContext) {
  const { incentives, businessManagement, ordering } = services;
  server.get("/v1/business/:businessId/incentives/rules", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return incentives.listRules(await businessManagement.authorise(userId, businessId));
  });
  server.post("/v1/business/:businessId/incentives/rules", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const body = parse(incentiveRuleBodySchema, request.body),
      key = parse(idempotencyKeySchema, request.headers["idempotency-key"]);
    return incentives.saveRule(
      await businessManagement.authorise(userId, businessId),
      null,
      key,
      body,
    );
  });
  server.put("/v1/business/:businessId/incentives/rules/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    const body = parse(updateIncentiveRuleBodySchema, request.body),
      key = parse(idempotencyKeySchema, request.headers["idempotency-key"]);
    return incentives.saveRule(
      await businessManagement.authorise(userId, businessId),
      id,
      key,
      body,
    );
  });
  server.get("/v1/business/:businessId/incentives/settings", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return incentives.getSettings(await businessManagement.authorise(userId, businessId));
  });
  server.put("/v1/business/:businessId/incentives/settings", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const body = parse(incentiveSettingsBodySchema, request.body),
      key = parse(idempotencyKeySchema, request.headers["idempotency-key"]);
    return incentives.saveSettings(
      await businessManagement.authorise(userId, businessId),
      key,
      body,
    );
  });
  server.get("/v1/shell/:businessId/:appInstanceId/incentives", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId } = parse(shellBusinessParamsSchema, request.params);
    return incentives.available(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
    );
  });
  server.get("/v1/shell/:businessId/:appInstanceId/loyalty", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId } = parse(shellBusinessParamsSchema, request.params);
    return incentives.getWallet(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
    );
  });
  server.put("/v1/shell/:businessId/:appInstanceId/carts/:id/incentives", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId, id } = parse(shellCartParamsSchema, request.params);
    const body = parse(applyCartIncentivesBodySchema, request.body),
      key = parse(idempotencyKeySchema, request.headers["idempotency-key"]);
    return ordering.applyIncentives(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
      id,
      key,
      body,
    );
  });
}
