import { createHmac } from "node:crypto";

import { z } from "zod";

import type { OutboxConsumer } from "../core/outbox-worker";

const webhookSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9._-]{1,79}$/),
  businessId: z.uuid(),
  url: z.url(),
  secret: z.string().min(12),
  types: z.array(z.string()).min(1),
  allowLocalHttp: z.boolean().default(false),
});

/** Sunucu sahibinin açıkça kurduğu dış alıcı; veri imzalanır, alıcının kodu VADO'da çalışmaz. */
export function createSignedWebhookConsumer(
  input: z.input<typeof webhookSchema>,
): Extract<OutboxConsumer, { kind: "external" }> {
  const config = webhookSchema.parse(input);
  const url = new URL(config.url);
  const local =
    config.allowLocalHttp &&
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username !== "" || url.password !== "" || (url.protocol !== "https:" && !local))
    throw new Error("Webhook adresi HTTPS olmalıdır");
  return {
    name: config.id,
    kind: "external",
    types: config.types,
    async deliver(event) {
      if (event.businessId !== config.businessId) return;
      const body = JSON.stringify({
        id: event.id,
        businessId: event.businessId,
        aggregateId: event.aggregateId,
        orderId: event.orderId,
        sequence: event.sequence,
        type: event.type,
        payload: event.payload,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac("sha256", config.secret)
        .update(`${timestamp}.${body}`)
        .digest("hex");
      const response = await fetch(config.url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        body,
        headers: {
          "content-type": "application/json",
          "vado-event-id": event.id,
          "vado-timestamp": timestamp,
          "vado-signature": `sha256=${signature}`,
        },
      });
      if (!response.ok) throw new Error("Webhook alıcısı teslimi kabul etmedi");
    },
  };
}
