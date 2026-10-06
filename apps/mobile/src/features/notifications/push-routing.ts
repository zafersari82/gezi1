import { pushDataSchema } from "@vado/contracts";
import type { Href } from "expo-router";

import { rememberLaunch } from "../miniapps/launch-params";

/**
 * Bildirime dokunulunca açılacak ekran. Bildirimin verisi sunucudan gelir ama telefonda
 * değiştirilmiş olabilir; tanınmayan veri hiçbir ekran açmaz.
 */
export function pushTarget(data: unknown): Href | null {
  const parsed = pushDataSchema.safeParse(data);
  if (!parsed.success) return null;
  switch (parsed.data.type) {
    case "message":
      return { pathname: "/chat/[id]", params: { id: parsed.data.conversationId } };
    case "order":
      return {
        pathname: "/miniapps/[id]",
        params: {
          id: parsed.data.miniAppId,
          launch: rememberLaunch(parsed.data.miniAppId, {
            businessId: parsed.data.businessId,
            appInstanceId: parsed.data.appInstanceId,
            orderId: parsed.data.orderId,
          }),
        },
      };
    case "new_device":
      return "/settings/sessions";
  }
}
