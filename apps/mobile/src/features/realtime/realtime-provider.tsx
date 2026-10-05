import type {
  ClientToServerEvents,
  ConversationDetail,
  ServerToClientEvents,
  SocketAuth,
} from "@vado/contracts";
import { createContext, type ReactNode, use, useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

import { apiSession } from "@/api/client";
import { API_URL } from "@/api/config";
import { queryClient, queryKeys } from "@/api/query-client";
import { addMessageToCache } from "@/features/chat/queries";
import { clearTyping, markTyping } from "@/features/chat/typing";
import { invalidateRelations } from "@/features/contacts/queries";
import { alertNewDevice } from "@/features/security/new-device";

type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface RealtimeContextValue {
  /** Karşı tarafa "yazıyor" bildirimi gönderir; bağlantı yoksa sessizce atlanır. */
  sendTyping: (conversationId: string) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

function refreshConversations(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
  void queryClient.invalidateQueries({ queryKey: queryKeys.conversationDetails });
}

/**
 * Sunucuyla gerçek zamanlı bağlantıyı kurar ve gelen olayları sorgu önbelleğine işler.
 * Ekranlar olayları doğrudan dinlemez; verinin güncel halini her zaman sorgulardan okur.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const socket = useRef<RealtimeSocket | null>(null);

  useEffect(() => {
    const token = apiSession.getToken();
    if (token === null) return;

    const connection: RealtimeSocket = io(API_URL, {
      auth: { token } satisfies SocketAuth,
      transports: ["websocket"],
    });
    let connectedBefore = false;

    connection.on("connect", () => {
      // Bağlantı koptuğu sırada kaçan olaylar olabilir; yeniden bağlanınca veriler tazelenir.
      if (connectedBefore) {
        refreshConversations();
        invalidateRelations();
      }
      connectedBefore = true;
    });

    connection.on("message:new", ({ conversationId, message }) => {
      addMessageToCache(message);
      if (message.senderId !== null) clearTyping(conversationId, message.senderId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    });

    connection.on("conversation:read", ({ conversationId, userId, lastReadSeq }) => {
      queryClient.setQueryData<ConversationDetail>(
        queryKeys.conversation(conversationId),
        (detail) =>
          detail === undefined
            ? detail
            : {
                ...detail,
                members: detail.members.map((member) =>
                  member.id === userId ? { ...member, lastReadSeq } : member,
                ),
              },
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    });

    connection.on("conversation:typing", ({ conversationId, userId }) => {
      markTyping(conversationId, userId);
    });
    connection.on("conversations:changed", refreshConversations);
    connection.on("contacts:changed", invalidateRelations);
    connection.on("session:revoked", apiSession.expire);
    connection.on("session:new-device", ({ deviceName }) => {
      alertNewDevice(deviceName);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    });
    connection.on("connect_error", (error) => {
      // Sunucu belirteci reddettiyse oturum geçersizdir; ağ hatalarında bağlantı yeniden denenir.
      if (error.message === "unauthorized") apiSession.expire();
    });

    socket.current = connection;
    return () => {
      connection.disconnect();
      socket.current = null;
    };
  }, []);

  const value: RealtimeContextValue = {
    sendTyping(conversationId) {
      socket.current?.emit("conversation:typing", { conversationId });
    },
  };

  return <RealtimeContext value={value}>{children}</RealtimeContext>;
}

export function useRealtime(): RealtimeContextValue {
  const context = use(RealtimeContext);
  if (context === null) throw new Error("useRealtime, RealtimeProvider içinde kullanılmalıdır");
  return context;
}
