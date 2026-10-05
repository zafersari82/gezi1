import { issueQrBodySchema, resolveQrBodySchema } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function qrRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { qr } = services;

  server.post("/v1/qr", async (request) => {
    const { userId } = await guard(request);
    const body = parse(issueQrBodySchema, request.body);
    return qr.issue(userId, body);
  });

  server.post("/v1/qr/resolve", async (request) => {
    const { userId } = await guard(request);
    const body = parse(resolveQrBodySchema, request.body);
    return qr.resolve(userId, body.value);
  });
}
