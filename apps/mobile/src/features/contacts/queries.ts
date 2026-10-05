import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  Contact,
  ContactRequests,
  CreateContactRequestBody,
  CreateContactRequestResponse,
  List,
  UserRef,
} from "@vado/contracts";

import { api } from "@/api/client";
import { queryClient, queryKeys } from "@/api/query-client";

/** Kişi ilişkisini değiştiren her işlemden sonra ilgili tüm listeler yenilenir. */
export function invalidateRelations(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
  void queryClient.invalidateQueries({ queryKey: queryKeys.contactRequests });
  void queryClient.invalidateQueries({ queryKey: queryKeys.blocks });
  void queryClient.invalidateQueries({ queryKey: queryKeys.users });
}

export function useContacts() {
  return useQuery({
    queryKey: queryKeys.contacts,
    queryFn: async () => (await api.get<List<Contact>>("/v1/contacts")).items,
  });
}

export function useContactRequests() {
  return useQuery({
    queryKey: queryKeys.contactRequests,
    queryFn: () => api.get<ContactRequests>("/v1/contact-requests"),
  });
}

export function useSendContactRequest() {
  return useMutation({
    mutationFn: (body: CreateContactRequestBody) =>
      api.post<CreateContactRequestResponse>("/v1/contact-requests", body),
    onSuccess: invalidateRelations,
  });
}

export function useAcceptContactRequest() {
  return useMutation({
    mutationFn: (requestId: string) =>
      api.post<UserRef>(`/v1/contact-requests/${requestId}/accept`),
    onSuccess: invalidateRelations,
  });
}

/** Gelen isteği reddeder veya giden isteği geri çeker. */
export function useDismissContactRequest() {
  return useMutation({
    mutationFn: (requestId: string) => api.delete(`/v1/contact-requests/${requestId}`),
    onSuccess: invalidateRelations,
  });
}

export function useRemoveContact() {
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/v1/contacts/${userId}`),
    onSuccess: invalidateRelations,
  });
}

export function useBlockedUsers() {
  return useQuery({
    queryKey: queryKeys.blocks,
    queryFn: async () => (await api.get<List<UserRef>>("/v1/blocks")).items,
  });
}

export function useBlockUser() {
  return useMutation({
    mutationFn: (userId: string) => api.put(`/v1/blocks/${userId}`),
    onSuccess: invalidateRelations,
  });
}

export function useUnblockUser() {
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/v1/blocks/${userId}`),
    onSuccess: invalidateRelations,
  });
}
