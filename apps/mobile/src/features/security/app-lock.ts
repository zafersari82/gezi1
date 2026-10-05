import { AppState, Platform } from "react-native";

import { secureStorage } from "@/features/session/secure-storage";
import { createStore, useStore } from "@/lib/store";

import { shouldLock } from "./lock-policy";

const SETTING_KEY = "vado.app-lock";

interface AppLockState {
  /** Kullanıcı uygulama kilidini açmış mı? */
  enabled: boolean;
  /** Uygulama şu anda kilitli mi? Kilitliyken yalnızca kilit ekranı gösterilir. */
  locked: boolean;
}

const store = createStore<AppLockState>({ enabled: false, locked: false });

/** Açılışta kayıtlı ayarı okur; kilit açıksa uygulama kilitli başlar. */
export async function loadAppLock(): Promise<void> {
  const enabled = (await secureStorage.get(SETTING_KEY)) === "on";
  store.set({ enabled, locked: enabled });
}

/** Ayarı değiştirir. Çağıran, kullanıcının cihaz kilidini geçtiğinden emin olmalıdır. */
export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) await secureStorage.set(SETTING_KEY, "on");
  else await secureStorage.remove(SETTING_KEY);
  store.set({ enabled, locked: false });
}

export function unlockApp(): void {
  store.set((state) => ({ ...state, locked: false }));
}

/** Uygulama arka planda yeterince uzun kaldıysa dönüşte kilitler. */
export function watchAppLock(): () => void {
  if (Platform.OS === "web") return () => undefined;
  let leftAt: number | null = null;
  const subscription = AppState.addEventListener("change", (status) => {
    if (status !== "active") {
      leftAt ??= Date.now();
      return;
    }
    const { enabled } = store.get();
    if (leftAt !== null && shouldLock(enabled, Date.now() - leftAt)) {
      store.set({ enabled, locked: true });
    }
    leftAt = null;
  });
  return () => {
    subscription.remove();
  };
}

export function useAppLock(): AppLockState {
  return useStore(store);
}
