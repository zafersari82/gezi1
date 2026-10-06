import { type LiveEvent, liveEventSchema, type LiveReplay } from "@vado/contracts";

import type { TenantContext } from "./context";
import { type Database, sql } from "./database";
import { type TenantScope, withTenant } from "./tenant-scope";

export const LIVE_EVENT_TYPES = [
  "order.placed",
  "order.status_changed",
  "order.payment_recorded",
  "table.requested",
  "table.request_resolved",
] as const;
export interface LiveRow {
  business_id: string;
  branch_id: string;
  app_instance_id: string;
  business_customer_id: string | null;
  cursor: number;
  event_id: string;
  order_id: string | null;
  table_session_id: string | null;
  type: string;
}
export const liveView = (r: LiveRow): LiveEvent =>
  liveEventSchema.parse({
    businessId: r.business_id,
    branchId: r.branch_id,
    appInstanceId: r.app_instance_id,
    cursor: r.cursor,
    eventId: r.event_id,
    orderId: r.order_id,
    tableSessionId: r.table_session_id,
    type: r.type,
  });
export async function readLive(tx: Database, businessId: string, eventId: string) {
  return tx.maybeOne<LiveRow>(
    sql`select * from business_live_events where business_id=${businessId} and event_id=${eventId}`,
  );
}
export function createLiveReplayService({ db }: TenantContext) {
  function replay(scope: TenantScope, cursor: number): Promise<LiveReplay> {
    return withTenant(db, scope, async (tx) => {
      const offset = await tx.maybeOne<{ value: number }>(
        sql`select value from business_live_offsets where business_id=${scope.businessId}`,
      );
      const latest = offset?.value ?? 0;
      const retained = await tx.one<{ first: number | null }>(
        sql`select min(cursor)::bigint as first from business_live_events where business_id=${scope.businessId}`,
      );
      const reset =
        cursor > latest || (cursor !== 0 && cursor < (retained.first ?? latest + 1) - 1);
      const after = reset ? 0 : cursor;
      const filter =
        scope.role === "customer"
          ? sql`and business_customer_id=${scope.businessCustomerId} and app_instance_id=${scope.appInstanceId}`
          : scope.role === "kitchen"
            ? sql`and branch_id=${scope.branchId} and app_instance_id=${scope.appInstanceId} and order_id is not null`
            : sql.empty;
      const rows = await tx.many<LiveRow>(
        sql`select * from business_live_events where business_id=${scope.businessId} and cursor>${after} and cursor<=${latest} ${filter} order by cursor limit 500`,
      );
      return {
        items: rows.map(liveView),
        cursor: rows.length === 500 ? (rows.at(-1)?.cursor ?? latest) : latest,
        reset,
      };
    });
  }
  return { replay };
}
