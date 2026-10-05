import { CameraView, useCameraPermissions } from "expo-camera";
import * as Linking from "expo-linking";
import { StyleSheet, View } from "react-native";

import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";

import type { QrScannerProps } from "./qr-scanner.types";

/** Kamerayla QR kod okur. Web önizlemesinin karşılığı `qr-scanner.web.tsx` dosyasındadır. */
export function QrScanner({ onScanned, paused = false }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();

  if (permission === null) return <View style={styles.camera} />;

  if (!permission.granted) {
    return (
      <View style={styles.permission}>
        <AppText color="white" align="center">
          QR kod okutmak için kamera izni gerekiyor.
        </AppText>
        {permission.canAskAgain ? (
          <Button
            label="Kameraya izin ver"
            variant="secondary"
            onPress={() => void requestPermission()}
          />
        ) : (
          <Button
            label="Ayarları aç"
            variant="secondary"
            onPress={() => void Linking.openSettings()}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.camera}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={
          paused
            ? undefined
            : ({ data }) => {
                onScanned(data);
              }
        }
      />
      <View style={styles.frame} />
    </View>
  );
}

const styles = StyleSheet.create({
  camera: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.black,
  },
  permission: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    padding: space.xxl,
    backgroundColor: colors.black,
  },
  frame: {
    width: "68%",
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: colors.white,
    borderRadius: radius.xl,
    pointerEvents: "none",
  },
});
