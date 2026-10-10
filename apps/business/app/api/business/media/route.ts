import { businessMembershipSchema, MEDIA_MAX_BYTES, MEDIA_UPLOAD_FIELD } from "@vado/contracts";
import { z } from "zod";

import { apiGet, apiUpload, BusinessApiError } from "../../../../lib/api";
import { sameOrigin } from "../../../../lib/request-policy";
import { routeError } from "../../../../lib/route-error";
import { BUSINESS_COOKIE, readSelection } from "../../../../lib/session";

/** Telefon tarayıcısından API anahtarını açığa çıkarmadan, yetkili işletmeye yükler. */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!sameOrigin(request, process.env.VADO_BUSINESS_PUBLIC_URL))
      throw new BusinessApiError(403, "forbidden", "İstek bu uygulamadan gelmelidir.");
    const memberships = (
      await apiGet(
        z.object({ items: z.array(businessMembershipSchema) }),
        "/v1/business/memberships",
      )
    ).items;
    const selected = await readSelection(BUSINESS_COOKIE);
    const membership =
      selected === null
        ? memberships[0]
        : memberships.find((member) => member.businessId === selected);
    if (membership === undefined || membership.role === "staff")
      throw new BusinessApiError(403, "forbidden", "Görsel yükleme yetkin bulunmuyor.");
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MEDIA_MAX_BYTES + 16_384)
      throw new BusinessApiError(413, "media_too_large", "Görsel çok büyük.");
    // Content-Length may be absent or forged: cap the actual bytes before parsing multipart.
    if (request.body === null) throw new BusinessApiError(400, "media_invalid", "Görsel seç.");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > MEDIA_MAX_BYTES + 16_384) {
          await reader.cancel();
          throw new BusinessApiError(413, "media_too_large", "Görsel çok büyük.");
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const form = await new Response(data, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get(MEDIA_UPLOAD_FIELD);
    if (!(file instanceof File) || file.size === 0 || file.size > MEDIA_MAX_BYTES)
      throw new BusinessApiError(400, "media_invalid", "JPEG, PNG veya WebP görsel seç.");
    const outgoing = new FormData();
    outgoing.set(MEDIA_UPLOAD_FIELD, file, file.name);
    const response = await apiUpload(
      `/v1/business/${membership.businessId}/studio/media`,
      outgoing,
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return routeError(error);
  }
}
