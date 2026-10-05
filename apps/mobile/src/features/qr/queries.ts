import { useMutation, useQuery } from "@tanstack/react-query";
import type { IssuedQr, IssueQrBody, QrTarget } from "@vado/contracts";

import { api } from "@/api/client";
import { queryKeys } from "@/api/query-client";

/**
 * Kullanıcının kişisel QR kodu. Kod kısa ömürlüdür; önbelleğe alınmaz ve ekran her
 * açıldığında yeniden üretilir.
 */
export function usePersonalQr() {
  return useQuery({
    queryKey: queryKeys.personalQr,
    queryFn: () => api.post<IssuedQr>("/v1/qr", { type: "user" } satisfies IssueQrBody),
    staleTime: 0,
    gcTime: 0,
  });
}

/** Okutulan kodu sunucuda doğrular ve gösterdiği kaydı döndürür. */
export function useResolveQr() {
  return useMutation({
    mutationFn: (value: string) => api.post<QrTarget>("/v1/qr/resolve", { value }),
  });
}
