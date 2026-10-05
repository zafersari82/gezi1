import {
  adminPublishMiniAppBodySchema,
  adminSaveMerchantBodySchema,
  adminSaveMiniAppBodySchema,
  adminSaveMiniAppConfigBodySchema,
  adminSearchQuerySchema,
  adminUpdateMiniAppBodySchema,
  merchantIdSchema,
  miniAppIdSchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { miniAppParamsSchema, noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

const merchantParamsSchema = z.object({ id: miniAppIdSchema, merchantId: merchantIdSchema });

/** Uygulama kayıtlarının yönetimi. Yalnızca yönetici anahtarıyla çağrılır. */
export function miniAppAdminRoutes(
  server: FastifyInstance,
  { services, adminGuard }: RouteContext,
): void {
  const { miniAppAdmin } = services;

  server.get("/v1/admin/miniapps", async (request) => {
    adminGuard(request);
    const { q } = parse(adminSearchQuerySchema, request.query);
    return { items: await miniAppAdmin.list(q) };
  });

  server.get("/v1/admin/miniapps/:id", (request) => {
    adminGuard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    return miniAppAdmin.get(id);
  });

  server.put("/v1/admin/miniapps/:id", (request) => {
    const { actor } = adminGuard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    const body = parse(adminSaveMiniAppBodySchema, request.body);
    return miniAppAdmin.save(actor, id, body);
  });

  server.patch("/v1/admin/miniapps/:id", async (request, reply) => {
    const { actor } = adminGuard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    const body = parse(adminUpdateMiniAppBodySchema, request.body);
    await miniAppAdmin.update(actor, id, body);
    return noContent(reply);
  });

  server.post("/v1/admin/miniapps/:id/releases", (request) => {
    const { actor } = adminGuard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    const body = parse(adminPublishMiniAppBodySchema, request.body);
    return miniAppAdmin.publish(actor, id, body);
  });

  server.post("/v1/admin/miniapps/:id/rollback", (request) => {
    const { actor } = adminGuard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    return miniAppAdmin.rollback(actor, id);
  });

  server.put("/v1/admin/miniapps/:id/config", (request) => {
    const { actor } = adminGuard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    const body = parse(adminSaveMiniAppConfigBodySchema, request.body);
    return miniAppAdmin.saveConfig(actor, id, body.config);
  });

  server.put("/v1/admin/miniapps/:id/merchants/:merchantId", async (request, reply) => {
    const { actor } = adminGuard(request);
    const params = parse(merchantParamsSchema, request.params);
    const body = parse(adminSaveMerchantBodySchema, request.body);
    await miniAppAdmin.saveMerchant(actor, params.id, params.merchantId, body);
    return noContent(reply);
  });
}
