import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import type { CreatePaymentBody, Page, Payment } from "@vado/contracts";

import { api } from "@/api/client";
import { queryClient, queryKeys } from "@/api/query-client";
import { useVerification } from "@/features/security/verification-provider";

const PAGE_SIZE = 20;

function refreshPayments(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.payments });
}

export function usePayments() {
  return useInfiniteQuery({
    queryKey: queryKeys.payments,
    queryFn: ({ pageParam }) =>
      api.get<Page<Payment>>("/v1/payments", { limit: PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** Mini uygulamanın istediği ödeme için oturum açar; tutar henüz tahsil edilmez. */
export function createPayment(body: CreatePaymentBody): Promise<Payment> {
  return api.post<Payment>("/v1/payments", body);
}

export function useConfirmPayment() {
  const { withVerification } = useVerification();
  return useMutation({
    mutationFn: (paymentId: string) =>
      withVerification(() => api.post<Payment>(`/v1/payments/${paymentId}/confirm`)),
    onSuccess: refreshPayments,
  });
}

export function useCancelPayment() {
  return useMutation({
    mutationFn: (paymentId: string) => api.post<Payment>(`/v1/payments/${paymentId}/cancel`),
    onSuccess: refreshPayments,
  });
}
