import type { DeadEvent } from "@vado/contracts";

import { recordAudit } from "./audit";
import type { AppContext } from "./context";
import { sql } from "./database";
import { AppError } from "./errors";
import { platformScope } from "./platform-scope";

export function createOutboxAdmin({ platformDb }: AppContext) {
  function listDeadEvents(): Promise<DeadEvent[]> {
    return platformScope(platformDb, async (tx) => {
      const rows = await tx.many<{
        id: string;
        queue: "tenant" | "platform";
        business_id: string | null;
        type: string;
        attempts: number;
        created_at: Date;
        last_error: string | null;
      }>(sql`
        select id, 'tenant' as queue, business_id, type, attempts, created_at, last_error from outbox_events where status = 'dead'
        union all select id, 'platform' as queue, null::uuid as business_id, type, attempts, created_at, last_error from platform_outbox_events where status = 'dead'
        order by created_at desc limit 200
      `);
      return rows.map((row) => ({
        id: row.id,
        queue: row.queue,
        businessId: row.business_id,
        type: row.type,
        attempts: row.attempts,
        createdAt: row.created_at.toISOString(),
        lastError: row.last_error,
      }));
    });
  }
  function retryEvent(actor: string, queue: "tenant" | "platform", id: string): Promise<void> {
    return platformScope(platformDb, async (tx) => {
      const table = queue === "tenant" ? sql`outbox_events` : sql`platform_outbox_events`;
      const changed = await tx.execute(sql`update ${table} set status = 'pending', attempts = 0,
        next_attempt_at = now(), last_error = null where id = ${id} and status = 'dead'`);
      if (changed === 0) throw new AppError("not_found");
      await recordAudit(tx, {
        actor,
        action: "event.retried",
        targetType: "event",
        targetId: id,
        metadata: { queue },
      });
    });
  }
  return { listDeadEvents, retryEvent };
}
