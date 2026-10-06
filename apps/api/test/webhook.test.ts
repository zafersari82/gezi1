import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";

import { expect, test } from "vitest";

import type { OutboxEvent } from "../src/core/outbox-worker";
import { createSignedWebhookConsumer } from "../src/providers/webhook";

test("webhook kimlik, zaman ve tam gövdeyi HMAC ile imzalar; başka işletmeyi göndermez", async () => {
  const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      received.push({ headers: request.headers, body });
      response.end("ok");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Yerel webhook açılamadı");
  try {
    const businessId = randomUUID();
    const consumer = createSignedWebhookConsumer({
      id: "test.webhook",
      businessId,
      url: `http://127.0.0.1:${address.port}`,
      secret: "sinama-imzasi",
      types: ["order.placed"],
      allowLocalHttp: true,
    });
    const event: OutboxEvent = {
      id: randomUUID(),
      businessId,
      aggregateId: randomUUID(),
      orderId: randomUUID(),
      sequence: 1,
      type: "order.placed",
      payload: { totalMinor: 12500 },
      attempts: 1,
      lockId: randomUUID(),
    };
    await consumer.deliver(event);
    await consumer.deliver({ ...event, businessId: randomUUID() });
    expect(received).toHaveLength(1);
    const call = received[0];
    if (call === undefined) throw new Error("İstek gelmedi");
    expect(call.headers["vado-event-id"]).toBe(event.id);
    expect(call.headers["vado-signature"]).toBe(
      `sha256=${createHmac("sha256", "sinama-imzasi")
        .update(`${String(call.headers["vado-timestamp"])}.${call.body}`)
        .digest("hex")}`,
    );
    expect(JSON.parse(call.body) as unknown).toMatchObject({
      id: event.id,
      type: event.type,
      sequence: 1,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
  }
});
