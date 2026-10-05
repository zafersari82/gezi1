import {
  adminSearchQuerySchema,
  adminUpdateBusinessBodySchema,
  adminUpdateReportBodySchema,
  adminUpdateUserBodySchema,
  pageQuerySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { adminAccess, idParamsSchema, noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

/**
 * Yönetim uç noktaları kullanıcı oturumuyla değil, panel hesabının oturumuyla ve yalnızca panel
 * sunucusunun bildiği yönetici anahtarıyla çağrılır; her uç gerektirdiği izni bildirir. Mini
 * uygulama, paket ve hesap yönetimi kendi modüllerindedir.
 */
export function adminRoutes(server: FastifyInstance, { services, adminGuard }: RouteContext): void {
  const { admin } = services;

  server.get("/v1/admin/overview", adminAccess("overview.read"), async (request) => {
    await adminGuard(request);
    return admin.overview();
  });

  server.get("/v1/admin/users", adminAccess("users.read"), async (request) => {
    await adminGuard(request);
    const { q } = parse(adminSearchQuerySchema, request.query);
    return { items: await admin.listUsers(q) };
  });

  server.patch("/v1/admin/users/:id", adminAccess("users.manage"), async (request, reply) => {
    const { actor } = await adminGuard(request);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(adminUpdateUserBodySchema, request.body);
    await admin.updateUserStatus(actor, id, body.status);
    return noContent(reply);
  });

  server.get("/v1/admin/businesses", adminAccess("businesses.read"), async (request) => {
    await adminGuard(request);
    const { q } = parse(adminSearchQuerySchema, request.query);
    return { items: await admin.listBusinesses(q) };
  });

  server.patch(
    "/v1/admin/businesses/:id",
    adminAccess("businesses.manage"),
    async (request, reply) => {
      const { actor } = await adminGuard(request);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(adminUpdateBusinessBodySchema, request.body);
      await admin.updateBusiness(actor, id, body);
      return noContent(reply);
    },
  );

  server.get("/v1/admin/reports", adminAccess("reports.read"), async (request) => {
    await adminGuard(request);
    return { items: await admin.listReports() };
  });

  server.patch("/v1/admin/reports/:id", adminAccess("reports.manage"), async (request, reply) => {
    const { actor } = await adminGuard(request);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(adminUpdateReportBodySchema, request.body);
    await admin.updateReport(actor, id, body.status);
    return noContent(reply);
  });

  server.get("/v1/admin/audit", adminAccess("audit.read"), async (request) => {
    await adminGuard(request);
    const page = parse(pageQuerySchema, request.query);
    return admin.listAudit(page);
  });
}
