import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type AuthResult,
  type List,
  type RequestOtpResponse,
  type Session,
  TERMS_VERSION,
  type VerifyOtpBody,
} from "@vado/contracts";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { api } from "@/api/client";
import { queryClient, queryKeys } from "@/api/query-client";
import { useVerification } from "@/features/security/verification-provider";
import { getDeviceId } from "@/features/session/device";
import { currentPlatform } from "@/lib/platform";

/** Oturum listesinde görünecek cihaz adı. */
function deviceName(): string {
  if (Platform.OS === "web") return "Web tarayıcısı";
  return Device.deviceName ?? Device.modelName ?? "Telefon";
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: (phone: string) => api.post<RequestOtpResponse>("/v1/auth/otp", { phone }),
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: async ({ phone, code }: { phone: string; code: string }) =>
      api.post<AuthResult>("/v1/auth/otp/verify", {
        phone,
        code,
        // Kullanıcı koşulları telefon numarasını girdiği ekranda onaylar.
        acceptedTermsVersion: TERMS_VERSION,
        deviceName: deviceName(),
        platform: currentPlatform(),
        deviceId: await getDeviceId(),
      } satisfies VerifyOtpBody),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: async () => (await api.get<List<Session>>("/v1/auth/sessions")).items,
  });
}

/** Başka bir cihazdaki oturumu kapatır. */
export function useRevokeSession() {
  const { withVerification } = useVerification();
  return useMutation({
    mutationFn: (sessionId: string) =>
      withVerification(() => api.delete(`/v1/auth/sessions/${sessionId}`)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    },
  });
}
