import { businessMembershipSchema } from "@vado/contracts";
import { z } from "zod";

import { apiGet, apiRequest, BusinessApiError } from "../../../../lib/api";
import { businessApiPath, readLimitedJson, sameOrigin } from "../../../../lib/request-policy";
import { routeError } from "../../../../lib/route-error";
import { BUSINESS_COOKIE, readSelection } from "../../../../lib/session";

async function handle(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  try {
    if (request.method !== "GET" && !sameOrigin(request, process.env.VADO_BUSINESS_PUBLIC_URL))
      throw new BusinessApiError(403, "forbidden", "İstek bu uygulamadan gelmelidir.");
    const members = (
      await apiGet(
        z.object({ items: z.array(businessMembershipSchema) }),
        "/v1/business/memberships",
      )
    ).items;
    const selected = await readSelection(BUSINESS_COOKIE);
    const member = selected === null ? members[0] : members.find((m) => m.businessId === selected);
    if (member === undefined)
      throw new BusinessApiError(403, "forbidden", "Etkin işletme üyeliğin bulunamadı.");
    const path = businessApiPath(
      member.businessId,
      (await params).path,
      request.method,
      new URL(request.url).search,
    );
    if (path === null) throw new BusinessApiError(400, "validation_failed", "İstek yolu geçersiz.");
    const response = await apiRequest(
      request.method,
      path,
      request.method === "GET" ? undefined : await readLimitedJson(request),
    );
    return new Response(response.status === 204 ? null : await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return routeError(error);
  }
}
export { handle as GET, handle as POST, handle as PUT };
