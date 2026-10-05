import {
  type Capability,
  type ConsentCapability,
  type MiniAppDetail,
  type PaymentRequestParams,
} from "@vado/contracts";
import { describe, expect, it } from "vitest";

import { type BridgeHost, handleBridgeMessage, isLeftNotice } from "@/features/miniapps/bridge";

const ALL_CAPABILITIES: Capability[] = [
  "identity.basic",
  "camera.qr",
  "location.coarse",
  "payment.request",
  "storage.local",
  "share.native",
];

const PAYMENT: PaymentRequestParams = {
  merchantId: "kadikoy-berber",
  orderId: "siparis-1001",
  description: "Saç kesimi",
  amountMinor: 65_000,
};

interface HostOptions {
  capabilities?: Capability[];
  /** Kullanıcının daha önce kalıcı izin verdiği yetkiler. */
  granted?: ConsentCapability[];
  /** İzin sorulduğunda kullanıcının vereceği yanıt. */
  answer?: boolean;
  scanResult?: string | null;
  paymentResult?: string | null;
  launchParams?: Record<string, string>;
}

function createHost(options: HostOptions = {}) {
  const granted = new Set<ConsentCapability>(options.granted);
  const stored = new Map<string, string>();
  const calls: string[] = [];

  const miniApp: MiniAppDetail = {
    id: "randevu",
    name: "Randevu",
    description: "Berber randevusu",
    iconUrl: null,
    source: "package",
    entryUrl: "https://api.example/apps/randevu/wrapper/0f/",
    scope: [
      "https://api.example/apps/randevu/wrapper/0f/",
      "https://api.example/apps/randevu/files/0f/",
    ],
    consentKey: "izin-anahtari",
    capabilities: options.capabilities ?? ALL_CAPABILITIES,
    version: "1.0.0",
    category: "beauty",
    developerName: "Örnek Yazılım",
    verified: true,
    config: { businessName: "Kadıköy Berber", seats: 3 },
  };

  const host: BridgeHost = {
    miniApp,
    launchParams: options.launchParams ?? {},
    containerInfo: () => ({
      platform: "android",
      appVersion: "2.0.0",
      locale: "tr-TR",
      protocolVersion: 1,
    }),
    close: () => {
      calls.push("close");
    },
    hasConsent: (capability) => Promise.resolve(granted.has(capability)),
    askConsent: (capability) => {
      calls.push(`ask:${capability}`);
      if (options.answer === true) granted.add(capability);
      return Promise.resolve(options.answer === true);
    },
    getIdentity: () => {
      calls.push("identity");
      return Promise.resolve({ openId: "open-123", displayName: "Ayşe", avatarUrl: null });
    },
    getIdentityToken: () => {
      calls.push("token");
      return Promise.resolve({ token: "a.b.c", expiresAt: "2026-10-05T12:05:00.000Z" });
    },
    scanQr: () => Promise.resolve(options.scanResult ?? null),
    getLocation: () => Promise.resolve(null),
    requestPayment: (params) => {
      calls.push(`pay:${params.orderId}:${params.amountMinor}`);
      return Promise.resolve(options.paymentResult ?? null);
    },
    storage: {
      get: (key) => Promise.resolve(stored.get(key) ?? null),
      set: (key, value) => {
        stored.set(key, value);
        return Promise.resolve();
      },
      remove: (key) => {
        stored.delete(key);
        return Promise.resolve();
      },
    },
    share: (params) => {
      calls.push(`share:${params.title}`);
      return Promise.resolve();
    },
  };

  return { host, calls, stored };
}

const request = (method: string, params?: unknown, id = "1") => ({ vado: 1, id, method, params });

describe("sarmalayıcı belgenin ayrılma bildirimi", () => {
  it("bildirimi tanır", () => {
    expect(isLeftNotice('{"vado":1,"type":"left"}')).toBe(true);
  });

  it("köprü isteklerini, bağlantı iletisini ve bozuk iletileri bildirim saymaz", () => {
    for (const raw of [
      JSON.stringify(request("container.getInfo")),
      '{"vado":1,"type":"connect"}',
      '{"vado":2,"type":"left"}',
      '{"type":"left"}',
      '"left"',
      "left",
      "bozuk json {",
      "",
    ]) {
      expect(isLeftNotice(raw), raw).toBe(false);
    }
  });

  it("bildirim bir köprü isteği olarak yanıtlanmaz", async () => {
    const { host } = createHost();
    expect(await handleBridgeMessage('{"vado":1,"type":"left"}', host)).toBeNull();
  });
});

describe("handleBridgeMessage", () => {
  it("köprü protokolüne ait olmayan iletileri yok sayar", async () => {
    const { host } = createHost();
    expect(await handleBridgeMessage("bozuk json {", host)).toBeNull();
    expect(await handleBridgeMessage({ type: "webpackOk" }, host)).toBeNull();
    expect(
      await handleBridgeMessage({ ...request("container.getInfo"), vado: 2 }, host),
    ).toBeNull();
    expect(await handleBridgeMessage(null, host)).toBeNull();
  });

  it("metin olarak gelen isteği çözer ve aynı kimlikle yanıtlar", async () => {
    const { host } = createHost();
    const response = await handleBridgeMessage(
      JSON.stringify(request("container.getInfo", undefined, "istek-7")),
      host,
    );
    expect(response).toEqual({
      vado: 1,
      id: "istek-7",
      ok: true,
      result: { platform: "android", appVersion: "2.0.0", locale: "tr-TR", protocolVersion: 1 },
    });
  });

  it("bilinmeyen metodu reddeder", async () => {
    const { host } = createHost();
    const response = await handleBridgeMessage(request("contacts.readAll"), host);
    expect(response).toMatchObject({ ok: false, error: { code: "unknown_method" } });
  });

  it("nesne zincirindeki adları metot saymaz", async () => {
    const { host } = createHost();
    const response = await handleBridgeMessage(request("constructor"), host);
    expect(response).toMatchObject({ ok: false, error: { code: "unknown_method" } });
  });

  it("onaylanmamış yetkiyi kullanıcıya sormadan reddeder", async () => {
    const { host, calls } = createHost({ capabilities: ["storage.local"] });
    const response = await handleBridgeMessage(request("identity.getProfile"), host);
    expect(response).toMatchObject({ ok: false, error: { code: "capability_denied" } });
    expect(calls).toEqual([]);
  });

  it("kimlik için önce izin sorar, izin verilince bir daha sormaz", async () => {
    const { host, calls } = createHost({ answer: true });
    const first = await handleBridgeMessage(request("identity.getProfile"), host);
    const second = await handleBridgeMessage(request("identity.getProfile", undefined, "2"), host);

    expect(first).toMatchObject({ ok: true, result: { openId: "open-123", displayName: "Ayşe" } });
    expect(second).toMatchObject({ id: "2", ok: true });
    expect(calls).toEqual(["ask:identity.basic", "identity", "identity"]);
  });

  it("kimlik belirteci de kimlik yetkisine ve aynı izne bağlıdır", async () => {
    const denied = createHost({ capabilities: ["storage.local"] });
    expect(await handleBridgeMessage(request("identity.getToken"), denied.host)).toMatchObject({
      ok: false,
      error: { code: "capability_denied" },
    });
    const refused = createHost({ answer: false });
    expect(await handleBridgeMessage(request("identity.getToken"), refused.host)).toMatchObject({
      ok: false,
      error: { code: "user_denied" },
    });
    expect(refused.calls).toEqual(["ask:identity.basic"]);

    const { host, calls } = createHost({ answer: true });
    const profile = await handleBridgeMessage(request("identity.getProfile"), host);
    const token = await handleBridgeMessage(request("identity.getToken", undefined, "2"), host);
    expect(profile).toMatchObject({ ok: true });
    expect(token).toMatchObject({ ok: true, result: { token: "a.b.c" } });
    expect(calls).toEqual(["ask:identity.basic", "identity", "token"]);
  });

  it("kullanıcı izin vermezse kimliği paylaşmaz", async () => {
    const { host, calls } = createHost({ answer: false });
    const response = await handleBridgeMessage(request("identity.getProfile"), host);
    expect(response).toMatchObject({ ok: false, error: { code: "user_denied" } });
    expect(calls).toEqual(["ask:identity.basic"]);
  });

  it("geçersiz ödeme bilgisinde ödeme ekranını açmaz", async () => {
    const { host, calls } = createHost();
    for (const params of [
      undefined,
      { ...PAYMENT, amountMinor: -5 },
      { ...PAYMENT, amountMinor: 12.5 },
      { ...PAYMENT, merchantId: "" },
    ]) {
      const response = await handleBridgeMessage(request("payment.request", params), host);
      expect(response).toMatchObject({ ok: false, error: { code: "invalid_params" } });
    }
    expect(calls).toEqual([]);
  });

  it("ödeme onaylanınca ödeme kimliğini döndürür", async () => {
    const { host, calls } = createHost({ paymentResult: "odeme-42" });
    const response = await handleBridgeMessage(request("payment.request", PAYMENT), host);
    expect(response).toMatchObject({ ok: true, result: { paymentId: "odeme-42", status: "paid" } });
    expect(calls).toEqual(["pay:siparis-1001:65000"]);
  });

  it("kullanıcı ödemeden vazgeçerse hata döndürür", async () => {
    const { host } = createHost({ paymentResult: null });
    const response = await handleBridgeMessage(request("payment.request", PAYMENT), host);
    expect(response).toMatchObject({ ok: false, error: { code: "user_denied" } });
  });

  it("depolamada yazılanı okur, silineni null döndürür", async () => {
    const { host, stored } = createHost();
    await handleBridgeMessage(request("storage.set", { key: "son-randevu", value: "10:30" }), host);
    expect(stored.get("son-randevu")).toBe("10:30");

    const read = await handleBridgeMessage(request("storage.get", { key: "son-randevu" }), host);
    expect(read).toMatchObject({ ok: true, result: { value: "10:30" } });

    await handleBridgeMessage(request("storage.remove", { key: "son-randevu" }), host);
    const missing = await handleBridgeMessage(request("storage.get", { key: "son-randevu" }), host);
    expect(missing).toMatchObject({ ok: true, result: { value: null } });
  });

  it("depolama anahtarında yol ayracına izin vermez", async () => {
    const { host, stored } = createHost();
    const response = await handleBridgeMessage(
      request("storage.set", { key: "../baska-uygulama", value: "x" }),
      host,
    );
    expect(response).toMatchObject({ ok: false, error: { code: "invalid_params" } });
    expect(stored.size).toBe(0);
  });

  it("QR okutmadan vazgeçilirse hata, okutulursa değeri döndürür", async () => {
    const cancelled = createHost({ granted: ["camera.qr"], scanResult: null });
    expect(await handleBridgeMessage(request("scanner.scanQr"), cancelled.host)).toMatchObject({
      ok: false,
      error: { code: "user_denied" },
    });

    const scanned = createHost({ granted: ["camera.qr"], scanResult: "MASA-12" });
    expect(await handleBridgeMessage(request("scanner.scanQr"), scanned.host)).toMatchObject({
      ok: true,
      result: { value: "MASA-12" },
    });
    expect(scanned.calls).toEqual([]);
  });

  it("kabuktaki beklenmeyen hatayı mini uygulamaya genel hata olarak bildirir", async () => {
    const { host } = createHost();
    host.share = () => Promise.reject(new Error("Paylaşım açılamadı."));
    const response = await handleBridgeMessage(request("share.open", { title: "Randevum" }), host);
    expect(response).toEqual({
      vado: 1,
      id: "1",
      ok: false,
      error: { code: "failed", message: "Paylaşım açılamadı." },
    });
  });

  it("kapatma isteğini kabuğa iletir", async () => {
    const { host, calls } = createHost();
    const response = await handleBridgeMessage(request("container.close"), host);
    expect(response).toMatchObject({ ok: true, result: null });
    expect(calls).toEqual(["close"]);
  });

  it("uygulama kaydının kimliğini, sürümünü ve işletme ayarlarını yetki istemeden verir", async () => {
    const { host, calls } = createHost({ capabilities: [] });
    const response = await handleBridgeMessage(request("app.getContext"), host);
    expect(response).toEqual({
      vado: 1,
      id: "1",
      ok: true,
      result: {
        appId: "randevu",
        version: "1.0.0",
        config: { businessName: "Kadıköy Berber", seats: 3 },
        params: {},
      },
    });
    expect(calls).toEqual([]);
  });

  it("uygulamayı açan kodun imzalı parametrelerini bağlamda verir", async () => {
    const { host } = createHost({ launchParams: { masa: "12", sube: "kadikoy" } });
    const response = await handleBridgeMessage(request("app.getContext"), host);
    expect(response).toMatchObject({
      ok: true,
      result: { params: { masa: "12", sube: "kadikoy" } },
    });
  });
});
