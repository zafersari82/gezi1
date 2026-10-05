import { router } from "expo-router";
import { FlatList, RefreshControl } from "react-native";

import { ConversationRow } from "@/features/chat/conversation-row";
import { useConversations } from "@/features/chat/queries";
import { useMe } from "@/features/session/session-provider";
import { colors } from "@/theme/tokens";
import { EmptyState, ErrorView, LoadingView } from "@/ui/states";

export default function ChatsScreen() {
  const me = useMe();
  const conversations = useConversations();

  if (conversations.isPending) return <LoadingView />;
  if (conversations.isError) {
    return <ErrorView error={conversations.error} onRetry={() => void conversations.refetch()} />;
  }

  return (
    <FlatList
      data={conversations.data}
      keyExtractor={(conversation) => conversation.id}
      renderItem={({ item }) => (
        <ConversationRow
          conversation={item}
          myId={me.id}
          onPress={() => {
            router.push({ pathname: "/chat/[id]", params: { id: item.id } });
          }}
        />
      )}
      contentContainerStyle={conversations.data.length === 0 ? { flexGrow: 1 } : undefined}
      ListEmptyComponent={
        <EmptyState
          icon="chatbubbles-outline"
          title="Henüz sohbetin yok"
          message="Kişilerinden birine yazarak ilk sohbetini başlat."
          actionLabel="Yeni sohbet"
          onAction={() => {
            router.push("/chat/new");
          }}
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={conversations.isRefetching}
          onRefresh={() => void conversations.refetch()}
          tintColor={colors.teal}
        />
      }
    />
  );
}
