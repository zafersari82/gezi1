import type { PaymentStatus } from "@vado/contracts";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { usePayments } from "@/features/payments/queries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Tag } from "@/ui/badge";
import { ListRow } from "@/ui/list-row";
import { EmptyState, ErrorView, LoadingView } from "@/ui/states";

const STATUS: Record<PaymentStatus, { label: string; tone: "positive" | "warning" | "neutral" }> = {
  paid: { label: "Ödendi", tone: "positive" },
  created: { label: "Onay bekliyor", tone: "warning" },
  cancelled: { label: "Vazgeçildi", tone: "neutral" },
  expired: { label: "Süresi doldu", tone: "neutral" },
};

export default function PaymentsScreen() {
  const payments = usePayments();

  if (payments.isPending) return <LoadingView />;
  if (payments.isError) {
    return <ErrorView error={payments.error} onRetry={() => void payments.refetch()} />;
  }

  const items = payments.data.pages.flatMap((page) => page.items);
  return (
    <FlatList
      data={items}
      keyExtractor={(payment) => payment.id}
      style={styles.list}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => (
        <ListRow
          title={item.merchantName}
          subtitle={`${item.description}\n${formatDateTime(item.createdAt)}`}
          subtitleLines={2}
          trailing={
            <View style={styles.amount}>
              <AppText variant="bodyStrong">{formatMoney(item.amountMinor)}</AppText>
              <Tag label={STATUS[item.status].label} tone={STATUS[item.status].tone} />
            </View>
          }
          testID={`payment-${item.id}`}
        />
      )}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (payments.hasNextPage && !payments.isFetchingNextPage) void payments.fetchNextPage();
      }}
      ListFooterComponent={
        payments.isFetchingNextPage ? (
          <ActivityIndicator color={colors.teal} style={styles.loadingMore} />
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          icon="card-outline"
          title="Henüz ödeme yok"
          message="Mini uygulamalarda yaptığın ödemeler burada listelenir."
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={payments.isRefetching && !payments.isFetchingNextPage}
          onRefresh={() => void payments.refetch()}
          tintColor={colors.teal}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flexGrow: 1,
  },
  amount: {
    alignItems: "flex-end",
    gap: space.xs,
  },
  loadingMore: {
    padding: space.lg,
  },
});
