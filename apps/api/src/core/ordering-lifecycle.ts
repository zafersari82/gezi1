import type { Database } from "./database";
/** İşlem kancaları HTTP, sektör veya sağlayıcı türü taşımaz; tüketici aynı işlemde kendi kaydını yazar. */
export interface OrderingLifecycleEvent {
  businessId: string;
  orderId: string;
  userId: string | null;
}
export type OrderingLifecycleStage = "reserve" | "complete" | "cancel" | "refund";
export type OrderingLifecycleHook = (tx: Database, event: OrderingLifecycleEvent) => Promise<void>;
export type OrderingLifecycleHooks = Partial<Record<OrderingLifecycleStage, OrderingLifecycleHook>>;
export function createOrderingLifecycle() {
  const hooks = new Map<string, OrderingLifecycleHooks>();
  function register(id: string, handlers: OrderingLifecycleHooks) {
    if (hooks.has(id)) throw new Error("Sipariş kancası kimliği tekil olmalıdır");
    hooks.set(id, handlers);
    return () => {
      hooks.delete(id);
    };
  }
  async function run(stage: OrderingLifecycleStage, tx: Database, event: OrderingLifecycleEvent) {
    for (const handlers of hooks.values()) await handlers[stage]?.(tx, event);
  }
  return { register, run };
}
export type OrderingLifecycle = ReturnType<typeof createOrderingLifecycle>;
