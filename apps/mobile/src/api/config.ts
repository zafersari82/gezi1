import Constants from "expo-constants";
import { Platform } from "react-native";

const DEVELOPMENT_API_PORT = 4000;

/**
 * Geliştirme sırasında API, Expo geliştirme sunucusuyla aynı bilgisayarda çalışır.
 * Telefon o bilgisayara ağ adresiyle bağlandığı için adres Expo'nun bildirdiği sunucudan alınır;
 * böylece emülatörde, gerçek telefonda ve tarayıcıda ayar yapmadan doğru adrese gidilir.
 */
function developmentHost(): string {
  if (Platform.OS === "web") return window.location.hostname;
  return Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
}

const configuredUrl = process.env.EXPO_PUBLIC_API_URL;

/** API'nin kök adresi; sonunda eğik çizgi bulunmaz. */
export const API_URL = (
  configuredUrl !== undefined && configuredUrl !== ""
    ? configuredUrl
    : `http://${developmentHost()}:${DEVELOPMENT_API_PORT}`
).replace(/\/+$/, "");

export const JITSI_URL = (process.env.EXPO_PUBLIC_JITSI_URL ?? "https://meet.jit.si").replace(
  /\/+$/,
  "",
);

export const APP_VERSION = Constants.expoConfig?.version ?? "2.5.0";
