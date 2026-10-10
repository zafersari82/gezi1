import {
  BRIDGE_METHODS,
  BRIDGE_PROTOCOL_VERSION,
  type BridgeErrorCode,
  bridgeLeftSchema,
  type BridgeMethod,
  type BridgeParams,
  bridgeParamsSchemas,
  bridgeRequestSchema,
  type BridgeResponse,
  type BridgeResults,
  CAPABILITY_LABELS,
  type ConsentCapability,
  type ContainerInfo,
  isBridgeMethod,
  type MiniAppDetail,
  type MiniAppIdentity,
  type MiniAppIdentityToken,
  type PaymentRequestParams,
  requiresConsent,
  type ShareParams,
} from "@vado/contracts";

import type { FeedbackHost } from "./feedback-host";
import type { IncentivesHost } from "./incentives-host";
import type { LocationHost } from "./location-host";
import type { OrderingHost, TableServiceHost } from "./ordering-host";
import type { ReturnsHost } from "./returns-host";

/**
 * Köprünün kabuktan beklediği işlevler. Mini uygulama ekranı gerçek uygulamaları verir;
 * bu sayede köprü mantığı telefona ve tarayıcıya bağlı olmadan sınanabilir.
 */
export interface BridgeHost {
  feedback?: FeedbackHost | undefined;
  returns?: ReturnsHost | undefined;
  incentives?: IncentivesHost | undefined;
  ordering?: OrderingHost | undefined;
  tableService?: TableServiceHost | undefined;
  location?: LocationHost | undefined;
  miniApp: MiniAppDetail;
  /** Uygulamayı açan QR kodunun imzalı parametreleri; listeden açıldıysa boş. */
  launchParams: Record<string, string>;
  containerInfo: () => ContainerInfo;
  close: () => void;
  /** Kullanıcı bu yetkiye daha önce kalıcı izin vermiş mi? */
  hasConsent: (capability: ConsentCapability) => Promise<boolean>;
  /** Kullanıcıya izin sorar; verirse izni kalıcı olarak kaydeder. */
  askConsent: (capability: ConsentCapability) => Promise<boolean>;
  getIdentity: () => Promise<MiniAppIdentity>;
  getIdentityToken: () => Promise<MiniAppIdentityToken>;
  /** Kullanıcı vazgeçerse `null` döner. */
  scanQr: () => Promise<string | null>;
  /** Cihaz konum izni verilmezse `null` döner. */
  getLocation: () => Promise<BridgeResults["location.getCurrent"] | null>;
  /** Ödeme ekranını açar; ödenirse ödeme kimliğini, kullanıcı vazgeçerse `null` döndürür. */
  requestPayment: (params: PaymentRequestParams) => Promise<string | null>;
  storage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  share: (params: ShareParams) => Promise<void>;
}

/** Mini uygulamaya bilinçli olarak döndürülen hata. */
class BridgeFailure extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Handlers = {
  [Method in BridgeMethod]: (
    host: BridgeHost,
    params: BridgeParams[Method],
  ) => Promise<BridgeResults[Method]> | BridgeResults[Method];
};

function ordering(host: BridgeHost): OrderingHost {
  if (host.ordering === undefined)
    throw new BridgeFailure("unavailable", "Bu uygulamanın sipariş bağlamı yok.");
  return host.ordering;
}

function tableService(host: BridgeHost): TableServiceHost {
  if (host.tableService === undefined)
    throw new BridgeFailure("unavailable", "Bu uygulamanın masa servisi yok.");
  return host.tableService;
}

function location(host: BridgeHost): LocationHost {
  if (host.location === undefined)
    throw new BridgeFailure("unavailable", "Adres servisi kullanılamıyor.");
  return host.location;
}
function feedback(host: BridgeHost): FeedbackHost {
  if (host.feedback === undefined)
    throw new BridgeFailure("unavailable", "Değerlendirme ve favori servisi kullanılamıyor.");
  return host.feedback;
}
function returns(host: BridgeHost): ReturnsHost {
  if (host.returns === undefined)
    throw new BridgeFailure("unavailable", "İade servisi kullanılamıyor.");
  return host.returns;
}
function incentives(host: BridgeHost): IncentivesHost {
  if (host.incentives === undefined)
    throw new BridgeFailure("unavailable", "Teşvik servisi kullanılamıyor.");
  return host.incentives;
}
const handlers: Handlers = {
  "feedback.listReviews": (host, params) => feedback(host).listReviews(params),
  "feedback.createReview": (host, params) => feedback(host).createReview(params),
  "feedback.editReview": (host, params) => feedback(host).editReview(params),
  "feedback.listFavorites": (host, params) => feedback(host).listFavorites(params),
  "feedback.saveFavorite": (host, params) => feedback(host).saveFavorite(params),
  "returns.list": (host, params) => returns(host).list(params),
  "returns.create": (host, params) => returns(host).create(params),
  "returns.withdraw": (host, params) => returns(host).withdraw(params),
  "ordering.reorder": (host, params) => ordering(host).reorder(params),
  "incentives.getAvailable": (host, params) => incentives(host).getAvailable(params),
  "incentives.getLoyalty": (host, params) => incentives(host).getLoyalty(params),
  "incentives.applyCart": (host, params) => incentives(host).applyCart(params),
  "location.listCountries": (host, params) => location(host).listCountries(params),
  "location.listProvinces": (host, params) => location(host).listProvinces(params),
  "location.listDistricts": (host, params) => location(host).listDistricts(params),
  "location.listNeighborhoods": (host, params) => location(host).listNeighborhoods(params),
  "location.getNeighborhood": (host, params) => location(host).getNeighborhood(params),
  "location.listAddresses": (host, params) => location(host).listAddresses(params),
  "location.getAddress": (host, params) => location(host).getAddress(params),
  "location.createAddress": (host, params) => location(host).createAddress(params),
  "location.updateAddress": (host, params) => location(host).updateAddress(params),
  "location.archiveAddress": (host, params) => location(host).archiveAddress(params),

  "ordering.getDeliveryQuote": (host, params) => ordering(host).getDeliveryQuote(params),
  "ordering.getDeliverySnapshot": (host, params) => ordering(host).getDeliverySnapshot(params),
  "ordering.getStore": (host, params) => ordering(host).getStore(params),
  "ordering.getSlots": (host, params) => ordering(host).getSlots(params),
  "tableService.join": (host, params) => tableService(host).join(params),
  "tableService.get": (host, params) => tableService(host).get(params),
  "tableService.getBill": (host, params) => tableService(host).getBill(params),
  "tableService.request": (host, params) => tableService(host).request(params),
  "ordering.getEvents": (host, params) => ordering(host).getEvents(params),
  "ordering.listOrders": (host, params) => ordering(host).listOrders(params),
  "ordering.getCatalog": (host, params) => ordering(host).getCatalog(params),
  "ordering.openCart": (host, params) => ordering(host).openCart(params),
  "ordering.getCart": (host, params) => ordering(host).getCart(params),
  "ordering.replaceCart": (host, params) => ordering(host).replaceCart(params),
  "ordering.resetCart": (host, params) => ordering(host).resetCart(params),
  "ordering.checkout": (host, params) => ordering(host).checkout(params),
  "ordering.getOrder": (host, params) => ordering(host).getOrder(params),
  "container.getInfo": (host) => host.containerInfo(),
  "container.close": (host) => {
    host.close();
    return null;
  },
  "app.getContext": ({ miniApp, launchParams }) => ({
    appId: miniApp.id,
    version: miniApp.version,
    config: miniApp.config,
    params: launchParams,
  }),
  "identity.getProfile": (host) => host.getIdentity(),
  "identity.getToken": (host) => host.getIdentityToken(),
  "scanner.scanQr": async (host) => {
    const value = await host.scanQr();
    if (value === null) throw new BridgeFailure("user_denied", "QR okutmadan vazgeçildi.");
    return { value };
  },
  "location.getCurrent": async (host) => {
    const location = await host.getLocation();
    if (location === null) throw new BridgeFailure("user_denied", "Konum izni verilmedi.");
    return location;
  },
  "payment.request": async (host, params) => {
    const paymentId = await host.requestPayment(params);
    if (paymentId === null) throw new BridgeFailure("user_denied", "Ödemeden vazgeçildi.");
    return { paymentId, status: "paid" };
  },
  "storage.get": async (host, { key }) => ({ value: await host.storage.get(key) }),
  "storage.set": async (host, { key, value }) => {
    await host.storage.set(key, value);
    return null;
  },
  "storage.remove": async (host, { key }) => {
    await host.storage.remove(key);
    return null;
  },
  "share.open": async (host, params) => {
    await host.share(params);
    return null;
  },
};

async function run(method: BridgeMethod, rawParams: unknown, host: BridgeHost): Promise<unknown> {
  if (
    (method.startsWith("ordering.") ||
      method.startsWith("feedback.") ||
      method.startsWith("returns.") ||
      method === "incentives.applyCart") &&
    !host.miniApp.capabilities.includes("ordering.basic")
  )
    throw new BridgeFailure("capability_denied", "Bu mini uygulamanın sipariş yetkisi yok.");
  const capability = BRIDGE_METHODS[method];
  if (capability !== null && !host.miniApp.capabilities.includes(capability)) {
    throw new BridgeFailure(
      "capability_denied",
      `Bu mini uygulamanın şu yetkisi yok: ${CAPABILITY_LABELS[capability]}.`,
    );
  }

  const params = bridgeParamsSchemas[method].safeParse(rawParams);
  if (!params.success) {
    throw new BridgeFailure("invalid_params", `${method} için gönderilen bilgiler geçersiz.`);
  }

  if (capability !== null && requiresConsent(capability)) {
    const allowed = (await host.hasConsent(capability)) || (await host.askConsent(capability));
    if (!allowed) throw new BridgeFailure("user_denied", "Kullanıcı izin vermedi.");
  }

  // Parametreler yukarıda metodun kendi şemasıyla doğrulandı; derleyici bu eşleşmeyi izleyemez.
  const handler = handlers[method] as (host: BridgeHost, params: unknown) => unknown;
  return handler(host, params.data);
}

/**
 * İleti, sarmalayıcı belgenin "paket açıldığı belgeden ayrılmaya çalıştı" bildirimi mi?
 * Bildirim bir köprü isteği değildir; kabuk mini uygulamanın penceresini kapatır.
 */
export function isLeftNotice(raw: string): boolean {
  try {
    return bridgeLeftSchema.safeParse(JSON.parse(raw)).success;
  } catch {
    return false;
  }
}

/**
 * Mini uygulamadan gelen iletiyi işler ve geri gönderilecek yanıtı üretir.
 * İleti köprü protokolüne ait değilse `null` döner ve yok sayılır.
 */
export async function handleBridgeMessage(
  raw: unknown,
  host: BridgeHost,
): Promise<BridgeResponse | null> {
  let json: unknown;
  try {
    json = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  const request = bridgeRequestSchema.safeParse(json);
  if (!request.success) return null;

  const { id, method, params } = request.data;
  const reply = { vado: BRIDGE_PROTOCOL_VERSION, id } as const;
  try {
    if (!isBridgeMethod(method)) {
      throw new BridgeFailure("unknown_method", `Bilinmeyen metot: ${method}.`);
    }
    return { ...reply, ok: true, result: await run(method, params, host) };
  } catch (error) {
    if (error instanceof BridgeFailure) {
      return { ...reply, ok: false, error: { code: error.code, message: error.message } };
    }
    const message = error instanceof Error ? error.message : "İşlem tamamlanamadı.";
    return { ...reply, ok: false, error: { code: "failed", message } };
  }
}
