import { Pressable, StyleSheet } from "react-native";

import { colors, radius, space } from "@/theme/tokens";

import { AppText } from "./app-text";

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** Süzgeç ve seçenek düğmesi (ör. kategori seçimi). */
export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <AppText variant="callout" color={selected ? "white" : "ink"}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.md + 2,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  selected: {
    borderColor: colors.teal,
    backgroundColor: colors.teal,
  },
});
