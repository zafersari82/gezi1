import { randomUUID } from "node:crypto";

import pg from "pg";
import { describe, expect, it } from "vitest";

import { migrate } from "../src/core/migrator";
import { createIsolatedDatabase } from "./support/isolated-app";

/** Sipariş kataloğundan (A2-2a) önceki son şema dosyası. */
const BEFORE_CONTEXT = "0032_ordering_packages.sql";

describe("masa oturumu sütunundan genel sipariş bağlamına geçiş", () => {
  it("eski masa bağları bağlam olur; satır güvenliği ve tetikleyiciler geri açılır", async () => {
    const database = await createIsolatedDatabase();
    const admin = new pg.Client({ connectionString: database.adminUrl });
    try {
      await migrate(database.migrateUrl, { through: BEFORE_CONTEXT });
      await admin.connect();
      // Eski sürümden kalmış kayıtlar: tam bir masa siparişini yeniden kurmak yerine yalnız taşınan
      // sütunlar doldurulur; bu yüzden tetikleyiciler ve yabancı anahtarlar bu oturumda kapalıdır.
      await admin.query("set session_replication_role = replica");
      const [business, branch, instance, customer, session] = Array.from({ length: 5 }, () =>
        randomUUID(),
      );
      const dineCart = randomUUID();
      const pickupCart = randomUUID();
      const order = randomUUID();
      await admin.query(
        `insert into carts (id, business_id, branch_id, app_instance_id, business_customer_id,
           fulfilment, table_session_id)
         values ($1, $3, $4, $5, $6, 'dine_in', $7), ($2, $3, $4, $5, $8, 'pickup', null)`,
        [dineCart, pickupCart, business, branch, instance, customer, session, randomUUID()],
      );
      await admin.query(
        `insert into orders (id, business_id, cart_id, branch_id, app_instance_id,
           business_customer_id, fulfilment, total_minor, vat_minor, table_session_id)
         values ($1, $2, $3, $4, $5, $6, 'dine_in', 0, 0, $7)`,
        [order, business, dineCart, branch, instance, customer, session],
      );
      await admin.query(
        `insert into business_live_events (business_id, cursor, event_id, branch_id,
           app_instance_id, type, table_session_id, order_id)
         values ($1, 1, $2, $3, $4, 'order.placed', $5, $6)`,
        [business, randomUUID(), branch, instance, session, order],
      );
      await admin.query("set session_replication_role = origin");

      const applied = await migrate(database.migrateUrl);
      expect(applied[0]).toBe("0033_ordering_fulfilment.sql");

      const carts = await admin.query<{
        id: string;
        context_kind: string | null;
        context_id: string | null;
      }>("select id, context_kind, context_id from carts order by fulfilment");
      expect(carts.rows).toEqual([
        { id: dineCart, context_kind: "table_session", context_id: session },
        { id: pickupCart, context_kind: null, context_id: null },
      ]);
      const migrated = await admin.query<{
        source: string;
        context_kind: string;
        context_id: string;
      }>(
        `select 'order' as source, context_kind, context_id from orders
         union all select 'live', context_kind, context_id from business_live_events
         order by source`,
      );
      expect(migrated.rows).toEqual([
        { source: "live", context_kind: "table_session", context_id: session },
        { source: "order", context_kind: "table_session", context_id: session },
      ]);
      const guarded = await admin.query<{ relname: string; forced: boolean; disabled: string }>(
        `select c.relname, c.relforcerowsecurity as forced,
           count(t.oid) filter (where not t.tgisinternal and t.tgenabled <> 'O')::text as disabled
         from pg_class c left join pg_trigger t on t.tgrelid = c.oid
         where c.relname in ('carts', 'orders', 'business_live_events')
         group by c.relname, c.relforcerowsecurity order by c.relname`,
      );
      expect(guarded.rows).toEqual(
        ["business_live_events", "carts", "orders"].map((relname) => ({
          relname,
          forced: true,
          disabled: "0",
        })),
      );
    } finally {
      await admin.end();
      await database.drop();
    }
  });
});
