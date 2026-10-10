import {
  staffInvitationAcceptedSchema,
  staffInvitationPreviewSchema,
  staffInvitationTokenBodySchema,
} from "@vado/contracts";
import { z } from "zod";

import { apiRequest, BusinessApiError } from "../../../lib/api";
import { readLimitedJson, sameOrigin } from "../../../lib/request-policy";
import { routeError } from "../../../lib/route-error";
import { BUSINESS_COOKIE, writeSelection } from "../../../lib/session";

/** Invitation recipients do not have a business membership before acceptance. */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!sameOrigin(request, process.env.VADO_BUSINESS_PUBLIC_URL))
      throw new BusinessApiError(403, "forbidden", "İstek bu uygulamadan gelmelidir.");
    const body = z.object({
      action: z.enum(["preview", "accept"]),
      ...staffInvitationTokenBodySchema.shape,
    }).strict().parse(await readLimitedJson(request, 2048));
    const endpoint = `/v1/business/invitations/${body.action}`;
    const response = await apiRequest("POST", endpoint, { token: body.token });
    const result: unknown = await response.json();
    if (body.action === "accept") {
      const accepted = staffInvitationAcceptedSchema.parse(result);
      await writeSelection(BUSINESS_COOKIE, accepted.businessId);
      return Response.json(accepted, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(staffInvitationPreviewSchema.parse(result),
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
