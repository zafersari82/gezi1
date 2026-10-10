import {
  businessChatReplySchema,
  businessParamsSchema,
  idSchema,
  pageQuerySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

const threadParams = z.object({ businessId: idSchema, conversationId: idSchema }).strict();
const customerOrderParams = z.object({ conversationId: idSchema, orderId: idSchema }).strict();
const customerThreadParams = z.object({ conversationId: idSchema }).strict();
const businessOrderParams = threadParams.extend({ orderId: idSchema });

export function businessChatRoutes(
  server: FastifyInstance,
  { guard, services }: RouteContext,
): void {
  const chats = services.businessChat;
  server.get("/v1/conversations/:conversationId/orders", async (request) => {
    const { userId } = await guard(request);
    const { conversationId } = parse(customerThreadParams, request.params);
    return chats.customerOrders(userId, conversationId);
  });
  server.get("/v1/conversations/:conversationId/orders/:orderId", async (request) => {
    const { userId } = await guard(request);
    const { conversationId, orderId } = parse(customerOrderParams, request.params);
    return chats.customerOrder(userId, conversationId, orderId);
  });
  server.get("/v1/business/:businessId/chats/:conversationId/orders/:orderId", async (request) => {
    const { userId } = await guard(request);
    const { businessId, conversationId, orderId } = parse(businessOrderParams, request.params);
    return chats.businessOrder(
      await services.businessManagement.authorise(userId, businessId),
      conversationId,
      orderId,
    );
  });
  const business = services.businessManagement;
  server.post("/v1/businesses/:businessId/chat", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    parse(z.object({}).strict(), request.body ?? {});
    return chats.open(userId, businessId);
  });
  server.get("/v1/business/:businessId/chats", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return chats.inbox(
      await business.authorise(userId, businessId),
      parse(pageQuerySchema, request.query),
    );
  });
  server.get("/v1/business/:businessId/chats/:conversationId/messages", async (request) => {
    const { userId } = await guard(request);
    const { businessId, conversationId } = parse(threadParams, request.params);
    return chats.messages(
      await business.authorise(userId, businessId),
      conversationId,
      parse(pageQuerySchema, request.query),
    );
  });
  server.post("/v1/business/:businessId/chats/:conversationId/messages", async (request) => {
    const { userId } = await guard(request);
    const { businessId, conversationId } = parse(threadParams, request.params);
    return chats.reply(
      await business.authorise(userId, businessId),
      conversationId,
      parse(businessChatReplySchema, request.body),
    );
  });
  server.post("/v1/business/:businessId/chats/:conversationId/read", async (request) => {
    const { userId } = await guard(request);
    const { businessId, conversationId } = parse(threadParams, request.params);
    parse(z.object({}).strict(), request.body ?? {});
    return chats.markRead(await business.authorise(userId, businessId), conversationId);
  });
}
