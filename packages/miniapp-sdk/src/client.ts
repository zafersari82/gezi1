import type {
  BRIDGE_PROTOCOL_VERSION,
  BridgeConnect,
  BridgeErrorCode,
  BridgeMethod,
  BridgeParams,
  BridgeRequest,
  BridgeResponse,
  BridgeResults,
  ContainerInfo,
  MiniAppContext,
  MiniAppIdentity,
  MiniAppIdentityToken,
  PaymentRequestParams,
  ShareParams,
} from "@vado/contracts";

/**
 * Bu dosya sözleşme paketinden yalnızca tip alır; derlenmiş mini uygulamaya
 * SDK dışında hiçbir bağımlılık girmez.
 */
const PROTOCOL_VERSION: typeof BRIDGE_PROTOCOL_VERSION = 1;
const CONNECT: BridgeConnect = { vado: PROTOCOL_VERSION, type: "connect" };

/** Kullanıcıdan yanıt beklemeyen çağrıların zaman aşımı. */
const QUICK_TIMEOUT_MS = 15_000;
/** Onay, kamera veya ödeme ekranı açan çağrıların zaman aşımı. */
const INTERACTIVE_TIMEOUT_MS = 5 * 60_000;

/** Kabuğun döndürdüğü hata. `code` alanı hatanın türünü belirtir. */
export class VadoError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VadoError";
  }
}

/** SDK'nın çalıştığı pencereden beklediği en küçük arayüz. */
export interface HostWindow {
  /** React Native WebView içinde tanımlıdır. */
  ReactNativeWebView?: { postMessage: (message: string) => void };
  /** Üst pencere; mini uygulama çerçeve içinde değilse pencerenin kendisidir. */
  parent?: {
    postMessage: (message: unknown, targetOrigin: string, transfer: Transferable[]) => void;
  } | null;
  addEventListener: (type: "message", listener: (event: MessageEvent) => void) => void;
}

interface PendingCall {
  resolve: (result: unknown) => void;
  reject: (error: VadoError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface Vado {
  feedback: {
    listReviews: (
      params: BridgeParams["feedback.listReviews"],
    ) => Promise<BridgeResults["feedback.listReviews"]>;
    createReview: (
      params: BridgeParams["feedback.createReview"],
    ) => Promise<BridgeResults["feedback.createReview"]>;
    editReview: (
      params: BridgeParams["feedback.editReview"],
    ) => Promise<BridgeResults["feedback.editReview"]>;
    listFavorites: (
      params: BridgeParams["feedback.listFavorites"],
    ) => Promise<BridgeResults["feedback.listFavorites"]>;
    saveFavorite: (
      params: BridgeParams["feedback.saveFavorite"],
    ) => Promise<BridgeResults["feedback.saveFavorite"]>;
  };
  returns: {
    list: (params: BridgeParams["returns.list"]) => Promise<BridgeResults["returns.list"]>;
    create: (params: BridgeParams["returns.create"]) => Promise<BridgeResults["returns.create"]>;
    withdraw: (
      params: BridgeParams["returns.withdraw"],
    ) => Promise<BridgeResults["returns.withdraw"]>;
  };
  incentives: {
    getAvailable: () => Promise<BridgeResults["incentives.getAvailable"]>;
    getLoyalty: () => Promise<BridgeResults["incentives.getLoyalty"]>;
    applyCart: (
      params: BridgeParams["incentives.applyCart"],
    ) => Promise<BridgeResults["incentives.applyCart"]>;
  };
  ordering: {
    reorder: (
      params: BridgeParams["ordering.reorder"],
    ) => Promise<BridgeResults["ordering.reorder"]>;
    getDeliveryQuote: (
      params: BridgeParams["ordering.getDeliveryQuote"],
    ) => Promise<BridgeResults["ordering.getDeliveryQuote"]>;
    getDeliverySnapshot: (
      params: BridgeParams["ordering.getDeliverySnapshot"],
    ) => Promise<BridgeResults["ordering.getDeliverySnapshot"]>;
    getRestaurant: () => Promise<BridgeResults["ordering.getRestaurant"]>;
    getSlots: (
      params: BridgeParams["ordering.getSlots"],
    ) => Promise<BridgeResults["ordering.getSlots"]>;
    joinTable: () => Promise<BridgeResults["ordering.joinTable"]>;
    getTable: (
      params: BridgeParams["ordering.getTable"],
    ) => Promise<BridgeResults["ordering.getTable"]>;
    getBill: (
      params: BridgeParams["ordering.getBill"],
    ) => Promise<BridgeResults["ordering.getBill"]>;
    requestService: (
      params: BridgeParams["ordering.requestService"],
    ) => Promise<BridgeResults["ordering.requestService"]>;
    getEvents: (
      params: BridgeParams["ordering.getEvents"],
    ) => Promise<BridgeResults["ordering.getEvents"]>;
    listOrders: (
      params: BridgeParams["ordering.listOrders"],
    ) => Promise<BridgeResults["ordering.listOrders"]>;
    onChange: (listener: () => void) => () => void;
    onConnection: (listener: (connected: boolean) => void) => () => void;
    getCatalog: (
      params: BridgeParams["ordering.getCatalog"],
    ) => Promise<BridgeResults["ordering.getCatalog"]>;
    openCart: (
      params: BridgeParams["ordering.openCart"],
    ) => Promise<BridgeResults["ordering.openCart"]>;
    getCart: (
      params: BridgeParams["ordering.getCart"],
    ) => Promise<BridgeResults["ordering.getCart"]>;
    replaceCart: (
      params: BridgeParams["ordering.replaceCart"],
    ) => Promise<BridgeResults["ordering.replaceCart"]>;
    resetCart: (
      params: BridgeParams["ordering.resetCart"],
    ) => Promise<BridgeResults["ordering.resetCart"]>;
    checkout: (
      params: BridgeParams["ordering.checkout"],
    ) => Promise<BridgeResults["ordering.checkout"]>;
    getOrder: (
      params: BridgeParams["ordering.getOrder"],
    ) => Promise<BridgeResults["ordering.getOrder"]>;
  };
  /** Mini uygulama VADO içinde mi çalışıyor? Tarayıcıda doğrudan açıldığında `false` döner. */
  isAvailable: () => boolean;
  container: {
    getInfo: () => Promise<ContainerInfo>;
    /** Mini uygulamayı kapatır ve kullanıcıyı VADO'ya geri götürür. */
    close: () => Promise<void>;
  };
  app: {
    /**
     * Mini uygulamanın hangi uygulama kaydı olarak açıldığını ve işletmenin ayarlarını döndürür.
     * Aynı paketi kullanan her işletme kendi ayarlarını alır.
     */
    getContext: () => Promise<MiniAppContext>;
  };
  identity: {
    /** Kullanıcının adını, fotoğrafını ve bu mini uygulamaya özel kimliğini döndürür. */
    getProfile: () => Promise<MiniAppIdentity>;
    /**
     * Mini uygulamanın kendi sunucusuna göndereceği, VADO'nun imzaladığı kısa ömürlü kimlik
     * belirtecini döndürür. Sunucu belirteci VADO'nun yayımladığı açık anahtarlarla doğrular;
     * köprüden gelen `openId` değerine sunucuda güvenilmez.
     */
    getToken: () => Promise<MiniAppIdentityToken>;
  };
  scanner: {
    scanQr: () => Promise<string>;
  };
  location: {
    getCurrent: () => Promise<BridgeResults["location.getCurrent"]>;
    listCountries: () => Promise<BridgeResults["location.listCountries"]>;
    listProvinces: (
      params: BridgeParams["location.listProvinces"],
    ) => Promise<BridgeResults["location.listProvinces"]>;
    listDistricts: (
      params: BridgeParams["location.listDistricts"],
    ) => Promise<BridgeResults["location.listDistricts"]>;
    listNeighborhoods: (
      params: BridgeParams["location.listNeighborhoods"],
    ) => Promise<BridgeResults["location.listNeighborhoods"]>;
    getNeighborhood: (
      params: BridgeParams["location.getNeighborhood"],
    ) => Promise<BridgeResults["location.getNeighborhood"]>;
    listAddresses: () => Promise<BridgeResults["location.listAddresses"]>;
    getAddress: (
      params: BridgeParams["location.getAddress"],
    ) => Promise<BridgeResults["location.getAddress"]>;
    createAddress: (
      params: BridgeParams["location.createAddress"],
    ) => Promise<BridgeResults["location.createAddress"]>;
    updateAddress: (
      params: BridgeParams["location.updateAddress"],
    ) => Promise<BridgeResults["location.updateAddress"]>;
    archiveAddress: (
      params: BridgeParams["location.archiveAddress"],
    ) => Promise<BridgeResults["location.archiveAddress"]>;
  };
  payment: {
    /** VADO ödeme ekranını açar. Kullanıcı vazgeçerse `user_denied` hatası fırlatır. */
    request: (params: PaymentRequestParams) => Promise<BridgeResults["payment.request"]>;
  };
  storage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  share: {
    open: (params: ShareParams) => Promise<void>;
  };
}

/** Gelen iletiyi köprü yanıtı olarak çözümler; başka kaynaklardan gelen iletiler için `null` döner. */
function parseResponse(data: unknown): BridgeResponse | null {
  if (typeof data !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { vado, id, ok } = value as Record<string, unknown>;
  if (vado !== PROTOCOL_VERSION || typeof id !== "string" || typeof ok !== "boolean") return null;
  return value as BridgeResponse;
}

/** Mini uygulama bir çerçevenin içindeyse üst pencere: sarmalayıcı belge ya da web önizlemesi. */
function frameParent(host: HostWindow): NonNullable<HostWindow["parent"]> | null {
  const { parent } = host;
  return parent !== undefined && parent !== null && !Object.is(parent, host) ? parent : null;
}

export function createVado(host: HostWindow | undefined): Vado {
  const pending = new Map<string, PendingCall>();
  const changes = new Set<() => void>();
  const connections = new Set<(connected: boolean) => void>();
  let counter = 0;
  /** Kabuğa ileti gönderen işlev; ilk çağrıda kurulur. */
  let post: ((message: string) => void) | null = null;

  function onMessage(event: MessageEvent): void {
    if (typeof event.data === "string") {
      let notice: unknown;
      try {
        notice = JSON.parse(event.data);
      } catch {
        notice = null;
      }
      if (
        typeof notice === "object" &&
        notice !== null &&
        "vado" in notice &&
        notice.vado === PROTOCOL_VERSION &&
        "type" in notice &&
        notice.type === "event" &&
        "name" in notice
      ) {
        if (notice.name === "ordering.changed") for (const listener of changes) listener();
        if (
          notice.name === "ordering.connection" &&
          "connected" in notice &&
          typeof notice.connected === "boolean"
        )
          for (const listener of connections) listener(notice.connected);
        return;
      }
    }
    const response = parseResponse(event.data);
    if (response === null) return;

    const call = pending.get(response.id);
    if (call === undefined) return;
    pending.delete(response.id);
    clearTimeout(call.timer);
    if (response.ok) call.resolve(response.result);
    else call.reject(new VadoError(response.error.code, response.error.message));
  }

  /**
   * Kabukla ileti yolunu kurar.
   *
   * Çerçeve içinde: üst pencereye bir ileti kapısı verilir; istekler ve yanıtlar yalnızca o
   * kapıdan geçer, böylece başka hiçbir pencere araya giremez. Yayındaki paket her zaman VADO'nun
   * sarmalayıcı belgesindeki çerçevede açılır; web önizlemesinde geliştirme sayfası da kabuğun
   * çerçevesindedir. Telefonda WebView'in ileti nesnesi alt çerçevelerde de görünebilir; çerçeve
   * içindeki sayfa onu kullanmaz, çünkü kabuk yalnızca sarmalayıcıdan gelen iletileri kabul eder.
   *
   * Çerçeve dışında (telefonda geliştirme adresiyle açılan sayfa): istekler WebView'in ileti
   * kanalından gider, yanıtlar pencereye "message" olayı olarak gelir.
   */
  function connect(): ((message: string) => void) | null {
    if (post !== null || host === undefined) return post;
    const webView = host.ReactNativeWebView;
    const parent = frameParent(host);

    if (parent !== null) {
      const channel = new MessageChannel();
      channel.port1.onmessage = onMessage;
      // Mini uygulama üst pencerenin adresini bilmez; bu ileti yalnızca kapıyı taşır, veri taşımaz.
      parent.postMessage(CONNECT, "*", [channel.port2]);
      post = (message) => {
        channel.port1.postMessage(message);
      };
    } else if (webView !== undefined) {
      host.addEventListener("message", onMessage);
      post = (message) => {
        webView.postMessage(message);
      };
    }
    return post;
  }

  function call<Method extends BridgeMethod>(
    method: Method,
    params: unknown,
    timeoutMs: number,
  ): Promise<BridgeResults[Method]> {
    const send = connect();
    if (send === null) {
      return Promise.reject(
        new VadoError("unavailable", "Bu mini uygulama yalnızca VADO içinde çalışır."),
      );
    }

    counter += 1;
    const id = `${Date.now().toString(36)}-${counter}`;
    const request: BridgeRequest = { vado: PROTOCOL_VERSION, id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new VadoError("failed", `VADO yanıt vermedi: ${method}`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (result) => {
          resolve(result as BridgeResults[Method]);
        },
        reject,
        timer,
      });
      send(JSON.stringify(request));
    });
  }

  const quick = <Method extends BridgeMethod>(method: Method, params?: unknown) =>
    call(method, params, QUICK_TIMEOUT_MS);
  const interactive = <Method extends BridgeMethod>(method: Method, params?: unknown) =>
    call(method, params, INTERACTIVE_TIMEOUT_MS);

  return {
    feedback: {
      listReviews: (params) => quick("feedback.listReviews", params),
      createReview: (params) => quick("feedback.createReview", params),
      editReview: (params) => quick("feedback.editReview", params),
      listFavorites: (params) => quick("feedback.listFavorites", params),
      saveFavorite: (params) => quick("feedback.saveFavorite", params),
    },
    returns: {
      list: (params) => quick("returns.list", params),
      create: (params) => quick("returns.create", params),
      withdraw: (params) => quick("returns.withdraw", params),
    },
    incentives: {
      getAvailable: () => quick("incentives.getAvailable"),
      getLoyalty: () => quick("incentives.getLoyalty"),
      applyCart: (params) => interactive("incentives.applyCart", params),
    },
    ordering: {
      reorder: (params) => quick("ordering.reorder", params),
      getDeliveryQuote: (params) => interactive("ordering.getDeliveryQuote", params),
      getDeliverySnapshot: (params) => interactive("ordering.getDeliverySnapshot", params),
      getRestaurant: () => quick("ordering.getRestaurant"),
      getSlots: (params) => quick("ordering.getSlots", params),
      joinTable: () => quick("ordering.joinTable"),
      getTable: (params) => quick("ordering.getTable", params),
      getBill: (params) => quick("ordering.getBill", params),
      requestService: (params) => quick("ordering.requestService", params),
      getEvents: (params) => quick("ordering.getEvents", params),
      listOrders: (params) => quick("ordering.listOrders", params),
      onChange(listener) {
        connect();
        changes.add(listener);
        return () => {
          changes.delete(listener);
        };
      },
      onConnection(listener) {
        connect();
        connections.add(listener);
        return () => {
          connections.delete(listener);
        };
      },
      getCatalog: (params) => quick("ordering.getCatalog", params),
      openCart: (params) => quick("ordering.openCart", params),
      getCart: (params) => quick("ordering.getCart", params),
      replaceCart: (params) => quick("ordering.replaceCart", params),
      resetCart: (params) => quick("ordering.resetCart", params),
      checkout: (params) => quick("ordering.checkout", params),
      getOrder: (params) => quick("ordering.getOrder", params),
    },
    isAvailable: () =>
      host !== undefined && (host.ReactNativeWebView !== undefined || frameParent(host) !== null),
    container: {
      getInfo: () => quick("container.getInfo"),
      close: async () => {
        await quick("container.close");
      },
    },
    app: {
      getContext: () => quick("app.getContext"),
    },
    identity: {
      getProfile: () => interactive("identity.getProfile"),
      getToken: () => interactive("identity.getToken"),
    },
    scanner: {
      scanQr: async () => (await interactive("scanner.scanQr")).value,
    },
    location: {
      getCurrent: () => interactive("location.getCurrent"),
      listCountries: () => interactive("location.listCountries"),
      listProvinces: (params) => interactive("location.listProvinces", params),
      listDistricts: (params) => interactive("location.listDistricts", params),
      listNeighborhoods: (params) => interactive("location.listNeighborhoods", params),
      getNeighborhood: (params) => interactive("location.getNeighborhood", params),
      listAddresses: () => interactive("location.listAddresses"),
      getAddress: (params) => interactive("location.getAddress", params),
      createAddress: (params) => interactive("location.createAddress", params),
      updateAddress: (params) => interactive("location.updateAddress", params),
      archiveAddress: (params) => interactive("location.archiveAddress", params),
    },
    payment: {
      request: (params) => interactive("payment.request", params),
    },
    storage: {
      get: async (key) => (await quick("storage.get", { key })).value,
      set: async (key, value) => {
        await quick("storage.set", { key, value });
      },
      remove: async (key) => {
        await quick("storage.remove", { key });
      },
    },
    share: {
      open: async (params) => {
        await interactive("share.open", params);
      },
    },
  };
}
