import { afterAll, beforeAll, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

test("rolü değişen veya kaldırılan üyenin önce verilmiş kapsamı motoru açamaz", async () => {
  const f = await createTenantFixture(app);
  const member = await createUser(app, "Yönetici");
  await app.services.businessManagement.setMember(f.scope, {
    userId: member.id,
    role: "manager",
    active: true,
  });
  const scope = await app.services.businessManagement.authorise(member.id, f.businessId);
  await app.services.businessManagement.setMember(f.scope, {
    userId: member.id,
    role: "staff",
    active: true,
  });
  await expect(app.services.catalog.get(scope)).rejects.toMatchObject({ code: "forbidden" });
  const staffScope = await app.services.businessManagement.authorise(member.id, f.businessId);
  await app.services.businessManagement.setMember(f.scope, {
    userId: member.id,
    role: "staff",
    active: false,
  });
  await expect(app.services.capabilities.get(staffScope, f.instanceId)).rejects.toMatchObject({
    code: "forbidden",
  });
});

test("silinen işletme hesabının kapsamı erişemez; SQL üyeliği yeniden etkinleştiremez", async () => {
  const f = await createTenantFixture(app);
  const member = await createUser(app, "Çalışan");
  await app.services.businessManagement.setMember(f.scope, {
    userId: member.id,
    role: "staff",
    active: true,
  });
  const scope = await app.services.businessManagement.authorise(member.id, f.businessId);
  await app.services.users.deleteMe(member.id);
  await expect(app.services.catalog.get(scope)).rejects.toMatchObject({ code: "unauthorized" });
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(sql`update business_members set active=true where user_id=${member.id}`),
    ),
  ).rejects.toMatchObject({ code: "23514" });
});
