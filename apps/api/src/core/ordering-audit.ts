import { recordAudit } from "./audit";
import type { OutboxConsumer } from "./outbox-worker";

export const orderingAuditConsumer: OutboxConsumer = {
  name: "ordering.audit",
  kind: "internal",
  types: ["order.placed", "order.status_changed"],
  deliver: async (tx, event) => {
    if (event.businessId === null || event.orderId === null)
      throw new Error("Sipariş olayının bağlamı eksik");
    await recordAudit(tx, {
      actor: "ordering",
      action: event.type,
      targetType: "order",
      targetId: event.orderId,
      metadata: { eventId: event.id, businessId: event.businessId, sequence: event.sequence },
    });
  },
};
