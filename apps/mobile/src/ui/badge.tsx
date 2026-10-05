import { StyleSheet, View } from "react-native";

import { type ColorName, colors, radius, space } from "@/theme/tokens";

import { AppText } from "./app-text";

const MAX_COUNT = 99;

/** Okunmamış mesaj ve bekleyen istek sayısı. Sıfırda hiçbir şey çizmez. */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > MAX_COUNT ? `${MAX_COUNT}+` : String(count);
  return (
    <View style={styles.count} accessibilityLabel={`${label} yeni`}>
      <AppText variant="micro" color="white">
        {label}
      </AppText>
    </View>
  );
}

type Tone = "neutral" | "positive" | "warning" | "danger";

const TONES: Record<Tone, { background: string; text: ColorName }> = {
  neutral: { background: colors.mist, text: "muted" },
  positive: { background: colors.tealSoft, text: "teal" },
  warning: { background: colors.amberSoft, text: "amber" },
  danger: { background: colors.coralSoft, text: "coral" },
};

/** Durum etiketi: "Ödendi", "Deneme", "Onay bekliyor" gibi kısa bilgiler. */
export function Tag({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const { background, text } = TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: background }]}>
      <AppText variant="micro" color={text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  count: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.coral,
  },
  tag: {
    alignSelf: "flex-start",
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
});
