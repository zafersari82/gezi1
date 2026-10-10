import { describe, expect, it } from "vitest";

import {
  MESSAGE_LINK_PATTERN,
  parseSharedTarget,
  sharedPreviewTarget,
  sharedTargetMessage,
} from "@/features/sharing/shared-target";

const conversationId = "550e8400-e29b-41d4-a716-446655440000";
const orderId = "550e8400-e29b-41d4-a716-446655440001";

const target = { kind: "order" as const, conversationId, id: orderId };

describe("S7 sipariş kartı bağlantısı", () => {
  it("sipariş paylaşımını sadece sohbet ve sipariş kimliğiyle oluşturur", () => {
    const message = sharedTargetMessage("Siparişim", target);
    expect(message).toBe(`Siparişim\nvado:///orders/${conversationId}/${orderId}`);
    expect(sharedPreviewTarget(message)).toEqual(target);
    expect(message.match(MESSAGE_LINK_PATTERN)).toEqual([
      `vado:///orders/${conversationId}/${orderId}`,
    ]);
  });

  it("geçersiz sipariş ve konuşma kimliklerini reddeder", () => {
    expect(parseSharedTarget(`vado:///orders/${conversationId}/123`)).toBeNull();
    expect(parseSharedTarget(`vado:///orders/123/${orderId}`)).toBeNull();
    expect(
      parseSharedTarget(`vado:///orders/${conversationId}/${orderId}?token=secret`),
    ).toBeNull();
    expect(
      sharedPreviewTarget(`Uzun metin\nSiparişim\nvado:///orders/${conversationId}/${orderId}`),
    ).toBeNull();
  });
});
