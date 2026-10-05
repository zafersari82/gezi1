import type { Message } from "@vado/contracts";
import { describe, expect, it } from "vitest";

import { buildChatItems } from "@/features/chat/chat-items";
import type { OutgoingMessage } from "@/features/chat/outbox";

const AYSE = "00000000-0000-4000-8000-00000000000a";
const MEHMET = "00000000-0000-4000-8000-00000000000b";
const CONVERSATION = "00000000-0000-4000-8000-0000000000c1";
const START = Date.UTC(2026, 9, 3, 9, 0);

/** `minute`, sohbetin başından itibaren geçen dakikadır; sıra numarası da ondan türetilir. */
function message(minute: number, senderId: string | null, extra: Partial<Message> = {}): Message {
  return {
    id: `00000000-0000-4000-8000-${String(minute).padStart(12, "0")}`,
    seq: minute + 1,
    conversationId: CONVERSATION,
    senderId,
    kind: senderId === null ? "system" : "text",
    body: `mesaj ${minute}`,
    imageUrl: null,
    clientId: `client-${minute}`,
    createdAt: new Date(START + minute * 60_000).toISOString(),
    ...extra,
  };
}

function outgoing(clientId: string): OutgoingMessage {
  return {
    clientId,
    conversationId: CONVERSATION,
    body: "gönderiliyor",
    image: null,
    createdAt: new Date(START).toISOString(),
    error: null,
  };
}

/** Öğeleri okunur bir özete çevirir: mesajlarda gövde, ayraçlarda "stamp". */
const summarize = (items: ReturnType<typeof buildChatItems>) =>
  items.map((item) => (item.type === "stamp" ? "stamp" : item.message.body));

describe("buildChatItems", () => {
  it("on dakikadan uzun aradan sonra zaman ayracı koyar", () => {
    // Liste yeniden eskiye sıralıdır: 25. dakika en yeni mesajdır.
    const items = buildChatItems(
      [message(25, AYSE), message(3, AYSE), message(0, AYSE)],
      [],
      false,
    );
    expect(summarize(items)).toEqual(["mesaj 25", "stamp", "mesaj 3", "mesaj 0", "stamp"]);
  });

  it("grupta gönderen adını yalnızca art arda mesajların ilkinde gösterir", () => {
    const items = buildChatItems(
      [message(3, MEHMET), message(2, AYSE), message(1, AYSE), message(0, null)],
      [],
      true,
    );
    const shown = items.flatMap((item) => (item.type === "message" ? [item.showSender] : []));
    // En yeni → en eski: Mehmet (yeni gönderen), Ayşe (devam), Ayşe (sistem mesajından sonra ilk), sistem.
    expect(shown).toEqual([true, false, true, false]);
  });

  it("birebir sohbette gönderen adı göstermez", () => {
    const items = buildChatItems([message(1, MEHMET), message(0, AYSE)], [], false);
    expect(items.every((item) => item.type !== "message" || !item.showSender)).toBe(true);
  });

  it("gönderilmeyi bekleyen mesajları en alta koyar, sunucuya ulaşmış olanı tekrar göstermez", () => {
    const items = buildChatItems(
      [message(0, AYSE, { clientId: "delivered-1" })],
      [outgoing("pending-1"), outgoing("delivered-1")],
      false,
    );
    expect(items.map((item) => item.key)).toEqual([
      "pending-1",
      message(0, AYSE).id,
      `stamp-${message(0, AYSE).id}`,
    ]);
    expect(items[0]?.type).toBe("outgoing");
  });

  it("boş sohbette boş liste döndürür", () => {
    expect(buildChatItems([], [], true)).toEqual([]);
  });
});
