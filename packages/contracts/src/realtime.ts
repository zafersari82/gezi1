import type { Message } from "./chat";

/**
 * Gerçek zamanlı kanal yalnızca sunucudan istemciye bildirim taşır.
 * Yazma işlemleri (mesaj gönderme, okundu işaretleme) her zaman REST API üzerinden yapılır;
 * tek istisna, kalıcı olmayan "yazıyor" bildirimidir.
 */
export interface ServerToClientEvents {
  "message:new": (event: { conversationId: string; message: Message }) => void;
  "conversation:read": (event: {
    conversationId: string;
    userId: string;
    lastReadSeq: number;
  }) => void;
  "conversation:typing": (event: { conversationId: string; userId: string }) => void;
  /** Sohbet listesi değişti (yeni sohbet, üye veya başlık değişikliği); liste yenilenmeli. */
  "conversations:changed": () => void;
  /** Kişiler veya kişi istekleri değişti; listeler yenilenmeli. */
  "contacts:changed": () => void;
  /** Bu bağlantının oturumu kapatıldı; istemci çıkış yapmalı. */
  "session:revoked": () => void;
  /** Hesaba, daha önce giriş yapılmamış bir cihazdan oturum açıldı. */
  "session:new-device": (event: { sessionId: string; deviceName: string }) => void;
}

export interface ClientToServerEvents {
  "conversation:typing": (event: { conversationId: string }) => void;
}

/** Bağlantı kurulurken gönderilen kimlik bilgisi. */
export interface SocketAuth {
  token: string;
}

/** İstemci "yazıyor" bildirimini en fazla bu sıklıkta gönderir. */
export const TYPING_THROTTLE_MS = 3000;

/** Son "yazıyor" bildiriminden bu kadar süre sonra gösterge kaldırılır. */
export const TYPING_VISIBLE_MS = 5000;
