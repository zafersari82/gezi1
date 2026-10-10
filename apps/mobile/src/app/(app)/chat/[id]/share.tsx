import { useInfiniteQuery } from "@tanstack/react-query";
import type { DiscoveryItem, DiscoveryPage } from "@vado/contracts";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";

import { api } from "@/api/client";
import { CategoryTile } from "@/features/businesses/category-tile";
import { sendText, useConversation } from "@/features/chat/queries";
import { useDiscoveryLocation } from "@/features/discovery/discovery-location";
import { discoveryItemKey } from "@/features/discovery/discovery-result-row";
import { MiniAppIcon } from "@/features/miniapps/mini-app-icon";
import { sharedTargetMessage } from "@/features/sharing/shared-target";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { ListRow } from "@/ui/list-row";
import { SearchField } from "@/ui/search-field";
import { EmptyState, ErrorView, LoadingView } from "@/ui/states";

/** Sohbetten çıkmadan sunucuda arar; sınırlı ilk 200 kayıt üzerinden seçim yapmaz. */
export default function ChatShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversation = useConversation(id);
  const { location, isPending: locationPending } = useDiscoveryLocation();
  const [query, setQuery] = useState("");
  const [needle, setNeedle] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setNeedle(query.trim());
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);
  const results = useInfiniteQuery({
    queryKey: ["chat-share", needle, location?.provinceId, location?.districtId],
    enabled: !locationPending && conversation.isSuccess,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<DiscoveryPage>("/v1/discovery/search", {
        q: needle,
        kind: "all",
        limit: 20,
        cursor: pageParam,
        provinceId: location?.provinceId,
        districtId: location?.districtId,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  if (conversation.isPending || locationPending) return <LoadingView />;
  if (conversation.isError) return <ErrorView error={conversation.error} />;
  const changing = needle !== query.trim();
  const items: DiscoveryItem[] = changing
    ? []
    : (results.data?.pages.flatMap((page) => page.items) ?? []);
  function share(item: DiscoveryItem): void {
    if (item.kind === "business") {
      sendText(
        id,
        sharedTargetMessage(item.business.name, { kind: "business", id: item.business.id }),
      );
    } else {
      sendText(
        id,
        sharedTargetMessage(item.miniApp.name, { kind: "miniapp", id: item.miniApp.id }),
      );
    }
    router.back();
  }
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      data={items}
      keyExtractor={discoveryItemKey}
      ListHeaderComponent={
        <View style={styles.heading}>
          <AppText color="muted">Göndereceğin mağazayı veya mini uygulamayı seç.</AppText>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="İşletme veya mini uygulama ara"
          />
        </View>
      }
      renderItem={({ item }) =>
        item.kind === "business" ? (
          <View>
            <ListRow
              title={item.business.name}
              subtitle="Mağaza bağlantısı gönder"
              leading={<CategoryTile category={item.business.category} />}
              chevron
              onPress={() => {
                share(item);
              }}
            />
            <ListRow
              title="Ürününü paylaş"
              subtitle="Şube ve ürün seç"
              chevron
              onPress={() => {
                router.push({
                  pathname: "/chat/[id]/products",
                  params: { id, businessId: item.business.id },
                });
              }}
            />
          </View>
        ) : (
          <ListRow
            title={item.miniApp.name}
            subtitle="Mini uygulama bağlantısı gönder"
            leading={<MiniAppIcon miniApp={item.miniApp} />}
            chevron
            onPress={() => {
              share(item);
            }}
          />
        )
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          {changing || results.isPending ? (
            <ActivityIndicator color={colors.teal} />
          ) : results.isError ? (
            <ErrorView error={results.error} onRetry={() => void results.refetch()} />
          ) : (
            <EmptyState
              icon="search-outline"
              title="Sonuç bulunamadı"
              message="Arama kelimelerini değiştirebilirsin."
            />
          )}
        </View>
      }
      ListFooterComponent={
        results.hasNextPage && !changing ? (
          <Button
            label="Daha fazla göster"
            variant="secondary"
            loading={results.isFetchingNextPage}
            onPress={() => void results.fetchNextPage()}
          />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, paddingBottom: space.xl },
  heading: { padding: space.lg, gap: space.md },
  empty: { padding: space.lg },
});
