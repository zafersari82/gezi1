import { type Category, CATEGORY_LABELS } from "@vado/contracts";
import { ScrollView, StyleSheet } from "react-native";

import { space } from "@/theme/tokens";

import { Chip } from "./chip";

interface CategoryFilterProps {
  /** Listede gerçekten bulunan kategoriler; yalnızca bunlar için düğme gösterilir. */
  available: Category[];
  /** Seçili kategori; `null` tümünü gösterir. */
  selected: Category | null;
  onChange: (category: Category | null) => void;
}

/** İşletme ve mini uygulama listelerinin üstündeki yatay kategori süzgeci. */
export function CategoryFilter({ available, selected, onChange }: CategoryFilterProps) {
  const categories = [...new Set(available)];
  if (categories.length < 2) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      keyboardShouldPersistTaps="handled"
    >
      <Chip
        label="Tümü"
        selected={selected === null}
        onPress={() => {
          onChange(null);
        }}
      />
      {categories.map((category) => (
        <Chip
          key={category}
          label={CATEGORY_LABELS[category]}
          selected={selected === category}
          onPress={() => {
            onChange(category);
          }}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
});
