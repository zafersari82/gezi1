import { type InfiniteData, useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import type {
  Conversation,
  ConversationDetail,
  CreateGroupConversationBody,
  List,
  Message,
  Page,
  SendMessageBody,
} from "@vado/contracts";
import { randomUUID } from "expo-crypto";

import { api, errorMessage, type LocalImage, uploadImage } from "@/api/client";
import { queryClient, queryKeys } from "@/api/query-client";

import { outbox, type OutgoingMessage } from "./outbox";

const MESSAGE_PAGE_SIZE = 30;

type MessagePages = InfiniteData<Page<Message>, string | undefined>;

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async () => (await api.get<List<Conversation>>("/v1/conversations")).items,
  });
}

export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.conversation(conversationId),
    queryFn: () => api.get<ConversationDetail>(`/v1/conversations/${conversationId}`),
  });
}

/** Mesajları en yeniden eskiye doğru sayfa sayfa yükler. */
export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: ({ pageParam }) =>
      api.get<Page<Message>>(`/v1/conversations/${conversationId}/messages`, {
        limit: MESSAGE_PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** Yeni mesajı, yüklenmiş mesaj listesinin başına ekler. Aynı mesaj ikinci kez eklenmez. */
export function addMessageToCache(message: Message): void {
  queryClient.setQueryData<MessagePages>(queryKeys.messages(message.conversationId), (data) => {
    const [newest, ...older] = data?.pages ?? [];
    if (data === undefined || newest === undefined) return data;
    const known = data.pages.some((page) => page.items.some((item) => item.id === message.id));
    if (known) return data;
    return { ...data, pages: [{ ...newest, items: [message, ...newest.items] }, ...older] };
  });
}

function storeConversation(conversation: ConversationDetail): void {
  queryClient.setQueryData(queryKeys.conversation(conversation.id), conversation);
  void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
}

/** Bekleyen mesajı sunucuya iletir. Başarısız olursa neden mesajın üzerine yazılır. */
export async function deliver(message: OutgoingMessage): Promise<void> {
  outbox.setError(message.clientId, null);
  try {
    const body: SendMessageBody =
      message.image === null
        ? { kind: "text", clientId: message.clientId, body: message.body }
        : {
            kind: "image",
            clientId: message.clientId,
            mediaId: (await uploadImage(message.image)).id,
          };
    const sent = await api.post<Message>(
      `/v1/conversations/${message.conversationId}/messages`,
      body,
    );
    addMessageToCache(sent);
    outbox.remove(message.clientId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
  } catch (error) {
    outbox.setError(message.clientId, errorMessage(error));
  }
}

function enqueue(conversationId: string, body: string, image: LocalImage | null): void {
  const message: OutgoingMessage = {
    clientId: randomUUID(),
    conversationId,
    body,
    image,
    createdAt: new Date().toISOString(),
    error: null,
  };
  outbox.add(message);
  void deliver(message);
}

/** Mesaj hemen ekranda görünür; gönderim arka planda sürer. */
export function sendText(conversationId: string, body: string): void {
  enqueue(conversationId, body, null);
}

export function sendImage(conversationId: string, image: LocalImage): void {
  enqueue(conversationId, "", image);
}

export function useMarkRead(conversationId: string) {
  return useMutation({
    mutationFn: (seq: number) => api.post(`/v1/conversations/${conversationId}/read`, { seq }),
    onSuccess: () => {
      // Okunmamış sayacı sunucunun yanıtı beklenmeden listede sıfırlanır.
      queryClient.setQueryData<Conversation[]>(queryKeys.conversations, (list) =>
        list?.map((item) => (item.id === conversationId ? { ...item, unreadCount: 0 } : item)),
      );
    },
  });
}

export function useOpenDirectConversation() {
  return useMutation({
    mutationFn: (userId: string) =>
      api.post<ConversationDetail>("/v1/conversations/direct", { userId }),
    onSuccess: (conversation) => {
      queryClient.setQueryData(queryKeys.conversation(conversation.id), conversation);
    },
  });
}

export function useCreateGroup() {
  return useMutation({
    mutationFn: (body: CreateGroupConversationBody) =>
      api.post<ConversationDetail>("/v1/conversations/group", body),
    onSuccess: storeConversation,
  });
}

export function useRenameGroup(conversationId: string) {
  return useMutation({
    mutationFn: (title: string) =>
      api.patch<ConversationDetail>(`/v1/conversations/${conversationId}`, { title }),
    onSuccess: storeConversation,
  });
}

export function useAddMembers(conversationId: string) {
  return useMutation({
    mutationFn: (userIds: string[]) =>
      api.post<ConversationDetail>(`/v1/conversations/${conversationId}/members`, { userIds }),
    onSuccess: storeConversation,
  });
}

/** Üyeyi gruptan çıkarır; kullanıcı kendi kimliğini verirse gruptan ayrılır. */
export function useRemoveMember(conversationId: string) {
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/v1/conversations/${conversationId}/members/${userId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}
