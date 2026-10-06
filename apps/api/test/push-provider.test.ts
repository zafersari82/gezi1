import { afterEach, describe, expect, it, vi } from "vitest";

import { createPushProvider, type PushMessage } from "../src/providers/push";

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const message = (index: number): PushMessage => ({
  to: `ExponentPushToken[t${String(index)}]`,
  title: "VADO",
  body: "Yeni mesajın var",
  data: { type: "new_device" },
});

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: unknown[];
}

/** Expo'nun yanıtını taklit eder; gerçek ağa çıkılmaz. */
function fakeExpo(reply: (body: unknown[]) => Response): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as unknown[];
    calls.push({ url, headers: init.headers as Record<string, string>, body });
    return Promise.resolve(reply(body));
  });
  return calls;
}

describe("Expo bildirim sağlayıcısı", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("100'lük gruplar halinde gönderir; geçersiz adresi ayırt eder", async () => {
    const calls = fakeExpo(
      (body) =>
        new Response(
          JSON.stringify({
            data: body.map((_, index) =>
              index === 1
                ? { status: "error", details: { error: "DeviceNotRegistered" } }
                : index === 2
                  ? { status: "error", details: { error: "MessageRateExceeded" } }
                  : { status: "ok", id: "x" },
            ),
          }),
          { status: 200 },
        ),
    );
    const provider = createPushProvider({ provider: "expo", accessToken: "gizli" }, log);
    const outcomes = await provider.send(Array.from({ length: 150 }, (_, index) => message(index)));

    expect(calls.map((call) => call.body.length)).toEqual([100, 50]);
    expect(calls[0]?.url).toBe("https://exp.host/--/api/v2/push/send");
    expect(calls[0]?.headers.authorization).toBe("Bearer gizli");
    expect(calls[0]?.body[0]).toMatchObject({ to: "ExponentPushToken[t0]", sound: "default" });
    expect(outcomes.slice(0, 3)).toEqual(["sent", "invalid", "failed"]);
    expect(outcomes.slice(100, 103)).toEqual(["sent", "invalid", "failed"]);
  });

  it("erişim belirteci yoksa başlık gönderilmez; hatalı yanıtta hepsi başarısız sayılır", async () => {
    const calls = fakeExpo(() => new Response("bakımda", { status: 503 }));
    const provider = createPushProvider({ provider: "expo", accessToken: null }, log);
    expect(await provider.send([message(1), message(2)])).toEqual(["failed", "failed"]);
    expect(calls[0]?.headers).not.toHaveProperty("authorization");
    expect(log.warn).toHaveBeenCalled();
  });

  it("log sağlayıcısı göndermez ve içeriği günlüğe yazmaz", async () => {
    const provider = createPushProvider({ provider: "log" }, log);
    expect(await provider.send([message(1)])).toEqual(["sent"]);
    expect(JSON.stringify(log.info.mock.calls)).not.toContain("Yeni mesajın var");
  });

  it("tekrar bildiriminde olay kimliği Expo birleştirme alanlarına taşınır", async () => {
    const calls = fakeExpo(() => new Response(JSON.stringify({ data: [{ status: "ok" }] })));
    const provider = createPushProvider({ provider: "expo", accessToken: null }, log);
    const eventId = "7b1c9a52-3f0e-4d8a-9a51-2b7f7e6c1d40";
    await provider.send([{ ...message(1), data: { type: "new_device", eventId } }]);
    expect(calls[0]?.body[0]).toMatchObject({
      data: { eventId },
      collapseId: eventId,
      tag: eventId,
    });
  });
});
