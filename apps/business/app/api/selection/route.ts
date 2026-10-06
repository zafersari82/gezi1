import { appInstanceSchema, businessMembershipSchema, idSchema } from "@vado/contracts";
import { z } from "zod";

import { apiGet, BusinessApiError } from "../../../lib/api";
import { readLimitedJson, sameOrigin } from "../../../lib/request-policy";
import { routeError } from "../../../lib/route-error";
import { BUSINESS_COOKIE, INSTANCE_COOKIE, writeSelection } from "../../../lib/session";

export async function POST(request: Request): Promise<Response> {
  try {
    if (!sameOrigin(request, process.env.VADO_BUSINESS_PUBLIC_URL))
      throw new BusinessApiError(403, "forbidden", "İstek bu uygulamadan gelmelidir.");
    const body = z
      .object({ businessId: idSchema, instanceId: idSchema.optional() })
      .strict()
      .parse(await readLimitedJson(request));
    const members = (
      await apiGet(
        z.object({ items: z.array(businessMembershipSchema) }),
        "/v1/business/memberships",
      )
    ).items;
    if (!members.some((m) => m.businessId === body.businessId))
      throw new BusinessApiError(403, "forbidden", "Bu işletmeye üyeliğin bulunmuyor.");
    if (body.instanceId !== undefined) {
      const instances = (
        await apiGet(
          z.object({ items: z.array(appInstanceSchema) }),
          `/v1/business/${body.businessId}/app-instances`,
        )
      ).items;
      if (!instances.some((i) => i.id === body.instanceId && i.active))
        throw new BusinessApiError(403, "forbidden", "Uygulama örneği bu işletmede etkin değil.");
      await writeSelection(INSTANCE_COOKIE, body.instanceId);
    }
    await writeSelection(BUSINESS_COOKIE, body.businessId);
    return Response.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
