import type { PushData } from "@vado/contracts";

import type { PushConfig } from "../core/config";
import type { Logger } from "../core/context";

/** Expo Push Service adresi; bildirimi Apple (APNs) ve Google (FCM) üzerinden telefona iletir. */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo tek istekte en fazla 100 bildirim kabul eder. */
const EXPO_BATCH_SIZE = 100;
const EXPO_TIMEOUT_MS = 10_000;

export interface PushMessage {
  /** Telefonun bildirim adresi (Expo push belirteci). */
  to: string;
  title: string;
  body: string;
  data: PushData;
}

/**
 * Bir bildirimin sonucu. `invalid`: adres artık geçerli değil (uygulama silindi, izin geri alındı);
 * VADO adresi siler. `failed`: geçici bir sorun; adres kalır.
 */
export type PushOutcome = "sent" | "invalid" | "failed";

/**
 * Bildirimi telefona ulaştıran sağlayıcı. Yeni bir sağlayıcı (doğrudan FCM/APNs gibi) eklemek için
 * bu arayüzü uygulamak ve `createPushProvider` içine eklemek yeterlidir.
 */
export interface PushProvider {
  /** Sonuçlar iletilerle aynı sıradadır. */
  send: (messages: readonly PushMessage[]) => Promise<PushOutcome[]>;
}

/** Geliştirme sağlayıcısı: bildirim göndermez, günlüğe yazar. İçerik günlüğe yazılmaz. */
function createLogProvider(log: Logger): PushProvider {
  return {
    send(messages) {
      for (const message of messages) {
        log.info({ type: message.data.type }, "Bildirim gönderilmedi (log sağlayıcısı)");
      }
      return Promise.resolve(messages.map(() => "sent" as const));
    },
  };
}

interface ExpoTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

function isTicketList(value: unknown): value is { data: ExpoTicket[] } {
  return (
    typeof value === "object" && value !== null && "data" in value && Array.isArray(value.data)
  );
}

/** Expo Push Service. Erişim belirteci yalnızca Expo hesabında gelişmiş güvenlik açıksa gerekir. */
function createExpoProvider(accessToken: string | null, log: Logger): PushProvider {
  async function sendBatch(batch: readonly PushMessage[]): Promise<PushOutcome[]> {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(accessToken === null ? {} : { authorization: `Bearer ${accessToken}` }),
      },
      body: JSON.stringify(
        batch.map((message) => ({
          ...message,
          sound: "default",
          priority: "high",
          ...(message.data.eventId === undefined
            ? {}
            : { collapseId: message.data.eventId, tag: message.data.eventId }),
        })),
      ),
      signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isTicketList(payload)) {
      log.warn({ status: response.status }, "Expo bildirim isteğini kabul etmedi");
      return batch.map(() => "failed");
    }
    return batch.map((_, index) => {
      const ticket = payload.data[index];
      if (ticket?.status === "ok") return "sent";
      return ticket?.details?.error === "DeviceNotRegistered" ? "invalid" : "failed";
    });
  }

  return {
    async send(messages) {
      const outcomes: PushOutcome[] = [];
      for (let start = 0; start < messages.length; start += EXPO_BATCH_SIZE) {
        outcomes.push(...(await sendBatch(messages.slice(start, start + EXPO_BATCH_SIZE))));
      }
      return outcomes;
    },
  };
}

export function createPushProvider(config: PushConfig, log: Logger): PushProvider {
  if (config.provider === "expo") return createExpoProvider(config.accessToken, log);
  return createLogProvider(log);
}
