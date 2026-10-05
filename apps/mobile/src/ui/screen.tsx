import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";

import { colors, space } from "@/theme/tokens";

import { AppText } from "./app-text";

interface ScreenProps {
  children: ReactNode;
  /** İçerik ekrana sığmayabilecekse kaydırılabilir yapılır. */
  scroll?: boolean;
  /** Form ve metin ekranlarında içeriğe yatay ve dikey boşluk verir. */
  padded?: boolean;
  background?: "surface" | "mist";
  /** Güvenli alan uygulanacak kenarlar. Başlığı olan ekranlarda üst kenar gerekmez. */
  edges?: Edge[];
  /** Ekranın altına sabitlenen alan (ör. kaydet düğmesi). */
  footer?: ReactNode;
}

const DEFAULT_EDGES: Edge[] = ["bottom", "left", "right"];

export function Screen({
  children,
  scroll = false,
  padded = false,
  background = "surface",
  edges = DEFAULT_EDGES,
  footer,
}: ScreenProps) {
  const contentStyle: ViewStyle[] = padded ? [styles.padded] : [];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors[background] }]} edges={edges}>
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[styles.scrollContent, ...contentStyle]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, ...contentStyle]}>{children}</View>
      )}
      {footer !== undefined && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

/** Gruplanmış liste bölümlerinin üstündeki küçük başlık. */
export function SectionTitle({ children }: { children: string }) {
  return (
    <AppText variant="caption" color="muted" style={styles.sectionTitle}>
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  padded: {
    padding: space.xl,
    gap: space.lg,
  },
  footer: {
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
});
