import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { Sheet } from "@/ui/sheet";

import { dismissNewDeviceAlert, useNewDeviceAlert } from "./new-device";

/** Hesaba daha önce kullanılmamış bir cihazdan giriş yapıldığında açık cihazlarda çıkan uyarı. */
export function NewDeviceAlert() {
  const deviceName = useNewDeviceAlert();

  return (
    <Sheet
      visible={deviceName !== null}
      title="Yeni cihazdan giriş"
      onClose={dismissNewDeviceAlert}
    >
      <AppText color="muted">
        Hesabına “{deviceName}” adlı cihazdan giriş yapıldı. Sen değilsen o cihazın oturumunu hemen
        kapat.
      </AppText>
      <View style={styles.actions}>
        <Button
          label="Oturumları gör"
          onPress={() => {
            dismissNewDeviceAlert();
            router.push("/settings/sessions");
          }}
          testID="new-device-sessions"
        />
        <Button label="Ben yaptım" variant="ghost" onPress={dismissNewDeviceAlert} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: space.sm,
  },
});
