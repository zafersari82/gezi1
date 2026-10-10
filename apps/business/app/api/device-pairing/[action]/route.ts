import { devicePairingPollSchema, devicePairingSchema } from "@vado/contracts";
import { z } from "zod";

import { apiRequest, BusinessApiError } from "../../../../lib/api";
import { readLimitedJson, sameOrigin } from "../../../../lib/request-policy";
import { routeError } from "../../../../lib/route-error";
import {
  clearKitchenSession,
  readPairing,
  writeKitchenSession,
  writePairing,
} from "../../../../lib/session";
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    if (!sameOrigin(request, process.env.VADO_BUSINESS_PUBLIC_URL))
      throw new BusinessApiError(403, "forbidden", "İstek bu uygulamadan gelmelidir.");
    z.object({})
      .strict()
      .parse(await readLimitedJson(request));
    const { action } = await params;
    if (action === "start") {
      const pair = devicePairingSchema.parse(
        await (await apiRequest("POST", "/v1/device-pairings", {}, false)).json(),
      );
      await writePairing(pair.id, pair.secret, pair.expiresAt);
      return Response.json(
        { code: pair.code, expiresAt: pair.expiresAt },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (action === "poll") {
      const pair = await readPairing();
      if (pair?.id === undefined || pair.secret === undefined)
        throw new BusinessApiError(401, "unauthorized", "Eşleştirme süresi doldu.");
      const result = devicePairingPollSchema.parse(
        await (
          await apiRequest(
            "POST",
            `/v1/device-pairings/${pair.id}/poll`,
            { secret: pair.secret },
            false,
          )
        ).json(),
      );
      if (result.status === "approved") {
        await writeKitchenSession(result.token, result.device.expiresAt);
        return Response.json(
          { status: result.status },
          { headers: { "cache-control": "no-store" } },
        );
      }
      return Response.json(
        { status: result.status, expiresAt: result.expiresAt },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (action === "clear") {
      await clearKitchenSession();
      return Response.json({ ok: true });
    }
    throw new BusinessApiError(404, "not_found", "Eşleştirme yolu bulunamadı.");
  } catch (error) {
    return routeError(error);
  }
}
