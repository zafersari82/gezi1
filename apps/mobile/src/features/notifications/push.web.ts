/** Tarayıcı önizlemesinde anlık bildirim yoktur; mesajlar gerçek zamanlı bağlantıyla gelir. */
export type PushRegistration = "registered" | "denied" | "unsupported" | "not_configured";

export function configureForegroundNotifications(): void {
  // Tarayıcıda yapılacak bir şey yok.
}

export function notificationPermission(): Promise<"granted" | "denied" | "undetermined"> {
  return Promise.resolve("denied");
}

export function registerForPush(_ask: boolean): Promise<PushRegistration> {
  return Promise.resolve("unsupported");
}

export function onNotificationOpened(_handler: (data: unknown) => void): () => void {
  return () => undefined;
}
