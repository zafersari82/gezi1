import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, space } from "@/theme/tokens";

import { AppText } from "./app-text";

interface SheetProps {
  visible: boolean;
  /** Arka plana dokunulduğunda veya geri tuşuna basıldığında çağrılır. */
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Ekranın altından açılan panel: onaylar, seçenekler ve kısa formlar burada gösterilir. */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Kapat" />
        <View style={[styles.panel, { paddingBottom: insets.bottom + space.xl }]}>
          {title !== undefined && <AppText variant="subheading">{title}</AppText>}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  panel: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    gap: space.lg,
    padding: space.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
  },
});
