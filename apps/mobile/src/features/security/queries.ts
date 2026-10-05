import type {
  ConfirmVerificationBody,
  RequestOtpResponse,
  VerificationStatus,
  VerifyDeviceBody,
} from "@vado/contracts";

import { api } from "@/api/client";

/** Oturumun hassas işlemler karşısındaki durumu: doğrulama taze mi, cihaz anahtarı geçer mi? */
export function fetchVerificationStatus(): Promise<VerificationStatus> {
  return api.get<VerificationStatus>("/v1/auth/verification");
}

/** Hesabın numarasına işlem onay kodu gönderir. */
export function requestVerificationCode(): Promise<RequestOtpResponse> {
  return api.post<RequestOtpResponse>("/v1/auth/verification/otp");
}

export function confirmVerificationCode(code: string): Promise<void> {
  return api.post("/v1/auth/verification/otp/confirm", { code } satisfies ConfirmVerificationBody);
}

/** Cihazda saklanan anahtarla kimliği yeniden kanıtlar. */
export function verifyWithDeviceKey(deviceKey: string): Promise<void> {
  return api.post("/v1/auth/verification/device", { deviceKey } satisfies VerifyDeviceBody);
}
