"use client";
import {
  businessSocketTicketSchema,
  type LiveEvent,
  liveEventSchema,
  liveReplaySchema,
} from "@vado/contracts";
import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { call, ClientApiError } from "../lib/client";

/** Soket değişiklik haberi verir; kaçan olaylar kalıcı imleçten tamamlanır. */
export function useBusinessLive(
  businessId: string,
  refresh: () => Promise<void>,
  device = false,
  onNewOrder?: (event: LiveEvent) => void,
): string {
  const [status, setStatus] = useState("Bağlanıyor");
  useEffect(() => {
    let disposed = false;
    let socket: Socket | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let cursor = 0;
    let syncing = false;
    let again = false;
    let initial = true;
    let pollOnly = false;
    const isDisposed = () => disposed;
    const needsSync = () => again;
    const isInitial = () => initial;
    const seen = new Set<string>();
    const base = device ? "/api/device" : "/api/business";
    function denied(cause: unknown): boolean {
      if (cause instanceof ClientApiError && [401, 403].includes(cause.status)) {
        window.location.assign(device ? "/kitchen-pair" : "/businesses");
        return true;
      }
      return false;
    }
    async function sync() {
      if (isDisposed()) return;
      if (syncing) {
        again = true;
        return;
      }
      syncing = true;
      try {
        do {
          again = false;
          let batch = await call(liveReplaySchema, `${base}/live-events?cursor=${cursor}`);
          if (isDisposed()) return;
          for (;;) {
            for (const event of batch.items) {
              if (event.businessId !== businessId || seen.has(event.eventId)) continue;
              seen.add(event.eventId);
              if (!isInitial() && !batch.reset && event.type === "order.placed")
                onNewOrder?.(event);
              if (seen.size > 1024) {
                const first = seen.values().next().value;
                if (first !== undefined) seen.delete(first);
              }
            }
            cursor = batch.cursor;
            if (batch.items.length < 500) break;
            batch = await call(liveReplaySchema, `${base}/live-events?cursor=${cursor}`);
            if (isDisposed()) return;
          }
          await refresh();
          initial = false;
          if (!isDisposed())
            setStatus(
              pollOnly
                ? "Güvenli yenileme"
                : socket?.connected
                  ? "Canlı"
                  : "Soket kesildi · olaylar eşitleniyor",
            );
        } while (needsSync() && !isDisposed());
      } catch (cause) {
        if (!isDisposed() && !denied(cause)) setStatus("Bağlantı kesildi · yeniden deneniyor");
      } finally {
        syncing = false;
      }
    }
    const retry = () => {
      if (isDisposed()) return;
      setStatus("Bağlantı kesildi · yeniden bağlanıyor");
      clearTimeout(retryTimer);
      retryTimer = setTimeout(
        () => {
          void connect();
        },
        Math.min(15000, 1000 * 2 ** Math.min(attempt++, 4)),
      );
    };
    async function connect() {
      if (isDisposed() || pollOnly) return;
      socket?.removeAllListeners();
      socket?.disconnect();
      try {
        const ticket = await call(businessSocketTicketSchema, `${base}/socket-ticket`, "POST", {});
        if (isDisposed()) return;
        socket = io(ticket.socketUrl, {
          auth: device ? { deviceTicket: ticket.ticket } : { businessTicket: ticket.ticket },
          transports: ["websocket"],
          reconnection: false,
        });
        socket.on("connect", () => {
          attempt = 0;
          void sync();
        });
        const changed = (raw: unknown) => {
          const event = liveEventSchema.safeParse(raw);
          if (event.success && event.data.businessId === businessId) void sync();
        };
        socket.on(device ? "device:event" : "business:live", changed);
        socket.on("business:order", () => {
          void sync();
        });
        socket.on(device ? "device:revoked" : "session:revoked", () => {
          window.location.assign(device ? "/kitchen-pair" : "/login");
        });
        socket.on("disconnect", retry);
        socket.on("connect_error", retry);
      } catch (cause) {
        // Delegated staff have scoped, polled events but no business-wide socket ticket.
        if (!device && cause instanceof ClientApiError && cause.status === 403) {
          pollOnly = true;
          setStatus("Güvenli yenileme");
          return;
        }
        if (!denied(cause)) retry();
      }
    }
    void connect();
    void sync();
    const timer = setInterval(() => {
      void sync();
    }, 4000);
    const online = () => {
      void sync();
      if (!socket?.connected) void connect();
    };
    window.addEventListener("online", online);
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearInterval(timer);
      socket?.removeAllListeners();
      socket?.disconnect();
      window.removeEventListener("online", online);
    };
  }, [businessId, device, refresh, onNewOrder]);
  return status;
}
