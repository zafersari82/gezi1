import type { FastifyBaseLogger } from "fastify";

import type { SmsConfig } from "../core/config";

const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * Doğrulama kodunu kullanıcıya ulaştıran sağlayıcı.
 * Yeni bir SMS firması eklemek için bu arayüzü uygulamak ve `createSmsProvider` içine eklemek yeterlidir.
 */
export interface SmsProvider {
  sendOtp: (phone: string, code: string, purpose: OtpPurpose) => Promise<void>;
}

/** Kodun ne için istendiği: giriş ya da açık oturumda hassas bir işlemin onayı. */
export type OtpPurpose = "login" | "verify";

function otpMessage(code: string, purpose: OtpPurpose): string {
  return purpose === "login"
    ? `VADO doğrulama kodun: ${code}. Bu kodu kimseyle paylaşma.`
    : `VADO işlem onay kodun: ${code}. Bu kodu kimseyle paylaşma; VADO senden kod istemez.`;
}

/** Geliştirme sağlayıcısı: SMS göndermez, kodu sunucu günlüğüne yazar. */
function createLogProvider(logger: FastifyBaseLogger): SmsProvider {
  return {
    sendOtp(phone, code, purpose) {
      logger.info({ phone, code, purpose }, "SMS gönderilmedi (log sağlayıcısı)");
      return Promise.resolve();
    },
  };
}

/**
 * Kodu, yapılandırılan adrese JSON olarak iletir. Karşı taraftaki küçük bir aracı servis
 * iletiyi seçilen SMS firmasının API'sine çevirir; böylece firma değişse de VADO kodu değişmez.
 */
function createWebhookProvider(url: string, secret: string): SmsProvider {
  return {
    async sendOtp(phone, code, purpose) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
        body: JSON.stringify({ phone, code, message: otpMessage(code, purpose) }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`SMS sağlayıcısı ${response.status} döndürdü`);
      }
    },
  };
}

export function createSmsProvider(config: SmsConfig, logger: FastifyBaseLogger): SmsProvider {
  if (config.provider === "webhook") return createWebhookProvider(config.url, config.secret);
  return createLogProvider(logger);
}
