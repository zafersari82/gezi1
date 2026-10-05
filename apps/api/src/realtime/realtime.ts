import type { EventEmitter } from "node:events";
import type { Server as HttpServer } from "node:http";

import { createAdapter } from "@socket.io/redis-adapter";
import { type ClientToServerEvents, idSchema, type ServerToClientEvents } from "@vado/contracts";
import type { FastifyBaseLogger } from "fastify";
import { createClient } from "redis";
import { Server } from "socket.io";
import { z } from "zod";

import type { Config } from "../core/config";
import type { AuthContext } from "../core/http";

type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  AuthContext
>;

const TYPING_MIN_INTERVAL_MS = 1000;
const typingEventSchema = z.object({ conversationId: idSchema });

const userRoom = (userId: string) => `user:${userId}`;
const sessionRoom = (sessionId: string) => `session:${sessionId}`;

/** Servislerin istemcilere bildirim göndermek için kullandığı arayüz. */
export interface RealtimePublisher {
  /** Olayı verilen kullanıcıların bağlı tüm cihazlarına gönderir. */
  emit: <Event extends keyof ServerToClientEvents>(
    userIds: readonly string[],
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) => void;
  /** Oturuma ait bağlantıları bilgilendirip kapatır. */
  disconnectSession: (sessionId: string) => void;
}

export interface RealtimeHandlers {
  authenticate: (token: string) => Promise<AuthContext>;
  /** "Yazıyor" bildiriminin iletileceği kullanıcılar; gönderen sohbet üyesi değilse boş döner. */
  typingRecipients: (userId: string, conversationId: string) => Promise<string[]>;
}

export interface Realtime extends RealtimePublisher {
  start: (server: HttpServer, handlers: RealtimeHandlers) => Promise<void>;
  /** Yeni bağlantı kabul etmeyi bırakmadan önce mevcut bağlantıları kapatır. */
  disconnectAll: () => void;
  close: () => Promise<void>;
}

/**
 * Redis'e ulaşılamadığında istemciler kendiliğinden yeniden bağlanır ve her denemede "error" olayı
 * yayar; dinleyicisi olmayan olay süreci sonlandırır. Günlüğe yalnızca kesintinin başı ve sonu yazılır.
 */
function watchRedis(
  clients: (EventEmitter & { readonly isReady: boolean })[],
  logger: FastifyBaseLogger,
): void {
  let down = false;
  for (const client of clients) {
    client.on("error", (error: unknown) => {
      if (down) return;
      down = true;
      logger.error(error, "Redis'e ulaşılamıyor; bildirimler diğer API süreçlerine ulaşmıyor");
    });
    client.on("ready", () => {
      if (!down || clients.some((other) => !other.isReady)) return;
      down = false;
      logger.info("Redis bağlantısı yeniden kuruldu");
    });
  }
}

export function createRealtime(config: Config, logger: FastifyBaseLogger): Realtime {
  const io: RealtimeServer = new Server({
    cors: { origin: config.corsOrigins },
    serveClient: false,
  });
  let closeRedis: (() => Promise<void>) | null = null;

  const emit: RealtimePublisher["emit"] = (userIds, event, ...args) => {
    if (userIds.length === 0) return;
    io.to(userIds.map(userRoom)).emit(event, ...args);
  };

  return {
    emit,

    disconnectSession(sessionId) {
      io.to(sessionRoom(sessionId)).emit("session:revoked");
      io.in(sessionRoom(sessionId)).disconnectSockets(true);
    },

    async start(server, handlers) {
      // Birden fazla API süreci çalışıyorsa olaylar Redis üzerinden tüm süreçlere dağıtılır.
      if (config.redisUrl !== null) {
        const publisher = createClient({ url: config.redisUrl });
        const subscriber = publisher.duplicate();
        watchRedis([publisher, subscriber], logger);
        await Promise.all([publisher.connect(), subscriber.connect()]);
        io.adapter(createAdapter(publisher, subscriber));
        closeRedis = async () => {
          await Promise.all([publisher.close(), subscriber.close()]);
        };
      }

      io.use((socket, next) => {
        const token: unknown = socket.handshake.auth.token;
        if (typeof token !== "string" || token === "") {
          next(new Error("unauthorized"));
          return;
        }
        handlers
          .authenticate(token)
          .then(async (auth) => {
            socket.data = auth;
            await socket.join([userRoom(auth.userId), sessionRoom(auth.sessionId)]);
            next();
          })
          .catch(() => {
            next(new Error("unauthorized"));
          });
      });

      io.on("connection", (socket) => {
        let lastTypingAt = 0;

        socket.on("conversation:typing", (event) => {
          const parsed = typingEventSchema.safeParse(event);
          const now = Date.now();
          if (!parsed.success || now - lastTypingAt < TYPING_MIN_INTERVAL_MS) return;
          lastTypingAt = now;

          const { conversationId } = parsed.data;
          const { userId } = socket.data;
          handlers
            .typingRecipients(userId, conversationId)
            .then((recipients) => {
              emit(recipients, "conversation:typing", { conversationId, userId });
            })
            .catch(() => {
              // Kalıcı olmayan bir bildirim; hata istemciye yansıtılmaz.
            });
        });
      });

      io.attach(server);
    },

    disconnectAll() {
      io.local.disconnectSockets(true);
    },

    async close() {
      await io.close();
      await closeRedis?.();
    },
  };
}
