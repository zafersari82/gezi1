import { useQuery } from "@tanstack/react-query";
import { businessChatOrdersSchema, businessChatOrderStatusLabel } from "@vado/contracts";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, StyleSheet } from "react-native";

import { api } from "@/api/client";
import { sendText, useConversation } from "@/features/chat/queries";
import { sharedTargetMessage } from "@/features/sharing/shared-target";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { ListRow } from "@/ui/list-row";
import { EmptyState, ErrorView, LoadingView } from "@/ui/states";

/** Sohbet müşterisi yalnız bu işletmede kendisine ait son 20 siparişi paylaşabilir. */
export default function ChatOrdersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversation = useConversation(id);
  const orders = useQuery({
    queryKey: ["business-chat-orders", id],
    enabled: !!id && conversation.data?.kind === "business",
    queryFn: async () =>
      businessChatOrdersSchema.parse(await api.get<unknown>(`/v1/conversations/${id}/orders`)),
    staleTime: 0,
    gcTime: 0,
  });
  if (conversation.isPending) return <LoadingView />;
  if (conversation.isError) return <ErrorView error={conversation.error} />;
  if (conversation.data.kind !== "business")
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="İşletme sohbeti gerekli"
        message="Bu özellik yalnız işletmeyle konuşurken kullanılabilir."
      />
    );
  if (orders.isPending) return <LoadingView />;
  if (orders.isError)
    return <ErrorView error={orders.error} onRetry={() => void orders.refetch()} />;
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={orders.data.items}
      keyExtractor={(order) => order.id}
      ListHeaderComponent={<AppText variant="subheading">Paylaşmak istediğin sipariş</AppText>}
      renderItem={({ item }) => (
        <ListRow
          title={`${item.branchName} · ${businessChatOrderStatusLabel(item.status)}`}
          subtitle={`${(item.totalMinor / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })} · ${new Date(item.createdAt).toLocaleDateString("tr-TR")}`}
          chevron
          onPress={() => {
            sendText(
              id,
              sharedTargetMessage("Siparişim", { kind: "order", conversationId: id, id: item.id }),
            );
            router.dismissTo({ pathname: "/chat/[id]", params: { id } });
          }}
        />
      )}
      ListEmptyComponent={
        <EmptyState
          icon="receipt-outline"
          title="Sipariş bulunamadı"
          message="Bu işletmeyle paylaşabileceğin bir sipariş bulunmuyor."
        />
      }
    />
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space.lg, flexGrow: 1, gap: space.md },
});
