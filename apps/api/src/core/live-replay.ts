import { type LiveEvent, liveEventSchema, type LiveReplay } from "@vado/contracts";

import { permittedBranch } from "./business-access";
import type { TenantContext } from "./context";
import { type Database, sql } from "./database";
import { type TenantScope, withTenant } from "./tenant-scope";

/** Canlı olay türleri sözleşmedeki kayıttır; veritabanında `live_event_types` tablosudur. */
export const LIVE_EVENT_TYPES = liveEventSchema.shape.type.options;
export interface LiveRow {
  business_id: string;
  branch_id: string;
  app_instance_id: string;
  business_customer_id: string | null;
  cursor: number;
  event_id: string;
  order_id: string | null;
  context_kind: string | null;
  context_id: string | null;
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
    context:
      r.context_kind === null || r.context_id === null
        ? null
        : { kind: r.context_kind, id: r.context_id },
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
      const branch = sql`business_live_events.branch_id`;
      const filter =
        scope.role === "customer"
          ? sql`and business_customer_id=${scope.businessCustomerId} and app_instance_id=${scope.appInstanceId}`
          : scope.role === "device"
            ? sql`and branch_id=${scope.branchId} and app_instance_id=${scope.appInstanceId} and order_id is not null`
            : scope.role === "staff"
              ? sql`and ((order_id is not null ${permittedBranch(scope, "orders.view", branch)})
                  or (order_id is null ${permittedBranch(scope, "tables.serve", branch)}))`
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
