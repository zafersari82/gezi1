import { randomUUID } from "node:crypto";

import { type Database, sql } from "./database";
import { type TenantScope, withTenant } from "./tenant-scope";

export interface EventContent {
  type: string;
  payload: Record<string, unknown>;
}

/** İş kaydıyla aynı SQL işlemine eklenir; dağıtım ancak işlem kapandıktan sonra başlar. */
export function appendEvent(
  tx: Database,
  scope: TenantScope,
  event: EventContent & { aggregateId: string; orderId?: string; sequence: number },
): Promise<string> {
  return withTenant(tx, scope, async (scoped) => {
    const id = randomUUID();
    await scoped.execute(sql`
      insert into outbox_events(id, business_id, aggregate_id, order_id, sequence, type, payload)
      values (${id}, ${scope.businessId}, ${event.aggregateId}, ${event.orderId ?? null},
        ${event.sequence}, ${event.type}, ${JSON.stringify(event.payload)}::jsonb)
    `);
    return id;
  });
}

/** Genel sohbet ve giriş verisi işletme kapsamına karıştırılmaz. Motorlarda kullanımı yasaktır. */
export async function appendPlatformEvent(tx: Database, event: EventContent): Promise<string> {
  const id = randomUUID();
  await tx.execute(sql`insert into platform_outbox_events(id, type, payload)
    values (${id}, ${event.type}, ${JSON.stringify(event.payload)}::jsonb)`);
  return id;
}
