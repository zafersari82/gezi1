import { MEDIA_MAX_BYTES, MEDIA_UPLOAD_FIELD } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { readUpload } from "../../core/http";
import type { RouteContext } from "../../routes";

export function mediaRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { media } = services;

  server.post("/v1/media", async (request) => {
    const { userId } = await guard(request);
    const data = await readUpload(request, {
      field: MEDIA_UPLOAD_FIELD,
      maxBytes: MEDIA_MAX_BYTES,
      invalid: "media_invalid",
      tooLarge: "media_too_large",
    });
    return media.upload(userId, data);
  });
}
