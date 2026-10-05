import {
  adminApproveBodySchema,
  adminReviewBodySchema,
  adminRevokeBodySchema,
  adminSavePackageBodySchema,
  PACKAGE_UPLOAD_FIELD,
  packageIdSchema,
  packagePathSchema,
  versionSchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { parse, readUpload } from "../../core/http";
import type { RouteContext } from "../../routes";

const packageParamsSchema = z.object({ id: packageIdSchema });
const versionParamsSchema = packageParamsSchema.extend({ version: versionSchema });
const fileParamsSchema = versionParamsSchema.extend({ "*": packagePathSchema });

/** Paketlerin yüklenmesi, incelenmesi ve dağıtımı. Yalnızca yönetici anahtarıyla çağrılır. */
export function packageRoutes(
  server: FastifyInstance,
  { config, services, adminGuard }: RouteContext,
): void {
  const { packages, miniAppAdmin } = services;

  server.get("/v1/admin/packages", async (request) => {
    adminGuard(request);
    return { items: await packages.list() };
  });

  server.get("/v1/admin/packages/:id", (request) => {
    adminGuard(request);
    const { id } = parse(packageParamsSchema, request.params);
    return packages.get(id);
  });

  server.put("/v1/admin/packages/:id", (request) => {
    const { actor } = adminGuard(request);
    const { id } = parse(packageParamsSchema, request.params);
    const body = parse(adminSavePackageBodySchema, request.body);
    return packages.save(actor, id, body);
  });

  server.post("/v1/admin/packages/:id/versions", async (request) => {
    const { actor } = adminGuard(request);
    const { id } = parse(packageParamsSchema, request.params);
    const archive = await readUpload(request, {
      field: PACKAGE_UPLOAD_FIELD,
      maxBytes: config.packageMaxBytes,
      invalid: "validation_failed",
      tooLarge: "package_too_large",
    });
    return packages.upload(actor, id, archive);
  });

  server.get("/v1/admin/packages/:id/versions/:version", (request) => {
    adminGuard(request);
    const { id, version } = parse(versionParamsSchema, request.params);
    return packages.getVersion(id, version);
  });

  server.get("/v1/admin/packages/:id/versions/:version/files/*", (request) => {
    adminGuard(request);
    const params = parse(fileParamsSchema, request.params);
    return packages.readFile(params.id, params.version, params["*"]);
  });

  server.post("/v1/admin/packages/:id/versions/:version/submit", (request) => {
    const { actor } = adminGuard(request);
    const { id, version } = parse(versionParamsSchema, request.params);
    return packages.submit(actor, id, version);
  });

  server.post("/v1/admin/packages/:id/versions/:version/approve", (request) => {
    const { actor } = adminGuard(request);
    const { id, version } = parse(versionParamsSchema, request.params);
    const body = parse(adminApproveBodySchema, request.body ?? {});
    return packages.approve(actor, id, version, body.note ?? null);
  });

  server.post("/v1/admin/packages/:id/versions/:version/reject", (request) => {
    const { actor } = adminGuard(request);
    const { id, version } = parse(versionParamsSchema, request.params);
    const body = parse(adminReviewBodySchema, request.body);
    return packages.reject(actor, id, version, body.note);
  });

  server.post("/v1/admin/packages/:id/versions/:version/withdraw", (request) => {
    const { actor } = adminGuard(request);
    const { id, version } = parse(versionParamsSchema, request.params);
    return packages.withdraw(actor, id, version);
  });

  server.post("/v1/admin/packages/:id/versions/:version/revoke", (request) => {
    const { actor } = adminGuard(request);
    const { id, version } = parse(versionParamsSchema, request.params);
    const body = parse(adminRevokeBodySchema, request.body);
    return packages.revoke(actor, id, version, body);
  });

  server.post("/v1/admin/packages/:id/versions/:version/rollout", (request) => {
    const { actor } = adminGuard(request);
    const { id, version } = parse(versionParamsSchema, request.params);
    return miniAppAdmin.rollout(actor, id, version);
  });
}
