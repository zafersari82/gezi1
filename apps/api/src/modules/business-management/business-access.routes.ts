import {
  branchRegionBodySchema,
  businessParamsSchema,
  businessRecordParamsSchema,
  businessRegionBodySchema,
  businessRegionUpdateSchema,
  memberAccessBodySchema,
  staffInvitationCreateSchema,
  staffInvitationTokenBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

const versionBodySchema = z.object({ expectedVersion: z.number().int().positive() }).strict();

/** Ekip, bölge ve izin uçları. İşletme kimliği yoldan, üyelik sunucudaki oturumdan çözülür. */
export function businessAccessRoutes(
  server: FastifyInstance,
  { services, guard }: RouteContext,
): void {
  const access = services.businessAccess;
  const scopeFor = async (userId: string, businessId: string) =>
    services.businessManagement.authorise(userId, businessId);

  server.get("/v1/business/:businessId/access/me", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return access.myAccess(await scopeFor(userId, businessId));
  });
  server.get("/v1/business/:businessId/access/members", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return { items: await access.members(await scopeFor(userId, businessId)) };
  });
  server.put("/v1/business/:businessId/access/members/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return access.setMemberAccess(
      await scopeFor(userId, businessId),
      id,
      parse(memberAccessBodySchema, request.body),
    );
  });

  server.get("/v1/business/:businessId/regions", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return access.regions(await scopeFor(userId, businessId));
  });
  server.post("/v1/business/:businessId/regions", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const { name } = parse(businessRegionBodySchema, request.body);
    return access.createRegion(await scopeFor(userId, businessId), name);
  });
  server.put("/v1/business/:businessId/regions/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    const { name, expectedVersion } = parse(businessRegionUpdateSchema, request.body);
    return access.renameRegion(await scopeFor(userId, businessId), id, name, expectedVersion);
  });
  server.post("/v1/business/:businessId/regions/:id/delete", async (request, reply) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    const { expectedVersion } = parse(versionBodySchema, request.body);
    await access.deleteRegion(await scopeFor(userId, businessId), id, expectedVersion);
    return reply.code(204).send();
  });
  server.put("/v1/business/:businessId/branches/:id/region", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return access.setBranchRegion(
      await scopeFor(userId, businessId),
      id,
      parse(branchRegionBodySchema, request.body),
    );
  });

  server.get("/v1/business/:businessId/invitations", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return access.invitations(await scopeFor(userId, businessId));
  });
  server.post("/v1/business/:businessId/invitations", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return access.createInvitation(
      await scopeFor(userId, businessId),
      parse(staffInvitationCreateSchema, request.body),
    );
  });
  server.post("/v1/business/:businessId/invitations/:id/revoke", async (request, reply) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    parse(z.object({}).strict(), request.body ?? {});
    await access.revokeInvitation(await scopeFor(userId, businessId), id);
    return reply.code(204).send();
  });
  // Davet alan kişinin doğrulanmış oturumu vardır ama henüz işletme üyesi değildir.
  server.post("/v1/business/invitations/preview", async (request) => {
    const { userId } = await guard(request);
    const { token } = parse(staffInvitationTokenBodySchema, request.body);
    return access.previewInvitation(userId, token);
  });
  server.post("/v1/business/invitations/accept", async (request) => {
    const { userId } = await guard(request);
    const { token } = parse(staffInvitationTokenBodySchema, request.body);
    return access.acceptInvitation(userId, token);
  });
}
