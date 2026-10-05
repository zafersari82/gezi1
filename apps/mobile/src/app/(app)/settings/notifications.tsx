import { useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import {
  notificationPermission,
  type PushRegistration,
  registerForPush,
} from "@/features/notifications/push";
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from "@/features/notifications/queries";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";
import { ErrorView, LoadingView } from "@/ui/states";
import { Toggle } from "@/ui/toggle";

type DeviceState = "granted" | "denied" | "undetermined" | PushRegistration;

const DEVICE_NOTES: Partial<Record<DeviceState, string>> = {
  denied: "Bu telefonda VADO bildirimlerine izin verilmedi. Telefonun ayarlarından açabilirsin.",
  undetermined: "Bu telefonda bildirimler henüz açılmadı.",
  unsupported: "Bu cihazda anlık bildirim yok; mesajlar uygulama açıkken gelir.",
  not_configured: "Bu VADO kurulumunda anlık bildirim yapılandırılmamış.",
};

export default function NotificationSettingsScreen() {
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const { notify } = useFeedback();
  const [device, setDevice] = useState<DeviceState | null>(null);

  useEffect(() => {
    void notificationPermission().then(setDevice);
  }, []);

  async function enable() {
    try {
      setDevice(await registerForPush(true));
    } catch (error) {
      notify(errorMessage(error));
    }
  }

  if (settings.isPending) return <LoadingView />;
  if (settings.isError) {
    return <ErrorView error={settings.error} onRetry={() => void settings.refetch()} />;
  }
  const onError = (error: unknown) => {
    notify(errorMessage(error));
  };
  const note = device === null ? undefined : DEVICE_NOTES[device];

  return (
    <ScrollView style={styles.screen}>
      {note !== undefined && (
        <View style={styles.device}>
          <AppText color="muted">{note}</AppText>
          {device === "undetermined" && (
            <Button label="Bildirimleri aç" onPress={() => void enable()} testID="enable-push" />
          )}
          {device === "denied" && (
            <Button
              label="Telefonun ayarlarını aç"
              variant="secondary"
              onPress={() => void Linking.openSettings()}
            />
          )}
        </View>
      )}

      <SectionTitle>Mesajlar</SectionTitle>
      <ListRow
        title="Yeni mesaj bildirimi"
        trailing={
          <Toggle
            value={settings.data.pushMessages}
            onChange={(value) => {
              update.mutate({ pushMessages: value }, { onError });
            }}
            label="Yeni mesaj bildirimi"
          />
        }
      />
      <ListRow
        title="Mesajın içeriğini göster"
        subtitle="Kapalıyken bildirimde yalnızca “Yeni mesajın var” yazar; gönderen ve metin kilit ekranında görünmez."
        subtitleLines={3}
        trailing={
          <Toggle
            value={settings.data.pushPreview}
            disabled={!settings.data.pushMessages}
            onChange={(value) => {
              update.mutate({ pushPreview: value }, { onError });
            }}
            label="Mesajın içeriğini göster"
          />
        }
      />

      <SectionTitle>Güvenlik</SectionTitle>
      <AppText color="muted" style={styles.note}>
        Hesabına yeni bir cihazdan girildiğinde diğer cihazlarına her zaman bildirim gelir; bu
        bildirim kapatılamaz.
      </AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  device: {
    gap: space.md,
    padding: space.lg,
  },
  note: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
});
