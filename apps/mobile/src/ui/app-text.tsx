import { Text, type TextProps } from "react-native";

import { type ColorName, colors, type TextVariant, typography } from "@/theme/tokens";

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: ColorName;
  align?: "left" | "center" | "right";
}

/** Uygulamadaki tüm metinler bu bileşenle yazılır; boyut ve renk yalnızca belirteçlerden gelir. */
export function AppText({ variant = "body", color = "ink", align, style, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        { color: colors[color] },
        align === undefined ? null : { textAlign: align },
        style,
      ]}
    />
  );
}
