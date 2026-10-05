import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect } from "react";

import { configureForegroundNotifications, onNotificationOpened, registerForPush } from "./push";
import { pushTarget } from "./push-routing";

/** İzin bu cihazda bir kez, ilk girişten sonra sorulur; sonra Ben › Bildirimler ekranından açılır. */
const ASKED_KEY = "vado.push.asked";

/**
 * Oturum açıkken bildirim adresini kaydeder ve bildirime dokunulunca ilgili ekranı açar.
 * Görünür bir şey çizmez.
 */
export function PushListener() {
  useEffect(() => {
    configureForegroundNotifications();
    async function register() {
      const asked = (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) !== null;
      await registerForPush(!asked);
      if (!asked) await AsyncStorage.setItem(ASKED_KEY, "1").catch(() => undefined);
    }
    // Bildirim kurulamazsa uygulama bildirimsiz çalışmaya devam eder.
    register().catch(() => undefined);

    return onNotificationOpened((data) => {
      const target = pushTarget(data);
      if (target !== null) router.push(target);
    });
  }, []);
  return null;
}
