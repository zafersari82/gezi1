import {
  adminSearchQuerySchema,
  adminUpdateBusinessBodySchema,
  adminUpdateReportBodySchema,
  adminUpdateUserBodySchema,
  pageQuerySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { idParamsSchema, noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

/**
 * Yönetim uç noktaları kullanıcı oturumuyla değil, yalnızca panel sunucusunun bildiği
 * yönetici anahtarıyla çağrılır. Mini uygulama ve paket yönetimi kendi modüllerindedir.
 */
export function adminRoutes(server: FastifyInstance, { services, adminGuard }: RouteContext): void {
  const { admin } = services;

  server.get("/v1/admin/overview", (request) => {
    adminGuard(request);
    return admin.overview();
  });

  server.get("/v1/admin/users", async (request) => {
    adminGuard(request);
    const { q } = parse(adminSearchQuerySchema, request.query);
    return { items: await admin.listUsers(q) };
  });

  server.patch("/v1/admin/users/:id", async (request, reply) => {
    const { actor } = adminGuard(request);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(adminUpdateUserBodySchema, request.body);
    await admin.updateUserStatus(actor, id, body.status);
    return noContent(reply);
  });

  server.get("/v1/admin/businesses", async (request) => {
    adminGuard(request);
    const { q } = parse(adminSearchQuerySchema, request.query);
    return { items: await admin.listBusinesses(q) };
  });

  server.patch("/v1/admin/businesses/:id", async (request, reply) => {
    const { actor } = adminGuard(request);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(adminUpdateBusinessBodySchema, request.body);
    await admin.updateBusiness(actor, id, body);
    return noContent(reply);
  });

  server.get("/v1/admin/reports", async (request) => {
    adminGuard(request);
    return { items: await admin.listReports() };
  });

  server.patch("/v1/admin/reports/:id", async (request, reply) => {
    const { actor } = adminGuard(request);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(adminUpdateReportBodySchema, request.body);
    await admin.updateReport(actor, id, body.status);
    return noContent(reply);
  });

  server.get("/v1/admin/audit", (request) => {
    adminGuard(request);
    const page = parse(pageQuerySchema, request.query);
    return admin.listAudit(page);
  });
}
