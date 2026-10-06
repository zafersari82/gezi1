import { z } from "zod";

import { createDatabase, sql } from "../../src/core/database";
import { createOutboxWorker, type OutboxConsumer } from "../../src/core/outbox-worker";

const config = z
  .object({
    database: z.string(),
    eventId: z.uuid(),
    mode: z.enum(["before_internal", "after_internal", "before_external", "after_external"]),
    branchId: z.uuid(),
    url: z.string(),
  })
  .parse(JSON.parse(process.argv[2] ?? "{}") as unknown);
const db = createDatabase(config.database, 2);
function hold(): Promise<void> {
  process.send?.("held");
  return new Promise(() => undefined);
}
const consumers: OutboxConsumer[] = config.mode.endsWith("internal")
  ? [
      {
        name: "test.kill.internal",
        kind: "internal",
        types: ["test.crash"],
        async deliver(tx) {
          await tx.execute(
            sql`update branches set address = address || 'x' where id = ${config.branchId}`,
          );
          if (config.mode === "before_internal") await hold();
        },
      },
      { name: "test.kill.marker", kind: "external", types: ["test.crash"], deliver: hold },
    ]
  : [
      {
        name: "test.kill.external",
        kind: "external",
        types: ["test.crash"],
        async deliver(event) {
          if (config.mode === "before_external") await hold();
          const response = await fetch(config.url, { method: "POST", body: event.id });
          if (!response.ok) throw new Error("Yerel alıcı isteği reddetti");
          await hold();
        },
      },
    ];
const worker = createOutboxWorker({
  platformDb: db,
  consumers,
  leaseMs: 500,
  log: { info: () => undefined, warn: () => undefined, error: () => undefined },
});
await worker.drain({ eventIds: [config.eventId] });
await db.close();
process.disconnect();
