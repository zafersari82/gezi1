import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";

import type { QrScannerProps } from "./qr-scanner.types";

/**
 * Web önizlemesinde kamera kullanılmaz; QR kodun metni elle yapıştırılır.
 * Kod metni "QR kodum" ekranındaki "Kodu kopyala" düğmesiyle alınabilir.
 */
export function QrScanner({ onScanned, paused = false }: QrScannerProps) {
  const [value, setValue] = useState("");

  return (
    <View style={styles.box}>
      <AppText color="muted">
        Web önizlemesinde kamera kullanılmaz. Okutmak istediğin kodun metnini buraya yapıştır.
      </AppText>
      <TextField
        label="QR kod metni"
        placeholder="vado://q/…"
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        testID="qr-text"
      />
      <Button
        label="Kodu aç"
        disabled={value.trim() === ""}
        loading={paused}
        onPress={() => {
          onScanned(value.trim());
        }}
        testID="qr-submit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    gap: space.lg,
    padding: space.xl,
    backgroundColor: colors.surface,
  },
});
