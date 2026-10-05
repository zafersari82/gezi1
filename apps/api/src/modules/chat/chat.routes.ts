import {
  addMembersBodySchema,
  createDirectConversationBodySchema,
  createGroupConversationBodySchema,
  idSchema,
  markReadBodySchema,
  pageQuerySchema,
  sendMessageBodySchema,
  updateConversationBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { idParamsSchema, noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

const memberParamsSchema = z.object({ id: idSchema, userId: idSchema });

export function chatRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { chat } = services;

  server.get("/v1/conversations", async (request) => {
    const { userId } = await guard(request);
    return { items: await chat.listConversations(userId) };
  });

  server.post("/v1/conversations/direct", async (request) => {
    const { userId } = await guard(request);
    const body = parse(createDirectConversationBodySchema, request.body);
    return chat.openDirect(userId, body.userId);
  });

  server.post("/v1/conversations/group", async (request) => {
    const { userId } = await guard(request);
    const body = parse(createGroupConversationBodySchema, request.body);
    return chat.createGroup(userId, body);
  });

  server.get("/v1/conversations/:id", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    return chat.getConversation(userId, id);
  });

  server.patch("/v1/conversations/:id", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(updateConversationBodySchema, request.body);
    return chat.renameGroup(userId, id, body.title);
  });

  server.post("/v1/conversations/:id/members", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(addMembersBodySchema, request.body);
    return chat.addMembers(userId, id, body.userIds);
  });

  server.delete("/v1/conversations/:id/members/:userId", async (request, reply) => {
    const { userId } = await guard(request);
    const params = parse(memberParamsSchema, request.params);
    await chat.removeMember(userId, params.id, params.userId);
    return noContent(reply);
  });

  server.get("/v1/conversations/:id/messages", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    const page = parse(pageQuerySchema, request.query);
    return chat.listMessages(userId, id, page);
  });

  server.post("/v1/conversations/:id/messages", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(sendMessageBodySchema, request.body);
    return chat.sendMessage(userId, id, body);
  });

  server.post("/v1/conversations/:id/read", async (request, reply) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(markReadBodySchema, request.body);
    await chat.markRead(userId, id, body.seq);
    return noContent(reply);
  });
}
