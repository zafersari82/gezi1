import { useMutation, useQuery } from "@tanstack/react-query";
import type { List, Me, UpdateMeBody, UserProfile } from "@vado/contracts";

import { api, apiSession } from "@/api/client";
import { queryKeys } from "@/api/query-client";
import { useVerification } from "@/features/security/verification-provider";
import { useSession } from "@/features/session/session-provider";

export function useUserProfile(userId: string) {
  return useQuery({
    queryKey: queryKeys.user(userId),
    queryFn: () => api.get<UserProfile>(`/v1/users/${userId}`),
  });
}

/** Telefon numarası veya VADO kimliğiyle tam eşleşme arar; sonuç en fazla bir kişidir. */
export function useUserSearch() {
  return useMutation({
    mutationFn: async (query: string) => {
      const result = await api.get<List<UserProfile>>("/v1/users/search", { q: query });
      return result.items[0] ?? null;
    },
  });
}

export function useUpdateMe() {
  const { setMe } = useSession();
  return useMutation({
    mutationFn: (body: UpdateMeBody) => api.patch<Me>("/v1/me", body),
    onSuccess: setMe,
  });
}

/** Hesabı kalıcı olarak siler. */
export function useDeleteAccount() {
  const { withVerification } = useVerification();
  return useMutation({
    mutationFn: () => withVerification(() => api.delete("/v1/me")),
    // Hesapla birlikte sunucudaki oturumlar da silinir; geriye cihazdaki oturumu kapatmak kalır.
    onSuccess: apiSession.expire,
  });
}
