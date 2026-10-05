import { focusManager, QueryClient } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";

import { ApiError } from "./client";

const STALE_TIME_MS = 30_000;

/** İstemci hataları (4xx) yeniden denenmez; ağ ve sunucu hataları bir kez daha denenir. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: STALE_TIME_MS, retry: shouldRetry },
    mutations: { retry: false },
  },
});

/** Uygulama öne geldiğinde bayat veriler yenilenir. Tarayıcıda bunu kitaplık kendisi yapar. */
export function watchAppFocus(): () => void {
  if (Platform.OS === "web") return () => undefined;
  const subscription = AppState.addEventListener("change", (status) => {
    focusManager.setFocused(status === "active");
  });
  return () => {
    subscription.remove();
  };
}

/**
 * Sorgu anahtarlarının tek listesi. Bir veriyi okuyan sorgu ile onu geçersiz kılan
 * mutasyon ve gerçek zamanlı olay aynı anahtarı buradan alır.
 */
export const queryKeys = {
  contacts: ["contacts"],
  contactRequests: ["contact-requests"],
  blocks: ["blocks"],
  user: (userId: string) => ["user", userId],
  users: ["user"],
  conversations: ["conversations"],
  conversation: (conversationId: string) => ["conversation", conversationId],
  conversationDetails: ["conversation"],
  messages: (conversationId: string) => ["messages", conversationId],
  moments: ["moments"],
  miniApps: ["miniapps"],
  miniApp: (miniAppId: string) => ["miniapps", miniAppId],
  businesses: ["businesses"],
  ownedBusinesses: ["businesses", "mine"],
  business: (businessId: string) => ["businesses", businessId],
  payments: ["payments"],
  personalQr: ["qr", "personal"],
  sessions: ["sessions"],
} as const;
