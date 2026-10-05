import { StyleSheet, TextInput, View } from "react-native";

import { colors, radius, space, typography } from "@/theme/tokens";

import { Icon } from "./icon";

interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}

/** Listelerin üstündeki süzme alanı. Yazdıkça liste cihazda süzülür. */
export function SearchField({ value, onChangeText, placeholder }: SearchFieldProps) {
  return (
    <View style={styles.field}>
      <Icon name="search" size={18} color="faint" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 40,
    marginHorizontal: space.lg,
    marginVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.mist,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.ink,
    paddingVertical: 0,
    outlineWidth: 0,
  },
});
