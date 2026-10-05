import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { type ColorName, colors, space } from "@/theme/tokens";

import { AppText } from "./app-text";
import { Icon } from "./icon";

interface ListRowProps {
  title: string;
  subtitle?: string | null;
  /** Satırın başındaki öğe: profil resmi veya simge kutusu. */
  leading?: ReactNode;
  /** Satırın sonundaki öğe: zaman, rozet, düğme veya anahtar. */
  trailing?: ReactNode;
  /** Metnin altında, metinle aynı hizada duran öğe (ör. yan yana iki eylem düğmesi). */
  footer?: ReactNode;
  /**
   * Satırın tamamını dokunulabilir yapar. Düğme ya da anahtar taşıyan satıra verilmez:
   * dokunulabilir öğeler iç içe konmaz.
   */
  onPress?: () => void;
  /** Başka bir ekrana götüren satırlarda sağda ok gösterilir. */
  chevron?: boolean;
  titleColor?: ColorName;
  /** Alt başlığın en fazla kaç satır kaplayacağı. */
  subtitleLines?: number;
  testID?: string;
}

/**
 * Uygulamadaki tüm listelerin ortak satırı. Satırlar kart içine alınmaz;
 * birbirinden yalnızca metnin hizasından başlayan ince bir çizgiyle ayrılır.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  footer,
  onPress,
  chevron = false,
  titleColor = "ink",
  subtitleLines = 1,
  testID,
}: ListRowProps) {
  const content = (
    <>
      {leading !== undefined && (
        <View style={footer !== undefined && styles.leadingTop}>{leading}</View>
      )}
      <View style={styles.body}>
        <View style={styles.texts}>
          <AppText variant="body" color={titleColor} numberOfLines={1}>
            {title}
          </AppText>
          {subtitle !== undefined && subtitle !== null && subtitle !== "" && (
            <AppText variant="callout" color="muted" numberOfLines={subtitleLines}>
              {subtitle}
            </AppText>
          )}
          {footer !== undefined && <View style={styles.footer}>{footer}</View>}
        </View>
        {trailing}
        {chevron && <Icon name="chevron-forward" size={18} color="faint" />}
      </View>
    </>
  );

  if (onPress === undefined) {
    return (
      <View style={styles.row} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingLeft: space.lg,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.mist,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.md,
    paddingRight: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  // Altında düğme bulunan uzun satırlarda baştaki öğe ortalanmaz, ilk satırla hizalanır.
  leadingTop: {
    alignSelf: "flex-start",
    paddingTop: space.md,
  },
  footer: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.sm,
  },
});
