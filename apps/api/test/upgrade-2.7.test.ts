import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createDatabase, type Database, sql } from "../src/core/database";
import { migrate } from "../src/core/migrator";
import { randomPhone } from "./support/harness";
import { createIsolatedDatabase } from "./support/isolated-app";

/** 2.7.0 sürümünün son şema dosyası. */
const RELEASE_2_7 = "0017_live_replay.sql";

async function insertUser(db: Database, name: string): Promise<string> {
  const row = await db.one<{ id: string }>(sql`
    insert into users (phone, display_name, terms_version, terms_accepted_at)
    values (${randomPhone()}, ${name}, 'test', now())
    returning id
  `);
  return row.id;
}

describe("2.7.0 veritabanından 2.8'e geçiş", () => {
  it("2.7'de siparişleri yürüten personel geçişten sonra da yürütür; pasif personele izin verilmez", async () => {
    const database = await createIsolatedDatabase();
    const db = createDatabase(database.migrateUrl, 2);
    try {
      await migrate(database.migrateUrl, { through: RELEASE_2_7 });
      const ownerId = await insertUser(db, "Sahip");
      const waiterId = await insertUser(db, "Garson");
      const formerId = await insertUser(db, "Eski garson");
      const business = await db.one<{ id: string }>(sql`
        insert into businesses (owner_id, name, slug, category, city, verified, status)
        values (${ownerId}, 'Geçiş Lokantası', ${`gecis-${randomUUID()}`}, 'food', 'İzmir', true, 'active')
        returning id
      `);
      const branch = await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('vado.business_id', ${business.id}, true)`);
        // Sahip üyeliğini işletme kaydı kendisi açar.
        await tx.execute(sql`
          insert into business_members (business_id, user_id, role, active) values
            (${business.id}, ${waiterId}, 'staff', true),
            (${business.id}, ${formerId}, 'staff', false)
        `);
        return tx.one<{ id: string }>(sql`
          insert into branches (business_id, name, address)
          values (${business.id}, 'Alsancak', 'Kıbrıs Şehitleri Cad. No: 10, Konak/İzmir')
          returning id
        `);
      });

      const applied = await migrate(database.migrateUrl);
      expect(applied[0]).toBe("0018_location.sql");

      const after = await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('vado.business_id', ${business.id}, true)`);
        const grants = await tx.many<{ user_id: string; permission: string; scoped: boolean }>(sql`
          select m.user_id, g.permission, (g.region_id is not null or g.branch_id is not null) as scoped
          from business_member_grants g
          join business_members m on m.business_id = g.business_id and m.id = g.member_id
          order by m.user_id, g.permission
        `);
        const can = await tx.one<{ waiter: boolean; former: boolean }>(sql`
          select
            business_member_can(${business.id}, ${waiterId}, 'orders.manage', ${branch.id}) as waiter,
            business_member_can(${business.id}, ${formerId}, 'orders.view', ${branch.id}) as former
        `);
        const kept = await tx.one<{ address: string; province_id: string | null }>(sql`
          select address, province_id from branches where id = ${branch.id}
        `);
        return { grants, can, kept };
      });

      expect(after.grants).toEqual(
        ["orders.manage", "orders.view", "tables.serve"].map((permission) => ({
          user_id: waiterId,
          permission,
          scoped: false,
        })),
      );
      expect(after.can).toEqual({ waiter: true, former: false });
      // Serbest adres metni korunur; il/ilçe tahmin edilmez.
      expect(after.kept).toEqual({
        address: "Kıbrıs Şehitleri Cad. No: 10, Konak/İzmir",
        province_id: null,
      });
    } finally {
      await db.close();
      await database.drop();
    }
  });
});
