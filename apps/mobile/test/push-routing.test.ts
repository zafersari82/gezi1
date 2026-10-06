import { describe, expect, it } from "vitest";

import { pushTarget } from "@/features/notifications/push-routing";

const CONVERSATION = "7b1c9a52-3f0e-4d8a-9a51-2b7f7e6c1d40";

describe("bildirime dokununca açılan ekran", () => {
  it("mesaj bildirimi sohbeti, yeni cihaz bildirimi oturumları açar", () => {
    expect(pushTarget({ type: "message", conversationId: CONVERSATION })).toEqual({
      pathname: "/chat/[id]",
      params: { id: CONVERSATION },
    });
    expect(pushTarget({ type: "new_device" })).toBe("/settings/sessions");
  });

  it("sipariş bildirimi kendi mini uygulamasını doğrulanacak bağlamla açar", () => {
    expect(
      pushTarget({
        type: "order",
        miniAppId: "restoran",
        businessId: CONVERSATION,
        appInstanceId: CONVERSATION,
        orderId: CONVERSATION,
        eventId: CONVERSATION,
      }),
    ).toMatchObject({
      pathname: "/miniapps/[id]",
      params: { id: "restoran", launch: expect.any(String) as unknown },
    });
  });
  it("tanınmayan ya da bozuk veri hiçbir ekran açmaz", () => {
    for (const data of [
      null,
      {},
      { type: "message" },
      { type: "message", conversationId: "../../settings" },
      { type: "url", url: "https://example.com" },
    ]) {
      expect(pushTarget(data)).toBeNull();
    }
  });
});
