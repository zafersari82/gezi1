import type { EventEmitter } from "node:events";
import type { Server as HttpServer } from "node:http";

import { createAdapter } from "@socket.io/redis-adapter";
import {
  type BusinessOrderEvent,
  type ClientToServerEvents,
  type CourierLiveEvent,
  idSchema,
  type LiveEvent,
  type ServerToClientEvents,
} from "@vado/contracts";
import type { FastifyBaseLogger } from "fastify";
import { createClient } from "redis";
import { Server } from "socket.io";
import { z } from "zod";

import type { Config } from "../core/config";
import type { AuthContext } from "../core/http";

export interface BusinessSocketAuth extends AuthContext {
  businessId: string;
  liveUntil: number;
}
export interface CourierSocketAuth extends AuthContext {
  kind: "courier";
  businessId: string;
  liveUntil: number;
}
export interface KitchenSocketAuth {
  kind: "kitchen";
  businessId: string;
  branchId: string;
  appInstanceId: string;
  deviceId: string;
  liveUntil: number;
}
type RealtimeAuth =
  | (AuthContext & { kind?: never; businessId?: string; liveUntil?: number })
  | KitchenSocketAuth
  | CourierSocketAuth;

type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  RealtimeAuth
>;

const TYPING_MIN_INTERVAL_MS = 1000;
const typingEventSchema = z.object({ conversationId: idSchema });

const userRoom = (userId: string) => `user:${userId}`;
const sessionRoom = (sessionId: string) => `session:${sessionId}`;
const businessRoom = (businessId: string, userId: string) =>
  `business:${businessId}:user:${userId}`;

const kitchenRoom = (businessId: string, branchId: string, instanceId: string) =>
  `kitchen:${businessId}:${branchId}:${instanceId}`;
const deviceRoom = (id: string) => `kitchen-device:${id}`;

/** Servislerin istemcilere bildirim göndermek için kullandığı arayüz. */
export interface RealtimePublisher {
  emitCourier: (businessId: string, userId: string, event: CourierLiveEvent) => void;
  emitBusinessLive: (businessId: string, userIds: readonly string[], event: LiveEvent) => void;
  emitKitchen: (event: LiveEvent) => void;
  disconnectKitchenDevice: (deviceId: string) => void;
  emitBusiness: (businessId: string, userIds: readonly string[], event: BusinessOrderEvent) => void;
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
  authenticateCourierTicket: (ticket: string) => Promise<CourierSocketAuth>;
  authenticateKitchenTicket: (ticket: string) => Promise<KitchenSocketAuth>;
  isKitchenDeviceActive: (deviceId: string) => Promise<boolean>;
  authenticate: (token: string) => Promise<AuthContext>;
  authenticateBusinessTicket: (ticket: string) => Promise<BusinessSocketAuth>;
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
    emitCourier(businessId, userId, event) {
      io.to(`courier:${businessId}:user:${userId}`).emit("courier:event", event);
    },
    emitBusiness(businessId, userIds, event) {
      if (userIds.length > 0)
        io.to(userIds.map((id) => businessRoom(businessId, id))).emit("business:order", event);
    },

    emitBusinessLive(businessId, userIds, event) {
      if (userIds.length > 0)
        io.to(userIds.map((id) => businessRoom(businessId, id))).emit("business:live", event);
    },
    emitKitchen(event) {
      io.to(kitchenRoom(event.businessId, event.branchId, event.appInstanceId)).emit(
        "kitchen:event",
        event,
      );
    },
    disconnectKitchenDevice(id) {
      io.to(deviceRoom(id)).emit("kitchen:revoked");
      io.in(deviceRoom(id)).disconnectSockets(true);
    },
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
        const courierTicket: unknown = socket.handshake.auth.courierTicket;
        const token: unknown = socket.handshake.auth.token;
        const ticket: unknown = socket.handshake.auth.businessTicket;
        const kitchenTicket: unknown = socket.handshake.auth.kitchenTicket;
        let authentication: Promise<RealtimeAuth>;
        if (
          typeof courierTicket === "string" &&
          kitchenTicket === undefined &&
          ticket === undefined &&
          token === undefined
        ) {
          authentication = handlers.authenticateCourierTicket(courierTicket);
        } else if (
          typeof kitchenTicket === "string" &&
          ticket === undefined &&
          token === undefined &&
          courierTicket === undefined
        ) {
          authentication = handlers.authenticateKitchenTicket(kitchenTicket);
        } else if (
          typeof ticket === "string" &&
          token === undefined &&
          kitchenTicket === undefined &&
          courierTicket === undefined
        ) {
          authentication = handlers.authenticateBusinessTicket(ticket);
        } else if (
          typeof token === "string" &&
          token !== "" &&
          ticket === undefined &&
          kitchenTicket === undefined &&
          courierTicket === undefined
        ) {
          authentication = handlers.authenticate(token);
        } else {
          next(new Error("unauthorized"));
          return;
        }
        authentication
          .then(async (auth) => {
            socket.data = auth;
            if (auth.kind === "courier") {
              await socket.join([
                `courier:${auth.businessId}:user:${auth.userId}`,
                sessionRoom(auth.sessionId),
              ]);
            } else if (auth.kind === "kitchen") {
              await socket.join([
                kitchenRoom(auth.businessId, auth.branchId, auth.appInstanceId),
                deviceRoom(auth.deviceId),
              ]);
              if (!(await handlers.isKitchenDeviceActive(auth.deviceId)))
                throw new Error("unauthorized");
            } else {
              await socket.join([
                auth.businessId === undefined
                  ? userRoom(auth.userId)
                  : businessRoom(auth.businessId, auth.userId),
                sessionRoom(auth.sessionId),
              ]);
            }
            next();
          })
          .catch(() => {
            next(new Error("unauthorized"));
          });
      });

      io.on("connection", (socket) => {
        let lastTypingAt = 0;
        if (socket.data.liveUntil !== undefined) {
          const timer = setTimeout(
            () => socket.disconnect(true),
            Math.max(0, socket.data.liveUntil - Date.now()),
          );
          timer.unref();
          socket.once("disconnect", () => {
            clearTimeout(timer);
          });
        }

        if (socket.data.kind === "kitchen") {
          const deviceId = socket.data.deviceId;
          const timer = setInterval(() => {
            handlers
              .isKitchenDeviceActive(deviceId)
              .then((active) => {
                if (!active) socket.disconnect(true);
              })
              .catch(() => socket.disconnect(true));
          }, 10_000);
          timer.unref();
          socket.once("disconnect", () => {
            clearInterval(timer);
          });
        }
        socket.on("conversation:typing", (event) => {
          if (
            socket.data.kind === "kitchen" ||
            socket.data.kind === "courier" ||
            socket.data.businessId !== undefined
          )
            return;
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
