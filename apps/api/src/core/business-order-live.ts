import { businessOrderEventSchema } from "@vado/contracts";

import type { RealtimePublisher } from "../realtime/realtime";
import { type Database, sql } from "./database";
import type { OutboxConsumer } from "./outbox-worker";
import { platformScope } from "./platform-scope";

export function createBusinessOrderConsumer(
  platformDb: Database,
  realtime: RealtimePublisher,
): OutboxConsumer {
  return {
    name: "business.orders.live",
    kind: "external",
    types: ["order.placed", "order.status_changed"],
    async deliver(event) {
      const payload = businessOrderEventSchema.parse({
        eventId: event.id,
        businessId: event.businessId,
        orderId: event.orderId,
        sequence: event.sequence,
        type: event.type,
      });
      const members = await platformScope(platformDb, (tx) =>
        tx.many<{ user_id: string }>(sql`
        select m.user_id from business_members m join users u on u.id=m.user_id
        where m.business_id=${payload.businessId} and m.active and u.status='active'`),
      );
      realtime.emitBusiness(
        payload.businessId,
        members.map((m) => m.user_id),
        payload,
      );
    },
  };
}
