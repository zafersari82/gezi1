import { CATEGORIES, categorySchema, type Category, type DiscoveryItem, type DiscoveryPage } from "@vado/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { api } from "@/api/client";
import { discoveryItemKey, DiscoveryResultRow } from "@/features/discovery/discovery-result-row";
import { useDiscoveryLocation } from "@/features/discovery/discovery-location";
import { type DiscoveryKind } from "@/features/discovery/search";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { CategoryFilter } from "@/ui/category-filter";
import { Chip } from "@/ui/chip";
import { SearchField } from "@/ui/search-field";
import { EmptyState } from "@/ui/states";

function searchKind(value: string | undefined): DiscoveryKind {
  return value === "business" || value === "miniapp" ? value : "all";
}

/** Sunucu araması: filtre değişiminde sayfa başından başlar; aynı isteği cihazda çoğaltmaz. */
export default function SearchScreen() {
  const { location, isPending: locationPending } = useDiscoveryLocation();
  const params = useLocalSearchParams<{ q?: string; category?: string; kind?: string }>();
  const [query, setQuery] = useState(params.q ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [category, setCategory] = useState<Category | null>(() => {
    const parsed = categorySchema.safeParse(params.category);
    return parsed.success ? parsed.data : null;
  });
  const [kind, setKind] = useState<DiscoveryKind>(() => searchKind(params.kind));

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useInfiniteQuery({
    queryKey: ["discovery", "search", debouncedQuery, kind, category, location?.provinceId, location?.districtId],
    enabled: !locationPending,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.get<DiscoveryPage>("/v1/discovery/search", {
      q: debouncedQuery, kind, category: category ?? undefined, limit: 20,
      cursor: pageParam,
      provinceId: kind === "miniapp" ? undefined : location?.provinceId,
      districtId: kind === "miniapp" ? undefined : location?.districtId,
    }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const updating = query.trim() !== debouncedQuery;
  const items: DiscoveryItem[] = updating ? [] : (search.data?.pages.flatMap((page) => page.items) ?? []);

  return (
    <FlatList
      style={styles.screen}
      data={items}
      keyExtractor={discoveryItemKey}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View>
          <AppText color="muted" variant="caption" style={styles.hint}>
            {location === null ? "Tüm Türkiye" : `${location.provinceName}${location.districtName ? ` / ${location.districtName}` : ""}`} · Mini uygulamalar ülke genelinde gösterilir.
          </AppText>
          <SearchField value={query} onChangeText={setQuery} placeholder="İşletme, hizmet veya uygulama ara" />
          <View style={styles.kindFilters}>
            <Chip label="Tümü" selected={kind === "all"} onPress={() => setKind("all")} />
            <Chip label="İşletmeler" selected={kind === "business"} onPress={() => setKind("business")} />
            <Chip label="Mini uygulamalar" selected={kind === "miniapp"} onPress={() => setKind("miniapp")} />
          </View>
          <CategoryFilter available={[...CATEGORIES]} selected={category} onChange={setCategory} />
          <AppText color="muted" variant="caption" style={styles.hint}>
            {updating || search.isPending ? "Aranıyor…" : `${items.length} sonuç gösteriliyor${search.hasNextPage ? " · Daha fazlası var" : ""}`}
          </AppText>
        </View>
      }
      renderItem={({ item }) => <DiscoveryResultRow item={item} />}
      ListEmptyComponent={
        <View style={styles.state}>
          {(updating || search.isPending) ? <ActivityIndicator color={colors.teal} /> :
            search.isError ? (
              <EmptyState icon="cloud-offline-outline" title="Arama yapılamadı"
                message="İnternet bağlantını kontrol edip yeniden dene."
                actionLabel="Tekrar dene" onAction={() => { void search.refetch(); }} />
            ) : (
              <EmptyState icon="search-outline" title="Sonuç bulunamadı"
                message="Arama ifadesini kısalt veya kategori süzgecini kaldır." />
            )}
        </View>
      }
      ListFooterComponent={items.length > 0 ? (
        <View style={styles.footer}>
          {search.isFetchNextPageError ? (
            <Button label="Devamını yeniden dene" variant="secondary" size="small"
              onPress={() => { void search.fetchNextPage(); }} />
          ) : search.hasNextPage ? (
            <Button label="Daha fazla göster" variant="secondary" size="small"
              loading={search.isFetchingNextPage} onPress={() => { void search.fetchNextPage(); }} />
          ) : null}
        </View>
      ) : null}
      refreshControl={<RefreshControl refreshing={search.isRefetching && !search.isFetchingNextPage}
        onRefresh={() => { void search.refetch(); }} tintColor={colors.teal} />}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, paddingBottom: space.lg },
  kindFilters: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  hint: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  state: { minHeight: 220, justifyContent: "center" },
  footer: { padding: space.lg, alignItems: "center" },
});
