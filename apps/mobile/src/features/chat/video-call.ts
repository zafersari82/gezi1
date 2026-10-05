import * as WebBrowser from "expo-web-browser";

import { JITSI_URL } from "@/api/config";

import { sendText } from "./queries";

/**
 * Sohbet için görüntülü görüşme odası açar ve bağlantısını sohbete gönderir; böylece karşı taraf
 * aynı odaya katılabilir. Görüşme, ayarlanan Jitsi sunucusunda tarayıcı içinde yapılır.
 */
export async function startVideoCall(conversationId: string): Promise<void> {
  const url = `${JITSI_URL}/vado-${conversationId}`;
  sendText(conversationId, `Görüntülü görüşme başlattım: ${url}`);
  await WebBrowser.openBrowserAsync(url);
}
