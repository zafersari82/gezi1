import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { type ColorName, colors, radius, space } from "@/theme/tokens";

import { AppText } from "./app-text";
import { Icon, type IconName } from "./icon";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: "large" | "small";
  icon?: IconName;
  /** İşlem sürerken düğme kilitlenir ve etiketin yerinde bekleme göstergesi çıkar. */
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}

const TEXT_COLOR: Record<ButtonVariant, ColorName> = {
  primary: "white",
  secondary: "ink",
  danger: "coral",
  ghost: "teal",
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "large",
  icon,
  loading = false,
  disabled = false,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const textColor = disabled ? "faint" : TEXT_COLOR[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        size === "large" ? styles.large : styles.small,
        styles[variant],
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[textColor]} />
      ) : (
        <View style={styles.content}>
          {icon !== undefined && <Icon name={icon} size={18} color={textColor} />}
          <AppText variant={size === "large" ? "bodyStrong" : "callout"} color={textColor}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  large: {
    minHeight: 50,
    paddingHorizontal: space.xl,
  },
  small: {
    minHeight: 36,
    paddingHorizontal: space.lg,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  primary: {
    backgroundColor: colors.teal,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
  },
  danger: {
    backgroundColor: colors.surface,
    borderColor: colors.coralSoft,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  disabled: {
    backgroundColor: colors.mist,
    borderColor: colors.mist,
  },
  pressed: {
    opacity: 0.75,
  },
});
