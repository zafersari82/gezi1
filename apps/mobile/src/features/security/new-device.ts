import { createStore, useStore } from "@/lib/store";

/** Hesaba yeni bir cihazdan giriş yapıldığında o cihazın adı; gösterilecek uyarı yokken `null`. */
const store = createStore<string | null>(null);

/** Gerçek zamanlı kanaldan "yeni cihaz" bildirimi geldiğinde çağrılır. */
export function alertNewDevice(deviceName: string): void {
  store.set(deviceName);
}

export function dismissNewDeviceAlert(): void {
  store.set(null);
}

export function useNewDeviceAlert(): string | null {
  return useStore(store);
}
