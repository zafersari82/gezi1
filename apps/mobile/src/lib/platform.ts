import type { Platform as SessionPlatform } from "@vado/contracts";
import { Platform } from "react-native";

/** Uygulamanın çalıştığı platform; sözleşmedeki üç değerden biri. */
export function currentPlatform(): SessionPlatform {
  return Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
}
