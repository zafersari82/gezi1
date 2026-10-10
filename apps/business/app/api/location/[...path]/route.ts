import { apiRequest, BusinessApiError } from "../../../../lib/api";
import { routeError } from "../../../../lib/route-error";

/** İşletme panelinde yalnız herkese açık coğrafya kataloğuna geçiş. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  try {
    const path = (await params).path.join("/");
    if (
      !/^(countries|countries\/[0-9a-f-]{36}\/provinces|provinces\/[0-9a-f-]{36}\/districts)$/.test(
        path,
      )
    )
      throw new BusinessApiError(400, "validation_failed", "Konum yolu geçersiz.");
    const response = await apiRequest("GET", `/v1/location/${path}`);
    return new Response(await response.text(), {
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return routeError(error);
  }
}
