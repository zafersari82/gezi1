import { authResultSchema, requestOtpBodySchema, requestOtpResponseSchema } from "@vado/contracts";
import { z } from "zod";

import { apiRequest, BusinessApiError } from "../../../../lib/api";
import { readLimitedJson, sameOrigin } from "../../../../lib/request-policy";
import { routeError } from "../../../../lib/route-error";
import { clearSession, deviceId, writeSession } from "../../../../lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
): Promise<Response> {
  try {
    if (!sameOrigin(request, process.env.VADO_BUSINESS_PUBLIC_URL))
      throw new BusinessApiError(403, "forbidden", "İstek bu uygulamadan gelmelidir.");
    const { action } = await params;
    if (action === "logout") {
      try {
        await apiRequest("POST", "/v1/auth/logout");
      } finally {
        await clearSession();
      }
      return Response.json({ ok: true });
    }
    const value = await readLimitedJson(request);
    if (action === "otp") {
      const body = requestOtpBodySchema.parse(value);
      const result = requestOtpResponseSchema.parse(
        await (await apiRequest("POST", "/v1/auth/otp", body, false)).json(),
      );
      return Response.json(result);
    }
    if (action === "verify") {
      const body = z
        .object({ phone: z.string().min(1).max(32), code: z.string().regex(/^\d{6}$/) })
        .strict()
        .parse(value);
      const result = authResultSchema.parse(
        await (
          await apiRequest(
            "POST",
            "/v1/auth/otp/verify",
            {
              ...body,
              deviceId: await deviceId(),
              deviceName: "VADO Business web",
              platform: "web",
            },
            false,
          )
        ).json(),
      );
      await clearSession();
      await writeSession(result.token, result.expiresAt);
      return Response.json({ ok: true });
    }
    return Response.json(
      { error: { code: "not_found", message: "Adres bulunamadı." } },
      { status: 404 },
    );
  } catch (error) {
    return routeError(error);
  }
}
