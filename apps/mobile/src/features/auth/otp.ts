import { otpCooldownDetailsSchema } from "@vado/contracts";

import { ApiError } from "@/api/client";

/** Numaraya az önce kod gönderildiyse yeni kod istenebilmesi için kalan süre; değilse `null`. */
export function cooldownSeconds(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.code !== "otp_cooldown") return null;
  const details = otpCooldownDetailsSchema.safeParse(error.details);
  return details.success ? details.data.retryInSeconds : null;
}
