import { pushTokenBodySchema, updateNotificationSettingsBodySchema } from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

export function notificationRoutes(
  server: FastifyInstance,
  { services, guard }: RouteContext,
): void {
  const { notifications } = services;

  // Bildirim adresi oturuma bağlıdır: çıkışta ya da oturum kapatılınca kendiliğinden silinir.
  server.put("/v1/me/push-token", async (request, reply) => {
    const auth = await guard(request);
    const body = parse(pushTokenBodySchema, request.body);
    await notifications.saveToken(auth, body.token);
    return noContent(reply);
  });

  server.delete("/v1/me/push-token", async (request, reply) => {
    const auth = await guard(request);
    await notifications.removeToken(auth);
    return noContent(reply);
  });

  server.get("/v1/me/notifications", async (request) => {
    const { userId } = await guard(request);
    return notifications.settings(userId);
  });

  server.patch("/v1/me/notifications", async (request) => {
    const { userId } = await guard(request);
    const body = parse(updateNotificationSettingsBodySchema, request.body);
    return notifications.updateSettings(userId, body);
  });
}
