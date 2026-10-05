import type { BridgeError, BridgeRequest } from "@vado/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createVado, type HostWindow, VadoError } from "../src";

type Outcome = { ok: true; result: unknown } | { ok: false; error: BridgeError };

/** Kabuğu taklit eden pencere: gönderilen istekleri toplar, yanıtları mesaj olayı olarak iletir. */
function fakeShell() {
  const target = new EventTarget();
  const requests: BridgeRequest[] = [];
  const host: HostWindow = {
    ReactNativeWebView: {
      postMessage: (message) => requests.push(JSON.parse(message) as BridgeRequest),
    },
    addEventListener: (type, listener) => {
      target.addEventListener(type, listener as EventListener);
    },
  };
  const deliver = (data: unknown) => target.dispatchEvent(new MessageEvent("message", { data }));
  const reply = (response: { id: string } & Outcome) =>
    deliver(JSON.stringify({ vado: 1, ...response }));
  const last = () => {
    const request = requests.at(-1);
    if (request === undefined) throw new Error("istek gönderilmedi");
    return request;
  };
  return { host, requests, deliver, reply, last };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("mini uygulama SDK'sı", () => {
  it("isteği sürüm numaralı zarfla gönderir ve yanıtı döndürür", async () => {
    const shell = fakeShell();
    const vado = createVado(shell.host);

    const profile = vado.identity.getProfile();
    expect(shell.last()).toMatchObject({ vado: 1, method: "identity.getProfile" });
    shell.reply({
      id: shell.last().id,
      ok: true,
      result: { openId: "abc", displayName: "Ayşe", avatarUrl: null },
    });

    await expect(profile).resolves.toEqual({ openId: "abc", displayName: "Ayşe", avatarUrl: null });
  });

  it("kimlik belirtecini köprüden ister", async () => {
    const shell = fakeShell();
    const vado = createVado(shell.host);
    const token = vado.identity.getToken();
    expect(shell.last()).toMatchObject({ vado: 1, method: "identity.getToken" });
    shell.reply({
      id: shell.last().id,
      ok: true,
      result: { token: "a.b.c", expiresAt: "2026-10-05T12:05:00.000Z" },
    });
    await expect(token).resolves.toEqual({ token: "a.b.c", expiresAt: "2026-10-05T12:05:00.000Z" });
  });

  it("parametreleri iletir ve sonucu sadeleştirir", async () => {
    const shell = fakeShell();
    const vado = createVado(shell.host);

    const value = vado.storage.get("son-randevu");
    expect(shell.last().params).toEqual({ key: "son-randevu" });
    shell.reply({ id: shell.last().id, ok: true, result: { value: "13:00" } });
    await expect(value).resolves.toBe("13:00");

    const payment = vado.payment.request({
      merchantId: "kadikoy-berber",
      orderId: "rnd-1",
      description: "Saç kesimi",
      amountMinor: 65_000,
    });
    expect(shell.last()).toMatchObject({
      method: "payment.request",
      params: { amountMinor: 65_000 },
    });
    shell.reply({ id: shell.last().id, ok: true, result: { paymentId: "p1", status: "paid" } });
    await expect(payment).resolves.toEqual({ paymentId: "p1", status: "paid" });
  });

  it("hata yanıtını kodu ve iletisiyle fırlatır", async () => {
    const shell = fakeShell();
    const vado = createVado(shell.host);

    const payment = vado.payment.request({
      merchantId: "kadikoy-berber",
      orderId: "rnd-2",
      description: "Sakal",
      amountMinor: 30_000,
    });
    shell.reply({
      id: shell.last().id,
      ok: false,
      error: { code: "user_denied", message: "Ödemeden vazgeçildi." },
    });

    await expect(payment).rejects.toBeInstanceOf(VadoError);
    await expect(payment).rejects.toMatchObject({
      code: "user_denied",
      message: "Ödemeden vazgeçildi.",
    });
  });

  it("eş zamanlı çağrıları kimlikleriyle eşleştirir", async () => {
    const shell = fakeShell();
    const vado = createVado(shell.host);

    const first = vado.storage.get("a");
    const second = vado.storage.get("b");
    const [firstRequest, secondRequest] = shell.requests;

    shell.reply({ id: secondRequest?.id ?? "", ok: true, result: { value: "ikinci" } });
    shell.reply({ id: firstRequest?.id ?? "", ok: true, result: { value: "birinci" } });
    await expect(first).resolves.toBe("birinci");
    await expect(second).resolves.toBe("ikinci");
  });

  it("tanımadığı, bozuk ve başka sürüme ait iletileri yok sayar", async () => {
    const shell = fakeShell();
    const vado = createVado(shell.host);
    const info = vado.container.getInfo();
    const { id } = shell.last();

    shell.deliver("{bozuk json");
    shell.deliver({ vado: 1, id, ok: true, result: "nesne olarak gelen ileti" });
    shell.deliver(JSON.stringify({ vado: 2, id, ok: true, result: "yanlış sürüm" }));
    shell.reply({ id: "baska-istek", ok: true, result: "başka istek" });

    const result = {
      platform: "android",
      appVersion: "2.0.0",
      locale: "tr-TR",
      protocolVersion: 1,
    };
    shell.reply({ id, ok: true, result });
    await expect(info).resolves.toEqual(result);
  });

  it("kabuk yanıt vermezse zaman aşımına uğrar", async () => {
    vi.useFakeTimers();
    const shell = fakeShell();
    const vado = createVado(shell.host);

    const value = vado.storage.get("anahtar");
    const assertion = expect(value).rejects.toMatchObject({ code: "failed" });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it("VADO dışında çalışırken bunu bildirir", async () => {
    const outside = createVado(undefined);
    expect(outside.isAvailable()).toBe(false);
    await expect(outside.identity.getProfile()).rejects.toMatchObject({ code: "unavailable" });

    const plainBrowser = createVado({ addEventListener: () => undefined, parent: null });
    expect(plainBrowser.isAvailable()).toBe(false);
  });

  it("uygulama kaydının bağlamını ve işletme ayarlarını ister", async () => {
    const shell = fakeShell();
    const vado = createVado(shell.host);

    const context = vado.app.getContext();
    expect(shell.last()).toMatchObject({ vado: 1, method: "app.getContext" });
    const result = {
      appId: "kadikoy-berber",
      version: "1.2.0",
      config: { businessName: "Kadıköy Berber" },
      params: {},
    };
    shell.reply({ id: shell.last().id, ok: true, result });
    await expect(context).resolves.toEqual(result);
  });

  it("çerçeve içindeyken WebView'in ileti nesnesini değil üst pencereyi kullanır", () => {
    const shell = fakeShell();
    const handed: unknown[] = [];
    const framed = createVado({
      ...shell.host,
      addEventListener: () => {
        throw new Error("Çerçeve içinde pencere iletileri dinlenmemeli");
      },
      parent: { postMessage: (message) => handed.push(message) },
    });

    void framed.container.getInfo().catch(() => undefined);
    expect(handed).toEqual([{ vado: 1, type: "connect" }]);
    expect(shell.requests).toEqual([]);
  });

  it("çerçeve içinde üst pencereye bir ileti kapısı verir ve yalnızca o kapıdan konuşur", async () => {
    const handed: { message: unknown; targetOrigin: string; ports: Transferable[] }[] = [];
    const framed = createVado({
      addEventListener: () => {
        throw new Error("Çerçeve içinde pencere iletileri dinlenmemeli");
      },
      parent: {
        postMessage: (message, targetOrigin, ports) =>
          handed.push({ message, targetOrigin, ports }),
      },
    });

    expect(framed.isAvailable()).toBe(true);
    // Kapı ilk çağrıda verilir; kabukla hiç konuşmayan sayfa ileti göndermez.
    expect(handed).toEqual([]);

    const info = framed.container.getInfo();
    expect(handed).toHaveLength(1);
    expect(handed[0]).toMatchObject({ message: { vado: 1, type: "connect" }, targetOrigin: "*" });
    const port = handed[0]?.ports[0] as MessagePort;
    const requests: BridgeRequest[] = [];
    const received = new Promise<void>((resolve) => {
      port.onmessage = (event) => {
        requests.push(JSON.parse(event.data as string) as BridgeRequest);
        if (requests.length === 2) resolve();
      };
    });

    const stored = framed.storage.get("anahtar");
    await received;
    // İkinci çağrı aynı kapıyı kullanır; üst pencereye yeni bir kapı verilmez.
    expect(handed).toHaveLength(1);
    expect(requests.map((request) => request.method)).toEqual(["container.getInfo", "storage.get"]);

    const result = { platform: "web", appVersion: "2.3.1", locale: "tr-TR", protocolVersion: 1 };
    port.postMessage(JSON.stringify({ vado: 1, id: requests[0]?.id, ok: true, result }));
    port.postMessage(
      JSON.stringify({ vado: 1, id: requests[1]?.id, ok: true, result: { value: "13:00" } }),
    );
    await expect(info).resolves.toEqual(result);
    await expect(stored).resolves.toBe("13:00");
    port.close();
  });
});
