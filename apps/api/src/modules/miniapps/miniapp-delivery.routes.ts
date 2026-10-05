import { miniAppIdSchema, packagePathSchema } from "@vado/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../core/errors";
import {
  APPS_ROUTE_PREFIX,
  createPackageUrls,
  FILES_SEGMENT,
  WRAPPER_SEGMENT,
} from "../../core/package-urls";
import { MEDIA_ROUTE_PREFIX } from "../../providers/storage";
import type { RouteContext } from "../../routes";
import { entryDocumentHeaders, packageFileHeaders, wrapperHeaders } from "./package-policy";
import { renderWrapper } from "./wrapper-document";

const versionSchema = z.object({
  appId: miniAppIdSchema,
  digest: z.string().regex(/^[0-9a-f]{64}$/),
});
const fileSchema = versionSchema.extend({ "*": packagePathSchema });

/**
 * Yayındaki uygulama kayıtlarını sunar:
 *
 * - `/apps/<uygulama kaydı>/wrapper/<özet>/`: kabuğun açtığı sarmalayıcı belge,
 * - `/apps/<uygulama kaydı>/files/<özet>/<dosya>`: paketin dosyaları.
 *
 * Adres, sürümün içerik özetini taşır; yalnızca kaydın o an yayında olan sürümü sunulur. Bu
 * yolların altında hiçbir zaman yönlendirme yapılmaz: tarayıcı, yönlendirmeden sonra güvenlik
 * politikasındaki yol kısıtını uygulamaz.
 */
export function miniAppDeliveryRoutes(
  server: FastifyInstance,
  { config, services }: RouteContext,
): void {
  const { miniApps } = services;
  const urls = createPackageUrls(config.publicUrl, config.appsOrigin);
  const mediaUrl = `${config.publicUrl}${MEDIA_ROUTE_PREFIX}`;
  const record = `${APPS_ROUTE_PREFIX}:appId`;

  /** Alt alan adı kipinde bir kaydın adresleri yalnızca kendi alan adından istenebilir. */
  function assertOwnHost(request: FastifyRequest, appId: string): void {
    if (urls.subdomains && urls.appOfHost(request.headers.host) !== appId) {
      throw new AppError("not_found");
    }
  }

  /** İstemcideki kopya günceldiyse içeriği yeniden göndermez. */
  function send(
    request: FastifyRequest,
    reply: FastifyReply,
    headers: Record<string, string>,
    contentType: string,
    body: Buffer | string,
  ) {
    reply.headers(headers);
    if (request.headers["if-none-match"] === headers.etag) return reply.code(304).send();
    return reply.type(contentType).send(body);
  }

  // Bu yollar kendi güvenlik başlıklarını taşır; API'nin genel başlıkları uygulanmaz.
  server.get(`${record}/${WRAPPER_SEGMENT}/:digest/`, { helmet: false }, async (request, reply) => {
    const params = versionSchema.safeParse(request.params);
    if (!params.success) throw new AppError("not_found");
    const { appId, digest } = params.data;
    assertOwnHost(request, appId);

    const wrapper = await miniApps.openWrapper(appId, digest);
    if (wrapper === null) throw new AppError("not_found");

    const entryUrl = `${urls.filesUrl(appId, digest)}${wrapper.entry}`;
    const body = renderWrapper({ name: wrapper.name, entryUrl });
    const headers = wrapperHeaders({ entryUrl, frameAncestors: config.corsOrigins }, body);
    return send(request, reply, headers, "text/html; charset=utf-8", body);
  });

  server.get(`${record}/${FILES_SEGMENT}/:digest/*`, { helmet: false }, async (request, reply) => {
    const params = fileSchema.safeParse(request.params);
    if (!params.success) throw new AppError("not_found");
    const { appId, digest } = params.data;
    assertOwnHost(request, appId);

    const file = await miniApps.openPackageFile(appId, digest, params.data["*"]);
    if (file === null) throw new AppError("not_found");

    const headers = file.entry
      ? entryDocumentHeaders(
          {
            filesUrl: urls.filesUrl(appId, digest),
            network: file.network,
            mediaUrl,
            // Giriş belgesini sarmalayıcı çerçeveler; web önizlemesinde onu da kabuğun sayfası.
            frameAncestors: [urls.origin(appId), ...config.corsOrigins],
          },
          file.sha256,
        )
      : packageFileHeaders(file.sha256);
    return send(request, reply, headers, file.contentType, file.data);
  });
}
