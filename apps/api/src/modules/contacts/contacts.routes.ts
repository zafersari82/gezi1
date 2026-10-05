import { createContactRequestBodySchema } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { idParamsSchema, noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function contactRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { contacts } = services;

  server.get("/v1/contacts", async (request) => {
    const { userId } = await guard(request);
    return { items: await contacts.list(userId) };
  });

  server.delete("/v1/contacts/:id", async (request, reply) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    await contacts.remove(userId, id);
    return noContent(reply);
  });

  server.get("/v1/contact-requests", async (request) => {
    const { userId } = await guard(request);
    return contacts.listRequests(userId);
  });

  server.post("/v1/contact-requests", async (request) => {
    const { userId } = await guard(request);
    const body = parse(createContactRequestBodySchema, request.body);
    return contacts.sendRequest(userId, body.userId, body.message ?? "");
  });

  server.post("/v1/contact-requests/:id/accept", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    return contacts.acceptRequest(userId, id);
  });

  server.delete("/v1/contact-requests/:id", async (request, reply) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    await contacts.dismissRequest(userId, id);
    return noContent(reply);
  });

  server.get("/v1/blocks", async (request) => {
    const { userId } = await guard(request);
    return { items: await contacts.listBlocked(userId) };
  });

  server.put("/v1/blocks/:id", async (request, reply) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    await contacts.block(userId, id);
    return noContent(reply);
  });

  server.delete("/v1/blocks/:id", async (request, reply) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    await contacts.unblock(userId, id);
    return noContent(reply);
  });
}
