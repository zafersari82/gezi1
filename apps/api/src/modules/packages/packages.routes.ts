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

import { adminAccess, parse, readUpload } from "../../core/http";
import type { RouteContext } from "../../routes";

const packageParamsSchema = z.object({ id: packageIdSchema });
const versionParamsSchema = packageParamsSchema.extend({ version: versionSchema });
const fileParamsSchema = versionParamsSchema.extend({ "*": packagePathSchema });

/** Paketlerin yüklenmesi, incelenmesi ve dağıtımı. Her uç gerektirdiği izni bildirir. */
export function packageRoutes(
  server: FastifyInstance,
  { config, services, adminGuard }: RouteContext,
): void {
  const { packages, miniAppAdmin } = services;

  server.get("/v1/admin/packages", adminAccess("packages.read"), async (request) => {
    await adminGuard(request);
    return { items: await packages.list() };
  });

  server.get("/v1/admin/packages/:id", adminAccess("packages.read"), async (request) => {
    await adminGuard(request);
    const { id } = parse(packageParamsSchema, request.params);
    return packages.get(id);
  });

  server.put("/v1/admin/packages/:id", adminAccess("packages.upload"), async (request) => {
    const { actor } = await adminGuard(request);
    const { id } = parse(packageParamsSchema, request.params);
    const body = parse(adminSavePackageBodySchema, request.body);
    return packages.save(actor, id, body);
  });

  server.post(
    "/v1/admin/packages/:id/versions",
    adminAccess("packages.upload"),
    async (request) => {
      const { actor } = await adminGuard(request);
      const { id } = parse(packageParamsSchema, request.params);
      const archive = await readUpload(request, {
        field: PACKAGE_UPLOAD_FIELD,
        maxBytes: config.packageMaxBytes,
        invalid: "validation_failed",
        tooLarge: "package_too_large",
      });
      return packages.upload(actor, id, archive);
    },
  );

  server.get(
    "/v1/admin/packages/:id/versions/:version",
    adminAccess("packages.read"),
    async (request) => {
      await adminGuard(request);
      const { id, version } = parse(versionParamsSchema, request.params);
      return packages.getVersion(id, version);
    },
  );

  server.get(
    "/v1/admin/packages/:id/versions/:version/files/*",
    adminAccess("packages.read"),
    async (request) => {
      await adminGuard(request);
      const params = parse(fileParamsSchema, request.params);
      return packages.readFile(params.id, params.version, params["*"]);
    },
  );

  server.post(
    "/v1/admin/packages/:id/versions/:version/submit",
    adminAccess("packages.upload"),
    async (request) => {
      const { actor } = await adminGuard(request);
      const { id, version } = parse(versionParamsSchema, request.params);
      return packages.submit(actor, id, version);
    },
  );

  server.post(
    "/v1/admin/packages/:id/versions/:version/approve",
    adminAccess("packages.review"),
    async (request) => {
      const { actor } = await adminGuard(request);
      const { id, version } = parse(versionParamsSchema, request.params);
      const body = parse(adminApproveBodySchema, request.body ?? {});
      return packages.approve(actor, id, version, body.note ?? null);
    },
  );

  server.post(
    "/v1/admin/packages/:id/versions/:version/reject",
    adminAccess("packages.review"),
    async (request) => {
      const { actor } = await adminGuard(request);
      const { id, version } = parse(versionParamsSchema, request.params);
      const body = parse(adminReviewBodySchema, request.body);
      return packages.reject(actor, id, version, body.note);
    },
  );

  server.post(
    "/v1/admin/packages/:id/versions/:version/withdraw",
    adminAccess("packages.upload"),
    async (request) => {
      const { actor } = await adminGuard(request);
      const { id, version } = parse(versionParamsSchema, request.params);
      return packages.withdraw(actor, id, version);
    },
  );

  server.post(
    "/v1/admin/packages/:id/versions/:version/revoke",
    adminAccess("emergency.disable"),
    async (request) => {
      const { actor } = await adminGuard(request);
      const { id, version } = parse(versionParamsSchema, request.params);
      const body = parse(adminRevokeBodySchema, request.body);
      return packages.revoke(actor, id, version, body);
    },
  );

  server.post(
    "/v1/admin/packages/:id/versions/:version/rollout",
    adminAccess("packages.rollout"),
    async (request) => {
      const { actor } = await adminGuard(request);
      const { id, version } = parse(versionParamsSchema, request.params);
      return miniAppAdmin.rollout(actor, id, version);
    },
  );
}
