import {
  businessParamsSchema,
  channelPageQuerySchema,
  channelPostBodySchema,
  idSchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

const postParams = z.object({ businessId: idSchema, id: idSchema }).strict();

export function channelRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const channels = services.channels;
  const business = services.businessManagement;

  server.get("/v1/channels/feed", async (request) => {
    const { userId } = await guard(request);
    const { limit, cursor } = parse(channelPageQuerySchema, request.query);
    return channels.feed(userId, limit, cursor);
  });
  server.get("/v1/channels/following", async (request) => {
    const { userId } = await guard(request);
    return { items: await channels.following(userId) };
  });
  server.get("/v1/businesses/:businessId/channel/follow", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return channels.followStatus(userId, businessId);
  });
  server.put("/v1/businesses/:businessId/channel/follow", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return channels.follow(userId, businessId, true);
  });
  server.delete("/v1/businesses/:businessId/channel/follow", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return channels.follow(userId, businessId, false);
  });
  server.get("/v1/businesses/:businessId/channel/posts", async (request) => {
    await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const { limit, cursor } = parse(channelPageQuerySchema, request.query);
    return channels.listPosts(businessId, limit, cursor);
  });
  server.get("/v1/business/:businessId/channel/posts", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    await business.authorise(userId, businessId);
    const { limit, cursor } = parse(channelPageQuerySchema, request.query);
    return channels.listPosts(businessId, limit, cursor);
  });
  server.post("/v1/business/:businessId/channel/posts", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const { body } = parse(channelPostBodySchema, request.body);
    return channels.publish(await business.authorise(userId, businessId), body);
  });
  server.post("/v1/business/:businessId/channel/posts/:id/withdraw", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(postParams, request.params);
    parse(z.object({}).strict(), request.body ?? {});
    return channels.withdraw(await business.authorise(userId, businessId), id);
  });
}
