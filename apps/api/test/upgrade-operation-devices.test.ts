import { randomUUID } from "node:crypto";

import pg from "pg";
import { describe, expect, it } from "vitest";

import { migrate } from "../src/core/migrator";
import { createIsolatedDatabase } from "./support/isolated-app";

/** Genel cihaz tablosuna geçmeden önceki yayımlanmış son şema. */
const BEFORE_DEVICES = "0034_ordering_fulfilment_packages.sql";

describe("operasyon cihazlarının eski tablolardan taşınması", () => {
  it("cihazı, onaylanmış eşleştirmeyi ve tüketilmemiş soket biletini korur", async () => {
    const database = await createIsolatedDatabase();
    const admin = new pg.Client({ connectionString: database.adminUrl });
    try {
      await migrate(database.migrateUrl, { through: BEFORE_DEVICES });
      await admin.connect();
      const [business, branch, instance, member, device, pairing, ticket] = Array.from(
        { length: 7 },
        () => randomUUID(),
      );
      // Eski veriyi sınamak için ilişkilerin karşı uçlarını kurmadan satırları taşırız.
      await admin.query("set session_replication_role = replica");
      try {
        await admin.query(
          `insert into kitchen_devices
           (id, business_id, branch_id, app_instance_id, label, token_hash, approved_by)
           values ($1, $2, $3, $4, 'Eski tablet', repeat('a', 64), $5)`,
          [device, business, branch, instance, member],
        );
        await admin.query(
          `insert into kitchen_pairings
           (id, code_hash, poll_hash, status, business_id, device_id)
           values ($1, repeat('b', 64), repeat('c', 64), 'approved', $2, $3)`,
          [pairing, business, device],
        );
        await admin.query(
          `insert into kitchen_socket_tickets (id, business_id, device_id, token_hash)
           values ($1, $2, $3, repeat('d', 64))`,
          [ticket, business, device],
        );
      } finally {
        await admin.query("set session_replication_role = origin");
      }

      expect(await migrate(database.migrateUrl)).toEqual([
        "0035_operation_devices.sql",
        "0036_operation_device_packages.sql",
      ]);
      const restored = await admin.query<{
        kind: string;
        id: string;
        business_id: string;
        device_id: string;
      }>(
        `select 'pairing' as kind,id,business_id,device_id from operation_device_pairings
         union all select 'ticket',id,business_id,device_id from operation_device_tickets
         order by kind`,
      );
      expect(restored.rows).toEqual([
        { kind: "pairing", id: pairing, business_id: business, device_id: device },
        { kind: "ticket", id: ticket, business_id: business, device_id: device },
      ]);
      const retained = await admin.query<{ id: string; label: string; token_hash: string }>(
        "select id,label,token_hash from operation_devices where id=$1",
        [device],
      );
      expect(retained.rows).toEqual([{ id: device, label: "Eski tablet", token_hash: "a".repeat(64) }]);
      const oldObjects = await admin.query<{ name: string }>(
        `select proname as name from pg_proc where proname in
         ('lookup_kitchen_pairing','approve_kitchen_pairing',
          'protect_kitchen_device','protect_kitchen_ticket')`,
      );
      expect(oldObjects.rows).toEqual([]);
      const triggers = await admin.query<{ table_name: string; trigger_name: string }>(
        `select tgrelid::regclass::text as table_name,tgname as trigger_name from pg_trigger
         where tgrelid in ('operation_devices'::regclass,'operation_device_tickets'::regclass)
           and tgname in ('operation_device_check','operation_device_ticket_check')
         order by tgrelid::regclass::text,tgname`,
      );
      expect(triggers.rows).toEqual([
        { table_name: "operation_device_tickets", trigger_name: "operation_device_ticket_check" },
        { table_name: "operation_devices", trigger_name: "operation_device_check" },
      ]);
      const metadata = await admin.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `select relname,relrowsecurity,relforcerowsecurity from pg_class
         where relname in ('operation_devices','operation_device_pairings','operation_device_tickets')
         order by relname`,
      );
      expect(metadata.rows).toEqual(
        ["operation_device_pairings", "operation_device_tickets", "operation_devices"].map(
          (relname) => ({ relname, relrowsecurity: true, relforcerowsecurity: true }),
        ),
      );
      const references = await admin.query<{ name: string; target: string }>(
        `select conname as name,confrelid::regclass::text as target from pg_constraint
         where conname = 'order_history_device_fk'`,
      );
      expect(references.rows).toEqual([
        { name: "order_history_device_fk", target: "operation_devices" },
      ]);
      const restrictions = await admin.query<{ device_statuses: string[] }>(
        `select device_statuses from capability_catalog
         where id='ordering.kitchen' and version='1.0.0'`,
      );
      expect(restrictions.rows).toEqual([
        { device_statuses: ["accepted", "rejected", "preparing", "ready", "completed"] },
      ]);
    } finally {
      await admin.end();
      await database.drop();
    }
  });
});
