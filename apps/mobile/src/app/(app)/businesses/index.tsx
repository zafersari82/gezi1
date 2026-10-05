import { type Category, CATEGORY_LABELS } from "@vado/contracts";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { CategoryTile } from "@/features/businesses/category-tile";
import { useBusinesses } from "@/features/businesses/queries";
import { foldText } from "@/lib/text";
import { colors } from "@/theme/tokens";
import { CategoryFilter } from "@/ui/category-filter";
import { Icon } from "@/ui/icon";
import { ListRow } from "@/ui/list-row";
import { SearchField } from "@/ui/search-field";
import { EmptyState, ErrorView, LoadingView } from "@/ui/states";

export default function BusinessesScreen() {
  const businesses = useBusinesses();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | null>(null);

  if (businesses.isPending) return <LoadingView />;
  if (businesses.isError) {
    return <ErrorView error={businesses.error} onRetry={() => void businesses.refetch()} />;
  }

  const needle = foldText(search);
  const visible = businesses.data.filter(
    (business) =>
      (category === null || business.category === category) &&
      (needle === "" || foldText(`${business.name} ${business.city}`).includes(needle)),
  );

  return (
    <FlatList
      data={visible}
      keyExtractor={(business) => business.id}
      style={styles.list}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder="İşletme veya şehir ara"
          />
          <CategoryFilter
            available={businesses.data.map((business) => business.category)}
            selected={category}
            onChange={setCategory}
          />
        </View>
      }
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={`${CATEGORY_LABELS[item.category]}, ${item.city}`}
          leading={<CategoryTile category={item.category} />}
          trailing={<Icon name="checkmark-circle" size={18} color="teal" />}
          chevron
          onPress={() => {
            router.push({ pathname: "/businesses/[id]", params: { id: item.id } });
          }}
          testID={`business-${item.id}`}
        />
      )}
      ListEmptyComponent={
        <EmptyState
          icon="storefront-outline"
          title={businesses.data.length === 0 ? "Henüz işletme yok" : "Sonuç bulunamadı"}
          message={
            businesses.data.length === 0
              ? "Doğrulanan işletme hesapları burada listelenir."
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
