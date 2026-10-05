import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

import { type AccentName, accents, type ColorName, colors, radius } from "@/theme/tokens";

export type IconName = ComponentProps<typeof Ionicons>["name"];

interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorName;
}

export function Icon({ name, size = 22, color = "ink" }: IconProps) {
  return <Ionicons name={name} size={size} color={colors[color]} />;
}

interface IconTileProps {
  name: IconName;
  /** Kutunun zemin rengi; simge beyaz çizilir. */
  accent: AccentName;
  size?: number;
}

/** Liste satırlarının başındaki renkli simge kutusu. */
export function IconTile({ name, accent, size = 36 }: IconTileProps) {
  return (
    <View
      style={[styles.tile, { width: size, height: size, backgroundColor: accents[accent] }]}
      aria-hidden
    >
      <Ionicons name={name} size={size * 0.56} color={colors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
});
