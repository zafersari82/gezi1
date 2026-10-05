import type { Category } from "@vado/contracts";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { MiniAppIcon } from "@/features/miniapps/mini-app-icon";
import { useMiniApps } from "@/features/miniapps/queries";
import { foldText } from "@/lib/text";
import { colors } from "@/theme/tokens";
import { CategoryFilter } from "@/ui/category-filter";
import { Icon } from "@/ui/icon";
import { ListRow } from "@/ui/list-row";
import { SearchField } from "@/ui/search-field";
import { EmptyState, ErrorView, LoadingView } from "@/ui/states";

export default function MiniAppsScreen() {
  const miniApps = useMiniApps();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | null>(null);

  if (miniApps.isPending) return <LoadingView />;
  if (miniApps.isError) {
    return <ErrorView error={miniApps.error} onRetry={() => void miniApps.refetch()} />;
  }

  const needle = foldText(search);
  const visible = miniApps.data.filter(
    (miniApp) =>
      (category === null || miniApp.category === category) &&
      (needle === "" || foldText(`${miniApp.name} ${miniApp.description}`).includes(needle)),
  );

  return (
    <FlatList
      data={visible}
      keyExtractor={(miniApp) => miniApp.id}
      style={styles.list}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <SearchField value={search} onChangeText={setSearch} placeholder="Mini uygulama ara" />
          <CategoryFilter
            available={miniApps.data.map((miniApp) => miniApp.category)}
            selected={category}
            onChange={setCategory}
          />
        </View>
      }
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={item.description}
          subtitleLines={2}
          leading={<MiniAppIcon miniApp={item} />}
          trailing={item.verified ? <Icon name="checkmark-circle" size={18} color="teal" /> : null}
          onPress={() => {
            router.push({ pathname: "/miniapps/[id]", params: { id: item.id } });
          }}
          testID={`miniapp-${item.id}`}
        />
      )}
      ListEmptyComponent={
        <EmptyState
          icon="apps-outline"
          title={miniApps.data.length === 0 ? "Henüz mini uygulama yok" : "Sonuç bulunamadı"}
          message={
            miniApps.data.length === 0
              ? "Yayına alınan mini uygulamalar burada listelenir."
              : "Aramanı veya kategori seçimini değiştirerek yeniden dene."
          }
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
});
