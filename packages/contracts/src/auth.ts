import { z } from "zod";

import { idSchema, timestampSchema } from "./common";
import { meSchema } from "./users";

/** Kullanım koşulları ve KVKK aydınlatma metninin yürürlükteki sürümü. */
export const TERMS_VERSION = "2026-10";

export const OTP_LENGTH = 6;

export const requestOtpBodySchema = z.object({
  phone: z.string().min(1).max(32),
});
export type RequestOtpBody = z.infer<typeof requestOtpBodySchema>;

export const requestOtpResponseSchema = z.object({
  expiresInSeconds: z.number().int(),
  resendInSeconds: z.number().int(),
  /** Yalnızca demo modunda döner; canlı ortamda kod SMS ile iletilir. */
  devCode: z.string().optional(),
});
export type RequestOtpResponse = z.infer<typeof requestOtpResponseSchema>;

/** `otp_cooldown` hatasının ayrıntısı: yeni kod istenebilmesi için beklenecek süre. */
export const otpCooldownDetailsSchema = z.object({
  retryInSeconds: z.number().int().positive(),
});
export type OtpCooldownDetails = z.infer<typeof otpCooldownDetailsSchema>;

export const platformSchema = z.enum(["android", "ios", "web"]);
export type Platform = z.infer<typeof platformSchema>;

/**
 * Uygulamanın o kuruluma özel ürettiği rastgele kimlik. Cihazın seri numarası değildir (işletim
 * sistemleri onu uygulamalara vermez); hesabın daha önce bu cihazdan açılıp açılmadığını anlamaya yarar.
 */
export const deviceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export const verifyOtpBodySchema = z.object({
  phone: z.string().min(1).max(32),
  code: z.string().regex(/^\d{6}$/),
  /** İlk kayıtta zorunludur; kullanıcının onayladığı koşul sürümü. */
  acceptedTermsVersion: z.string().max(20).optional(),
  deviceName: z.string().trim().min(1).max(80),
  platform: platformSchema,
  deviceId: deviceIdSchema,
});
export type VerifyOtpBody = z.infer<typeof verifyOtpBodySchema>;

export const authResultSchema = z.object({
  token: z.string(),
  expiresAt: timestampSchema,
  /**
   * Hassas işlemlerden önce kimliği yeniden kanıtlamaya yarayan cihaz anahtarı. Yalnızca girişte,
   * bir kez döner; cihazın güvenli deposunda saklanır.
   */
  deviceKey: z.string(),
  user: meSchema,
});
export type AuthResult = z.infer<typeof authResultSchema>;

export const sessionSchema = z.object({
  id: idSchema,
  deviceName: z.string(),
  platform: platformSchema,
  createdAt: timestampSchema,
  lastSeenAt: timestampSchema,
  expiresAt: timestampSchema,
  current: z.boolean(),
  /** Oturumun son görüldüğü IP adresi; bu sürümden önce açılmış oturumlarda `null`. */
  ip: z.string().nullable(),
  /** Hesabın daha önce giriş yapmadığı bir cihazdan, son 24 saat içinde açıldı. */
  newDevice: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

/** Oturumun, hassas işlemler (ödeme onayı, hesap silme, başka oturumu kapatma) karşısındaki durumu. */
export const verificationStatusSchema = z.object({
  /** Kimlik yakın zamanda kanıtlandı; hassas işlemler yeniden sormadan yapılır. */
  verified: z.boolean(),
  /** Cihaz anahtarıyla doğrulama kabul ediliyor mu? Yeni cihazda ilk 24 saat yalnızca SMS kodu geçer. */
  deviceKeyAllowed: z.boolean(),
});
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const verifyDeviceBodySchema = z.object({
  deviceKey: z.string().min(32).max(128),
});
export type VerifyDeviceBody = z.infer<typeof verifyDeviceBodySchema>;

export const confirmVerificationBodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
export type ConfirmVerificationBody = z.infer<typeof confirmVerificationBodySchema>;
