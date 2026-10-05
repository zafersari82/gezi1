import type { LocalImage } from "@/api/client";
import { createStore, useStore } from "@/lib/store";

/** Sunucuya henüz ulaşmamış mesaj. Gönderim başarısız olursa kullanıcı yeniden deneyebilir. */
export interface OutgoingMessage {
  /** Sunucunun mesajı tek kez kaydetmesini sağlayan kimlik; yeniden denemede değişmez. */
  clientId: string;
  conversationId: string;
  body: string;
  /** Fotoğraf mesajında gönderilecek görsel; metin mesajında `null`. */
  image: LocalImage | null;
  createdAt: string;
  /** Gönderim başarısız olduysa kullanıcıya gösterilecek neden; gönderim sürüyorsa `null`. */
  error: string | null;
}

const store = createStore<OutgoingMessage[]>([]);

export const outbox = {
  add: (message: OutgoingMessage): void => {
    store.set((messages) => [message, ...messages]);
  },
  remove: (clientId: string): void => {
    store.set((messages) => messages.filter((message) => message.clientId !== clientId));
  },
  setError: (clientId: string, error: string | null): void => {
    store.set((messages) =>
      messages.map((message) => (message.clientId === clientId ? { ...message, error } : message)),
    );
  },
  clear: (): void => {
    store.set([]);
  },
};

/** Sohbetin gönderilmeyi bekleyen mesajları; en yenisi başta. */
export function useOutgoingMessages(conversationId: string): OutgoingMessage[] {
  return useStore(store).filter((message) => message.conversationId === conversationId);
}
