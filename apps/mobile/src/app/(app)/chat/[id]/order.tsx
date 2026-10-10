import { useQuery } from "@tanstack/react-query";
import { businessChatOrderSchema, businessChatOrderStatusLabel } from "@vado/contracts";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";

import { api } from "@/api/client";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { ErrorView, LoadingView } from "@/ui/states";

/** URL yalnız sipariş kimliğini taşır. Her durum sorgusu müşteri+konuşma+işletme sahipliğini yeniden denetler. */
export default function ChatOrderScreen() {
  const { id, orderId } = useLocalSearchParams<{ id: string; orderId: string }>();
  const order = useQuery({
    queryKey: ["business-chat-order", id, orderId],
    enabled: !!id && !!orderId,
    queryFn: async () =>
      businessChatOrderSchema.parse(
        await api.get<unknown>(`/v1/conversations/${id}/orders/${orderId}`),
      ),
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30_000,
  });
  if (order.isPending) return <LoadingView />;
  if (order.isError) return <ErrorView error={order.error} onRetry={() => void order.refetch()} />;
  const item = order.data;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppText variant="heading">Sipariş durumu</AppText>
      <AppText variant="subheading">{item.branchName}</AppText>
      <AppText>Durum: {businessChatOrderStatusLabel(item.status)}</AppText>
      <AppText>
        Tutar:{" "}
        {(item.totalMinor / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
      </AppText>
      <AppText color="muted">
        Oluşturulma: {new Date(item.createdAt).toLocaleString("tr-TR")}
      </AppText>
      <AppText color="muted">
        Son güncelleme: {new Date(item.updatedAt).toLocaleString("tr-TR")}
      </AppText>
      <Button
        label="Güncel durumu kontrol et"
        loading={order.isFetching}
        onPress={() => void order.refetch()}
      />
      <AppText color="muted" variant="caption">
        Sipariş durumu, işletmenin sunucudaki son kaydından alınır. Sipariş bağlantısı tek başına
        erişim yetkisi sağlamaz.
      </AppText>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space.lg, gap: space.md },
});
