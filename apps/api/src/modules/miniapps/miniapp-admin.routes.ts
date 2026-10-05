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

import { adminAccess, miniAppParamsSchema, noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

const merchantParamsSchema = z.object({ id: miniAppIdSchema, merchantId: merchantIdSchema });

/** Uygulama kayıtlarının yönetimi. Her uç gerektirdiği izni bildirir (bkz. core/http.ts). */
export function miniAppAdminRoutes(
  server: FastifyInstance,
  { services, adminGuard }: RouteContext,
): void {
  const { miniAppAdmin } = services;

  server.get("/v1/admin/miniapps", adminAccess("miniapps.read"), async (request) => {
    await adminGuard(request);
    const { q } = parse(adminSearchQuerySchema, request.query);
    return { items: await miniAppAdmin.list(q) };
  });

  server.get("/v1/admin/miniapps/:id", adminAccess("miniapps.read"), async (request) => {
    await adminGuard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    return miniAppAdmin.get(id);
  });

  server.put("/v1/admin/miniapps/:id", adminAccess("miniapps.manage"), async (request) => {
    const { actor } = await adminGuard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    const body = parse(adminSaveMiniAppBodySchema, request.body);
    return miniAppAdmin.save(actor, id, body);
  });

  server.patch("/v1/admin/miniapps/:id", adminAccess("miniapps.manage"), async (request, reply) => {
    const { actor } = await adminGuard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    const body = parse(adminUpdateMiniAppBodySchema, request.body);
    await miniAppAdmin.update(actor, id, body);
    return noContent(reply);
  });

  // Acil kapatma: kaydı yönetemeyen ama sorunlu bir uygulamayı kullanıcılardan hemen gizlemesi
  // gereken roller (inceleyen) için ayrı bir uçtur; kaydı yeniden açmak `miniapps.manage` ister.
  server.post(
    "/v1/admin/miniapps/:id/disable",
    adminAccess("emergency.disable"),
    async (request, reply) => {
      const { actor } = await adminGuard(request);
      const { id } = parse(miniAppParamsSchema, request.params);
      await miniAppAdmin.update(actor, id, { enabled: false });
      return noContent(reply);
    },
  );

  server.post(
    "/v1/admin/miniapps/:id/releases",
    adminAccess("miniapps.publish"),
    async (request) => {
      const { actor } = await adminGuard(request);
      const { id } = parse(miniAppParamsSchema, request.params);
      const body = parse(adminPublishMiniAppBodySchema, request.body);
      return miniAppAdmin.publish(actor, id, body);
    },
  );

  server.post(
    "/v1/admin/miniapps/:id/rollback",
    adminAccess("miniapps.publish"),
    async (request) => {
      const { actor } = await adminGuard(request);
      const { id } = parse(miniAppParamsSchema, request.params);
      return miniAppAdmin.rollback(actor, id);
    },
  );

  server.put("/v1/admin/miniapps/:id/config", adminAccess("miniapps.manage"), async (request) => {
    const { actor } = await adminGuard(request);
    const { id } = parse(miniAppParamsSchema, request.params);
    const body = parse(adminSaveMiniAppConfigBodySchema, request.body);
    return miniAppAdmin.saveConfig(actor, id, body.config);
  });

  server.put(
    "/v1/admin/miniapps/:id/merchants/:merchantId",
    adminAccess("miniapps.manage"),
    async (request, reply) => {
      const { actor } = await adminGuard(request);
      const params = parse(merchantParamsSchema, request.params);
      const body = parse(adminSaveMerchantBodySchema, request.body);
      await miniAppAdmin.saveMerchant(actor, params.id, params.merchantId, body);
      return noContent(reply);
    },
  );
}
