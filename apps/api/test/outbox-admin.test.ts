import { randomUUID } from "node:crypto";

import { deadEventSchema, listOf } from "@vado/contracts";
import { afterAll, beforeAll, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { appendPlatformEvent } from "../src/core/outbox-events";
import { platformScope } from "../src/core/platform-scope";
import { asAdmin, startTestApp, type TestApp } from "./support/harness";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

test("ölü olay panelde içeriği gizli görünür; yetkili tekrar deneme denetime yazılır", async () => {
  const id = await app.db.transaction((tx) =>
    appendPlatformEvent(tx, { type: "test.dead", payload: { private: randomUUID() } }),
  );
  await platformScope(app.platformDb, (tx) =>
    tx.execute(
      sql`update platform_outbox_events set status = 'dead', attempts = 8 where id = ${id}`,
    ),
  );
  const list = await asAdmin(app, "operator").request("GET", "/v1/admin/events/dead");
  expect(list.status).toBe(200);
  expect(JSON.stringify(list.body)).not.toContain("private");
  const parsed = listOf(deadEventSchema).parse(list.body);
  expect(parsed.items.find((event) => event.id === id)).toMatchObject({
    id,
    queue: "platform",
    attempts: 8,
  });
  await asAdmin(app, "business").fail("forbidden", "GET", "/v1/admin/events/dead");
  await asAdmin(app, "auditor").fail("forbidden", "POST", `/v1/admin/events/platform/${id}/retry`);
  await asAdmin(app, "operator").done("POST", `/v1/admin/events/platform/${id}/retry`);
  expect(
    await platformScope(app.platformDb, (tx) =>
      tx.one(sql`select status, attempts from platform_outbox_events where id = ${id}`),
    ),
  ).toMatchObject({ status: "pending", attempts: 0 });
  expect(
    await app.db.many(
      sql`select * from audit_log where target_id = ${id} and action = 'event.retried'`,
    ),
  ).toHaveLength(1);
});
