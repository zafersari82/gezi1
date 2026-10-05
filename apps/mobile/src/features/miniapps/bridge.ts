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
  type PaymentRequestParams,
  requiresConsent,
  type ShareParams,
} from "@vado/contracts";

/**
 * Köprünün kabuktan beklediği işlevler. Mini uygulama ekranı gerçek uygulamaları verir;
 * bu sayede köprü mantığı telefona ve tarayıcıya bağlı olmadan sınanabilir.
 */
export interface BridgeHost {
  miniApp: MiniAppDetail;
  containerInfo: () => ContainerInfo;
  close: () => void;
  /** Kullanıcı bu yetkiye daha önce kalıcı izin vermiş mi? */
  hasConsent: (capability: ConsentCapability) => Promise<boolean>;
  /** Kullanıcıya izin sorar; verirse izni kalıcı olarak kaydeder. */
  askConsent: (capability: ConsentCapability) => Promise<boolean>;
  getIdentity: () => Promise<MiniAppIdentity>;
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

const handlers: Handlers = {
  "container.getInfo": (host) => host.containerInfo(),
  "container.close": (host) => {
    host.close();
    return null;
  },
  "app.getContext": ({ miniApp }) => ({
    appId: miniApp.id,
    version: miniApp.version,
    config: miniApp.config,
    params: {},
  }),
  "identity.getProfile": (host) => host.getIdentity(),
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
