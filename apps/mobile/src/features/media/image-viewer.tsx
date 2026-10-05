import { Image } from "expo-image";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, space } from "@/theme/tokens";
import { HeaderButton } from "@/ui/header-button";

interface ImageViewerProps {
  /** Gösterilecek görselin adresi; `null` iken pencere kapalıdır. */
  imageUrl: string | null;
  onClose: () => void;
}

/** Görseli tam ekranda gösterir; herhangi bir yere dokununca kapanır. */
export function ImageViewer({ imageUrl, onClose }: ImageViewerProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={imageUrl !== null}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Görseli kapat">
        {imageUrl !== null && (
          <Image source={{ uri: imageUrl }} style={styles.image} contentFit="contain" />
        )}
      </Pressable>
      <View style={[styles.close, { top: insets.top + space.sm }]}>
        <HeaderButton icon="close" label="Kapat" color="white" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.black,
  },
  image: {
    flex: 1,
  },
  close: {
    position: "absolute",
    right: space.lg,
  },
});
