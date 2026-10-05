import type { NativeStackNavigationOptions } from "expo-router";

import { colors, typography } from "./tokens";

/** Tüm yığın gezginlerinin ortak başlık görünümü. */
export const stackScreenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerShadowVisible: false,
  headerTintColor: colors.teal,
  headerTitleStyle: { ...typography.subheading, color: colors.ink },
  headerBackButtonDisplayMode: "minimal",
  contentStyle: { backgroundColor: colors.surface },
};
