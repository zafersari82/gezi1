import { BusinessApiError } from "../../../../lib/api";
import { kitchenRequest } from "../../../../lib/kitchen-api";
import { kitchenApiPath, readLimitedJson, sameOrigin } from "../../../../lib/request-policy";
import { routeError } from "../../../../lib/route-error";
async function handle(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  try {
    if (request.method !== "GET" && !sameOrigin(request, process.env.VADO_BUSINESS_PUBLIC_URL))
      throw new BusinessApiError(403, "forbidden", "İstek bu uygulamadan gelmelidir.");
    const path = kitchenApiPath((await params).path, request.method, new URL(request.url).search);
    if (path === null) throw new BusinessApiError(400, "validation_failed", "İstek yolu geçersiz.");
    const response = await kitchenRequest(
      request.method,
      path,
      request.method === "GET" ? undefined : await readLimitedJson(request),
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    return routeError(error);
  }
}
export { handle as GET, handle as POST, handle as PUT };
