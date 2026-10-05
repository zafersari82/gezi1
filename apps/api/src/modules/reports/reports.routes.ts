import { createReportBodySchema } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function reportRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { reports } = services;

  server.post("/v1/reports", async (request, reply) => {
    const { userId } = await guard(request);
    const body = parse(createReportBodySchema, request.body);
    await reports.create(userId, body);
    return noContent(reply);
  });
}
