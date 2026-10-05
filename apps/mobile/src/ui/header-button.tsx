import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { type ColorName, space, TOUCH_TARGET } from "@/theme/tokens";

import { Icon, type IconName } from "./icon";

interface HeaderButtonProps {
  icon: IconName;
  /** Ekran okuyucular için düğmenin yaptığı iş. */
  label: string;
  onPress: () => void;
  color?: ColorName;
  testID?: string;
}

/** Başlık çubuklarındaki simge düğmesi. */
export function HeaderButton({ icon, label, onPress, color = "teal", testID }: HeaderButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      testID={testID}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Icon name={icon} size={24} color={color} />
    </Pressable>
  );
}

interface HeaderActionsProps {
  children: ReactNode;
  /**
   * Sekme başlıklarını her platformda uygulama çizer. Yığın başlıklarını telefonda işletim sistemi
   * çizer ve kenar boşluğunu kendisi verir; uygulamanın çizdiği başlıklarda boşluk burada verilir.
   */
  tabs?: boolean;
}

/** Başlığın sağındaki düğmeleri yan yana dizer. */
export function HeaderActions({ children, tabs = false }: HeaderActionsProps) {
  const drawnByApp = tabs || Platform.OS === "web";
  return <View style={[styles.actions, drawnByApp && styles.inset]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minWidth: TOUCH_TARGET - 8,
    height: TOUCH_TARGET - 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  inset: {
    marginRight: space.md,
  },
});
