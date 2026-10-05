/** Tarayıcı önizlemesinde anlık bildirim yoktur; mesajlar gerçek zamanlı bağlantıyla gelir. */
export type PushRegistration = "registered" | "denied" | "unsupported" | "not_configured";

export function configureForegroundNotifications(): void {
  // Tarayıcıda yapılacak bir şey yok.
}

export type PushAvailability =
  "granted" | "denied" | "undetermined" | "unsupported" | "not_configured";

export function pushAvailability(): Promise<PushAvailability> {
  return Promise.resolve("unsupported");
}

export function registerForPush(_ask: boolean): Promise<PushRegistration> {
  return Promise.resolve("unsupported");
}

export function onNotificationOpened(_handler: (data: unknown) => void): () => void {
  return () => undefined;
}
