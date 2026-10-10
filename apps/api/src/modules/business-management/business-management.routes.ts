import {
  appInstanceBodySchema,
  branchBodySchema,
  branchHoursBodySchema,
  businessContextBodySchema,
  businessMemberBodySchema,
  businessMiniAppLaunchParamsSchema,
  businessParamsSchema,
  businessRecordParamsSchema,
  miniAppIdSchema,
  staffInvitationCreateSchema,
  staffInvitationTokenBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function businessManagementRoutes(
  server: FastifyInstance,
  { services, guard }: RouteContext,
): void {
  const business = services.businessManagement;
  server.post("/v1/business/:businessId/socket-ticket", async (request) => {
    const { userId, sessionId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    parse(z.object({}).strict(), request.body ?? {});
    return services.businessSockets.issue(await business.authorise(userId, businessId), sessionId);
  });
  server.get("/v1/business/memberships", async (request) => {
    const { userId } = await guard(request);
    return { items: await business.memberships(userId) };
  });
  server.get("/v1/business/:businessId/members", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return { items: await business.members(await business.authorise(userId, businessId)) };
  });
  server.put("/v1/business/:businessId/members", async (request, reply) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    await business.setMember(
      await business.authorise(userId, businessId),
      parse(businessMemberBodySchema, request.body),
      false,
    );
    return reply.code(204).send();
  });
  server.get("/v1/business/:businessId/invitations", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return business.invitations(await business.authorise(userId, businessId));
  });
  server.post("/v1/business/:businessId/invitations", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return business.createInvitation(
      await business.authorise(userId, businessId),
      parse(staffInvitationCreateSchema, request.body),
    );
  });
  server.post("/v1/business/:businessId/invitations/:id/revoke", async (request, reply) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    parse(z.object({}).strict(), request.body ?? {});
    await business.revokeInvitation(await business.authorise(userId, businessId), id);
    return reply.code(204).send();
  });
  // The recipient has a verified session, but is not a business member yet.
  server.post("/v1/business/invitations/preview", async (request) => {
    const { userId } = await guard(request);
    const { token } = parse(staffInvitationTokenBodySchema, request.body);
    return business.previewInvitation(userId, token);
  });
  server.post("/v1/business/invitations/accept", async (request) => {
    const { userId } = await guard(request);
    const { token } = parse(staffInvitationTokenBodySchema, request.body);
    return business.acceptInvitation(userId, token);
  });
  server.get("/v1/business/:businessId/branches", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return { items: await business.branches(await business.authorise(userId, businessId)) };
  });
  server.post("/v1/business/:businessId/branches", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return business.saveBranch(
      await business.authorise(userId, businessId),
      parse(branchBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/branches/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return business.saveBranch(
      await business.authorise(userId, businessId),
      parse(branchBodySchema, request.body),
      id,
    );
  });
  server.get("/v1/business/:businessId/branches/:id/hours", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return business.hours(await business.authorise(userId, businessId), id);
  });
  server.put("/v1/business/:businessId/branches/:id/hours", async (request, reply) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    await business.setHours(
      await business.authorise(userId, businessId),
      id,
      parse(branchHoursBodySchema, request.body),
    );
    return reply.code(204).send();
  });
  server.get("/v1/business/:businessId/app-instances", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return { items: await business.instances(await business.authorise(userId, businessId)) };
  });
  server.post("/v1/business/:businessId/app-instances", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return business.createInstance(
      await business.authorise(userId, businessId),
      parse(appInstanceBodySchema, request.body),
    );
  });
  // Vitrinden gelen açılış: oturum doğrulanır, işletme + mini uygulama bağlamı
  // sunucuda bulunur. Örnek kimliği istemcinin serbest girdisi değildir.
  server.get("/v1/businesses/:businessId/miniapps/:miniAppId/launch", async (request) => {
    await guard(request);
    const { businessId, miniAppId } = parse(businessMiniAppLaunchParamsSchema, request.params);
    return business.businessLaunch(businessId, miniAppId);
  });
  server.post("/v1/shell/resolve-context", async (request) => {
    const { userId } = await guard(request);
    const { miniAppId } = parse(z.object({ miniAppId: miniAppIdSchema }).strict(), request.body);
    const scope = await business.resolveCustomerScope(userId, miniAppId);
    return {
      businessId: scope.businessId,
      appInstanceId: scope.appInstanceId,
      businessCustomerId: scope.businessCustomerId,
    };
  });
  server.post("/v1/shell/business-context", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId, miniAppId } = parse(businessContextBodySchema, request.body);
    const scope = await business.customerScope(userId, businessId, appInstanceId, miniAppId);
    return { businessId, appInstanceId, businessCustomerId: scope.businessCustomerId };
  });
}
