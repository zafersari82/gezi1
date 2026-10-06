import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { sql } from "../src/core/database";
import { appendEvent } from "../src/core/outbox-events";
import { createOutboxWorker, type OutboxConsumer } from "../src/core/outbox-worker";
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

async function killAtDelivery(config: {
  eventId: string;
  mode: string;
  branchId: string;
  url: string;
}): Promise<void> {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(new URL("./support/outbox-crash-child.ts", import.meta.url)),
      JSON.stringify({ ...config, database: app.config.databasePlatformUrl }),
    ],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  let errors = "";
  child.stderr?.on("data", (data: Buffer) => {
    errors += data.toString();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Alt süreç bekleme noktasına ulaşmadı: ${errors}`));
      }, 10_000);
      child.once("message", () => {
        clearTimeout(timer);
        resolve();
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error(`Alt süreç erken kapandı: ${errors}`));
      });
    });
    const ended = once(child, "exit");
    expect(child.kill("SIGKILL")).toBe(true);
    expect((await ended)[1]).toBe("SIGKILL");
  } finally {
    child.kill("SIGKILL");
  }
  await platformScope(app.platformDb, (tx) =>
    tx.execute(
      sql`update outbox_events set locked_until = now() - interval '1 second' where id = ${config.eventId}`,
    ),
  );
}

describe("Gerçek dağıtıcı süreci öldürülüp başka süreçte devralınır", () => {
  for (const mode of ["before_internal", "after_internal"]) {
    test(`iç teslimde ${mode} ölümü sonrası etki bir kezdir`, async () => {
      const f = await createTenantFixture(app);
      const id = await withTenant(app.db, f.scope, (tx) =>
        appendEvent(tx, f.scope, {
          aggregateId: f.branchId,
          sequence: 1,
          type: "test.crash",
          payload: {},
        }),
      );
      await killAtDelivery({ eventId: id, mode, branchId: f.branchId, url: "http://127.0.0.1" });
      const consumers: OutboxConsumer[] = [
        {
          name: "test.kill.internal",
          kind: "internal",
          types: ["test.crash"],
          async deliver(tx) {
            await tx.execute(
              sql`update branches set address = address || 'x' where id = ${f.branchId}`,
            );
          },
        },
        {
          name: "test.kill.marker",
          kind: "external",
          types: ["test.crash"],
          deliver: () => Promise.resolve(),
        },
      ];
      await createOutboxWorker({
        platformDb: app.platformDb,
        log: app.server.log,
        consumers,
      }).drain({ eventIds: [id] });
      expect(
        await scoped(app.db, f.businessId, (tx) =>
          tx.one(sql`select address from branches where id = ${f.branchId}`),
        ),
      ).toMatchObject({ address: "x" });
      expect(
        await scoped(app.db, f.businessId, (tx) =>
          tx.many(
            sql`select * from event_deliveries where event_id = ${id} and consumer = 'test.kill.internal'`,
          ),
        ),
      ).toHaveLength(1);
    }, 15_000);
  }

  for (const mode of ["before_external", "after_external"]) {
    test(`dış teslimde ${mode} ölümü sonrası aynı kimlikle en az bir gönderim olur`, async () => {
      const received: string[] = [];
      const server = createServer((request, response) => {
        let body = "";
        request.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        request.on("end", () => {
          received.push(body);
          response.end("ok");
        });
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Yerel alıcı açılamadı");
      const url = `http://127.0.0.1:${address.port}`;
      try {
        const f = await createTenantFixture(app);
        const id = await withTenant(app.db, f.scope, (tx) =>
          appendEvent(tx, f.scope, {
            aggregateId: f.branchId,
            sequence: 1,
            type: "test.crash",
            payload: {},
          }),
        );
        await killAtDelivery({ eventId: id, mode, branchId: f.branchId, url });
        expect(received).toHaveLength(mode === "before_external" ? 0 : 1);
        const consumers: OutboxConsumer[] = [
          {
            name: "test.kill.external",
            kind: "external",
            types: ["test.crash"],
            async deliver(event) {
              const response = await fetch(url, { method: "POST", body: event.id });
              expect(response.ok).toBe(true);
            },
          },
        ];
        await createOutboxWorker({
          platformDb: app.platformDb,
          log: app.server.log,
          consumers,
        }).drain({ eventIds: [id] });
        expect(received).toEqual(
          Array.from({ length: mode === "before_external" ? 1 : 2 }, () => id),
        );
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          }),
        );
      }
    }, 15_000);
  }
});
