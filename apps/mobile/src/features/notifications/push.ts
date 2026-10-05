import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/api/client";

/**
 * Bildirim adresinin kaydı. `registered`: adres sunucuya yazıldı. `denied`: kullanıcı izin vermedi.
 * `unsupported`: öykünücü ya da tarayıcı. `not_configured`: uygulama bir Expo projesine bağlı değil
 * (`app.json` içinde `extra.eas.projectId` yok); bildirim için önce EAS kurulumu gerekir.
 */
export type PushRegistration = "registered" | "denied" | "unsupported" | "not_configured";

/** Uygulama açıkken bildirim afişi gösterilmez: yeni mesaj zaten ekranda görünür. */
export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
  });
}

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId;
  return typeof id === "string" && id !== "" ? id : null;
}

export async function notificationPermission(): Promise<"granted" | "denied" | "undetermined"> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/**
 * İzin verilmişse (ya da `ask` ile sorulup verilirse) cihazın bildirim adresini alır ve oturuma
 * yazar. Adres oturuma bağlıdır; çıkışta sunucu kendisi siler.
 */
export async function registerForPush(ask: boolean): Promise<PushRegistration> {
  if (!Device.isDevice) return "unsupported";
  const id = projectId();
  if (id === null) return "not_configured";

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Mesajlar ve güvenlik",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let status = await notificationPermission();
  if (status !== "granted" && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return "denied";

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await api.put("/v1/me/push-token", { token });
  return "registered";
}

/** Bildirime dokunulduğunda çağrılır; uygulama kapalıyken dokunulan bildirim de bir kez gelir. */
export function onNotificationOpened(handler: (data: unknown) => void): () => void {
  const last = Notifications.getLastNotificationResponse();
  if (last !== null) {
    handler(last.notification.request.content.data);
    Notifications.clearLastNotificationResponse();
  }
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data);
  });
  return () => {
    subscription.remove();
  };
}
