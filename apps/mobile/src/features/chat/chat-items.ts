import type { Message } from "@vado/contracts";

import type { OutgoingMessage } from "./outbox";

/** Art arda gelen iki mesaj arasında bu süreden uzun boşluk varsa araya zaman ayracı konur. */
const STAMP_GAP_MS = 10 * 60 * 1000;

export type ChatItem =
  | { type: "message"; key: string; message: Message; showSender: boolean }
  | { type: "outgoing"; key: string; message: OutgoingMessage }
  | { type: "stamp"; key: string; at: string };

/**
 * Sohbet ekranında çizilecek öğeleri üretir. Liste ters çevrilmiş (en yeni öğe en altta)
 * gösterildiği için sonuç da yeniden eskiye doğru sıralıdır.
 *
 * @param messages Sunucudan gelen mesajlar, en yenisi başta.
 * @param outgoing Gönderilmeyi bekleyen mesajlar, en yenisi başta.
 * @param isGroup  Grup sohbetinde başkalarının mesajlarının üstünde gönderen adı gösterilir.
 */
export function buildChatItems(
  messages: readonly Message[],
  outgoing: readonly OutgoingMessage[],
  isGroup: boolean,
): ChatItem[] {
  const delivered = new Set(messages.map((message) => message.clientId));
  const items: ChatItem[] = outgoing
    .filter((message) => !delivered.has(message.clientId))
    .map((message) => ({ type: "outgoing", key: message.clientId, message }));

  messages.forEach((message, index) => {
    const older = messages[index + 1];
    const startsBlock =
      older === undefined ||
      new Date(message.createdAt).getTime() - new Date(older.createdAt).getTime() >= STAMP_GAP_MS;
    const senderChanged = older?.senderId !== message.senderId || older.kind === "system";

    items.push({
      type: "message",
      key: message.id,
      message,
      showSender: isGroup && message.kind !== "system" && (startsBlock || senderChanged),
    });
    if (startsBlock) {
      items.push({ type: "stamp", key: `stamp-${message.id}`, at: message.createdAt });
    }
  });
  return items;
}
