import { useMutation, useQuery } from "@tanstack/react-query";
import type { Business, BusinessDetail, CreateBusinessBody, List } from "@vado/contracts";

import { api } from "@/api/client";
import { queryClient, queryKeys } from "@/api/query-client";

/** Onaylı işletmeler. Liste küçük olduğu için arama ve kategori süzgeci cihazda uygulanır. */
export function useBusinesses() {
  return useQuery({
    queryKey: queryKeys.businesses,
    queryFn: async () => (await api.get<List<Business>>("/v1/businesses")).items,
  });
}

export function useBusiness(businessId: string) {
  return useQuery({
    queryKey: queryKeys.business(businessId),
    queryFn: () => api.get<BusinessDetail>(`/v1/businesses/${businessId}`),
  });
}

/** Kullanıcının kendi başvuruları; onay bekleyenler de listelenir. */
export function useOwnedBusinesses() {
  return useQuery({
    queryKey: queryKeys.ownedBusinesses,
    queryFn: async () => (await api.get<List<Business>>("/v1/businesses/mine")).items,
  });
}

export function useCreateBusiness() {
  return useMutation({
    mutationFn: (body: CreateBusinessBody) => api.post<Business>("/v1/businesses", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.businesses });
    },
  });
}
