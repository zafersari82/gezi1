import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { appendEvent, appendPlatformEvent } from "../src/core/outbox-events";
import { createOutboxWorker } from "../src/core/outbox-worker";
import { platformScope } from "../src/core/platform-scope";
import { withTenant } from "../src/core/tenant-scope";
import { startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});

describe("Olay kirası ve etkisiz tüketici", () => {
  test("iki dağıtıcı aynı iç etkiyi bir kez uygular; sipariş sırası korunur", async () => {
    const f = await createTenantFixture(app);
    const ids = await withTenant(app.db, f.scope, async (tx) => {
      const result: string[] = [];
      for (const sequence of [1, 2, 3])
        result.push(
          await appendEvent(tx, f.scope, {
            aggregateId: f.branchId,
            sequence,
            type: "branch.changed",
            payload: { sequence },
          }),
        );
      return result;
    });
    const seen: number[] = [];
    const worker = () =>
      createOutboxWorker({
        platformDb: app.platformDb,
        log: app.server.log,
        consumers: [
          {
            name: "test.branch",
            kind: "internal",
            types: ["branch.changed"],
            async deliver(tx, event) {
              seen.push(event.sequence ?? 0);
              await tx.execute(
                sql`update branches set address = address || 'x' where id = ${f.branchId}`,
              );
            },
          },
        ],
      });
    await Promise.all([worker().drain({ eventIds: ids }), worker().drain({ eventIds: ids })]);
    expect(seen).toEqual([1, 2, 3]);
    expect(
      await scoped(app.db, f.businessId, (tx) =>
        tx.one(sql`select address from branches where id = ${f.branchId}`),
      ),
    ).toMatchObject({ address: "xxx" });
    await worker().drain({ eventIds: ids });
    expect(seen).toHaveLength(3);
    expect(
      await scoped(app.db, f.businessId, (tx) =>
        tx.many(sql`select * from event_deliveries where event_id = any(${ids}::uuid[])`),
      ),
    ).toHaveLength(3);
  });

  test("dış çağrı sırasında SQL kilidi yoktur; hata tekrar ve ölü kayda dönüşür", async () => {
    const id = await app.db.transaction((tx) =>
      appendPlatformEvent(tx, { type: "test.external", payload: {} }),
    );
    let calls = 0;
    const worker = createOutboxWorker({
      platformDb: app.platformDb,
      log: app.server.log,
      maxAttempts: 2,
      retryBaseMs: 0,
      consumers: [
        {
          name: "test.external",
          kind: "external",
          types: ["test.external"],
          async deliver(event) {
            calls++;
            await platformScope(app.platformDb, async (tx) => {
              await tx.execute(sql`set local lock_timeout = '200ms'`);
              await tx.one(
                sql`select id from platform_outbox_events where id = ${event.id} for update`,
              );
            });
            throw new Error("Yerel sağlayıcı geçici olarak kapalı");
          },
        },
      ],
    });
    await worker.drain({ eventIds: [id] });
    expect(calls).toBe(2);
    expect(
      await platformScope(app.platformDb, (tx) =>
        tx.one(sql`select status, attempts from platform_outbox_events where id = ${id}`),
      ),
    ).toMatchObject({ status: "dead", attempts: 2 });
  });

  test.each(["internal", "external"] as const)(
    "eski teslim kaydı %s etkiyi atlar ve teslim edilmiş içerik değişmez",
    async (kind) => {
      const f = await createTenantFixture(app);
      const id = await withTenant(app.db, f.scope, (tx) =>
        appendEvent(tx, f.scope, {
          aggregateId: randomUUID(),
          sequence: 1,
          type: "test.internal",
          payload: {},
        }),
      );
      await scoped(app.db, f.businessId, (tx) =>
        tx.execute(
          sql`insert into event_deliveries(business_id, event_id, consumer) values (${f.businessId}, ${id}, 'test.internal')`,
        ),
      );
      let calls = 0;
      const worker = createOutboxWorker({
        platformDb: app.platformDb,
        log: app.server.log,
        consumers: [
          {
            name: "test.internal",
            kind,
            types: ["test.internal"],
            deliver: () => {
              calls++;
              return Promise.resolve();
            },
          },
        ],
      });
      await worker.drain({ eventIds: [id] });
      expect(calls).toBe(0);
      await expect(
        scoped(app.db, f.businessId, (tx) =>
          tx.execute(
            sql`update outbox_events set payload = '{"changed":true}'::jsonb where id = ${id}`,
          ),
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        scoped(app.db, f.businessId, (tx) =>
          tx.execute(sql`delete from event_deliveries where event_id = ${id}`),
        ),
      ).rejects.toMatchObject({ code: "23514" });
    },
  );
});
