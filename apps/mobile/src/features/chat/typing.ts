import { TYPING_VISIBLE_MS } from "@vado/contracts";

import { createStore, useStore } from "@/lib/store";

/** Sohbet kimliği → şu anda yazmakta olan kullanıcıların kimlikleri. */
const store = createStore<Record<string, string[]>>({});
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function stopTyping(conversationId: string, userId: string): void {
  timers.delete(`${conversationId}:${userId}`);
  store.set((state) => ({
    ...state,
    [conversationId]: (state[conversationId] ?? []).filter((id) => id !== userId),
  }));
}

/** "Yazıyor" bildirimi geldiğinde çağrılır; yeni bildirim gelmezse gösterge kendiliğinden kalkar. */
export function markTyping(conversationId: string, userId: string): void {
  const key = `${conversationId}:${userId}`;
  const previous = timers.get(key);
  if (previous !== undefined) clearTimeout(previous);
  timers.set(
    key,
    setTimeout(() => {
      stopTyping(conversationId, userId);
    }, TYPING_VISIBLE_MS),
  );

  store.set((state) => {
    const current = state[conversationId] ?? [];
    return current.includes(userId) ? state : { ...state, [conversationId]: [...current, userId] };
  });
}

/** Kullanıcının mesajı ulaştığında gösterge beklemeden kaldırılır. */
export function clearTyping(conversationId: string, userId: string): void {
  const timer = timers.get(`${conversationId}:${userId}`);
  if (timer === undefined) return;
  clearTimeout(timer);
  stopTyping(conversationId, userId);
}

const NOBODY: string[] = [];

export function useTypingUserIds(conversationId: string): string[] {
  return useStore(store)[conversationId] ?? NOBODY;
}
