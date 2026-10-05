import {
  createMomentBodySchema,
  createMomentCommentBodySchema,
  idSchema,
  pageQuerySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { idParamsSchema, noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

const commentParamsSchema = z.object({ id: idSchema, commentId: idSchema });

export function momentRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { moments } = services;

  server.get("/v1/moments", async (request) => {
    const { userId } = await guard(request);
    const page = parse(pageQuerySchema, request.query);
    return moments.listFeed(userId, page);
  });

  server.post("/v1/moments", async (request) => {
    const { userId } = await guard(request);
    const body = parse(createMomentBodySchema, request.body);
    return moments.create(userId, body.body ?? "", body.mediaIds ?? []);
  });

  server.delete("/v1/moments/:id", async (request, reply) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    await moments.remove(userId, id);
    return noContent(reply);
  });

  server.put("/v1/moments/:id/like", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    return moments.setLiked(userId, id, true);
  });

  server.delete("/v1/moments/:id/like", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    return moments.setLiked(userId, id, false);
  });

  server.post("/v1/moments/:id/comments", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(createMomentCommentBodySchema, request.body);
    return moments.addComment(userId, id, body.body);
  });

  server.delete("/v1/moments/:id/comments/:commentId", async (request) => {
    const { userId } = await guard(request);
    const params = parse(commentParamsSchema, request.params);
    return moments.removeComment(userId, params.id, params.commentId);
  });
}
