import { useQuery } from "@tanstack/react-query";
import type { PublicShareBranch, PublicShareProduct } from "@vado/contracts";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { api } from "@/api/client";
import { sendText, useConversation } from "@/features/chat/queries";
import { sharedTargetMessage } from "@/features/sharing/shared-target";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { ListRow } from "@/ui/list-row";
import { SearchField } from "@/ui/search-field";
import { EmptyState, ErrorView, LoadingView } from "@/ui/states";

type ShareRow =
  | { kind: "branch"; id: string; branch: PublicShareBranch }
  | { kind: "product"; id: string; product: PublicShareProduct };

/** Şube seçilmeden fiyat/ürün gönderilmez: markanın farklı şubelerinde fiyat değişebilir. */
export default function ShareProductScreen() {
  const { id, businessId } = useLocalSearchParams<{ id: string; businessId?: string }>();
  const conversation = useConversation(id);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const branches = useQuery({
    queryKey: ["share-branches", businessId],
    enabled: !!businessId && conversation.isSuccess,
    queryFn: () =>
      api.get<{ items: PublicShareBranch[] }>(`/v1/businesses/${businessId}/share-branches`),
  });
  const products = useQuery({
    queryKey: ["share-products", businessId, branchId, search],
    enabled: !!businessId && !!branchId && conversation.isSuccess,
    queryFn: () =>
      api.get<{ items: PublicShareProduct[] }>(
        `/v1/businesses/${businessId}/branches/${branchId}/share-products`,
        { q: search.trim() },
      ),
  });
  if (!businessId || !id)
    return (
      <EmptyState
        icon="link-outline"
        title="İşletme seçilmedi"
        message="Sohbette paylaş bölümünden işletme seç."
      />
    );
  if (conversation.isPending || branches.isPending) return <LoadingView />;
  if (conversation.isError) return <ErrorView error={conversation.error} />;
  if (branches.isError)
    return <ErrorView error={branches.error} onRetry={() => void branches.refetch()} />;
  const selected = branches.data.items.find((branch) => branch.id === branchId);
  const rows: ShareRow[] =
    selected === undefined
      ? branches.data.items.map((branch) => ({ kind: "branch", id: branch.id, branch }))
      : (products.data?.items ?? []).map((product) => ({
          kind: "product",
          id: product.id,
          product,
        }));
  return (
    <FlatList<ShareRow>
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      data={rows}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.heading}>
          <AppText variant="subheading">{selected?.name ?? "Şube seç"}</AppText>
          <AppText color="muted">
            {selected === undefined
              ? "Fiyatın doğru olması için şube seçmelisin."
              : "Paylaşmak istediğin ürüne dokun."}
          </AppText>
          {selected !== undefined && (
            <>
              <Button
                label="Şube değiştir"
                variant="secondary"
                onPress={() => {
                  setBranchId(null);
                  setSearch("");
                }}
              />
              <SearchField value={search} onChangeText={setSearch} placeholder="Ürün ara" />
            </>
          )}
        </View>
      }
      renderItem={({ item }) =>
        item.kind === "branch" ? (
          <ListRow
            title={item.branch.name}
            chevron
            onPress={() => {
              setBranchId(item.id);
            }}
          />
        ) : (
          <ListRow
            title={item.product.name}
            subtitle={`${(item.product.amountMinor / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })} · ${item.product.branchName}`}
            chevron
            onPress={() => {
              sendText(
                id,
                sharedTargetMessage(item.product.name, {
                  kind: "product",
                  id: item.id,
                  businessId,
                  branchId: item.product.branchId,
                }),
              );
              router.dismissTo({ pathname: "/chat/[id]", params: { id } });
            }}
          />
        )
      }
      ListEmptyComponent={
        selected === undefined ? (
          <EmptyState
            icon="storefront-outline"
            title="Açık şube yok"
            message="Bu işletme için ürün paylaşımı şu anda kullanılamıyor."
          />
        ) : products.isPending ? (
          <LoadingView />
        ) : products.isError ? (
          <ErrorView error={products.error} onRetry={() => void products.refetch()} />
        ) : (
          <EmptyState
            icon="pricetag-outline"
            title="Satışta ürün bulunamadı"
            message="Aramayı değiştirebilirsin."
          />
        )
      }
    />
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, paddingBottom: space.xl },
  heading: { padding: space.lg, gap: space.md },
});
