import type { Database } from "./database";
import { sql } from "./database";
import { platformScope } from "./platform-scope";

/** İşletmeler arası bakım yalnızca platform havuzunda ve sınırlı partilerle çalışır. */
export function createTenantMaintenance(platformDb: Database) {
  function purgeCarts() {
    return platformScope(platformDb, async (tx) => {
      const expired =
        await tx.execute(sql`update carts set status='expired',version=version+1 where id in
        (select id from carts where status='open' and expires_at<=now() order by expires_at for update skip locked limit 1000)`);
      const deleted = await tx.execute(sql`delete from carts where id in
        (select id from carts where status='expired' and expires_at<now()-interval '7 days' order by expires_at for update skip locked limit 1000)`);
      return { expired, deleted };
    });
  }
  function purgeBusinessTickets() {
    return platformScope(platformDb, (tx) =>
      tx.execute(sql`delete from business_socket_tickets where id in
      (select id from business_socket_tickets where expires_at<=now() order by expires_at for update skip locked limit 1000)`),
    );
  }
  function purgeDeviceEvents() {
    return platformScope(platformDb, async (tx) => {
      const events = await tx.execute(
        sql`delete from business_live_events where (business_id,cursor) in (select business_id,cursor from business_live_events where created_at<now()-interval '30 days' order by created_at for update skip locked limit 1000)`,
      );
      const pairings = await tx.execute(
        sql`delete from operation_device_pairings where id in (select id from operation_device_pairings where expires_at<=now() order by expires_at for update skip locked limit 1000)`,
      );
      const tickets = await tx.execute(
        sql`delete from operation_device_tickets where id in (select id from operation_device_tickets where expires_at<=now() order by expires_at for update skip locked limit 1000)`,
      );
      return { events, pairings, tickets };
    });
  }
  return { purgeCarts, purgeBusinessTickets, purgeDeviceEvents };
}
