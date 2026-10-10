import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import {
  businessSocketTicketSchema,
  courierJobSchema,
  courierLiveReplaySchema,
  courierMemberSchema,
} from "@vado/contracts";
import { io, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { checkoutDelivery } from "./support/delivery-fixture";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
let app: TestApp;
let url: string;
const sockets: Socket[] = [];
beforeAll(async () => {
  app = await startTestApp();
  await app.server.listen({ host: "127.0.0.1", port: 0 });
  url = `http://127.0.0.1:${(app.server.server.address() as AddressInfo).port}`;
});
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});
afterAll(() => app.stop());
function connect(auth: Record<string, string>) {
  const socket = io(url, { auth, transports: ["websocket"], reconnection: false });
  sockets.push(socket);
  return new Promise<Socket>((resolve, reject) => {
    socket.once("connect", () => {
      resolve(socket);
    });
    socket.once("connect_error", reject);
  });
}
function next(socket: Socket, event: string) {
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${event} gelmedi`));
    }, 3000);
    socket.once(event, (data: unknown) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
it("kurye soketi tek biletle açılır; eski atama olayı ve diğer Business kanalları sızmaz", async () => {
  const f = await checkoutDelivery(app),
    courier = await createUser(app, "Soket kuryesi"),
    other = await createUser(app, "Yeni kurye"),
    owner = as(app, f.owner),
    client = as(app, courier);
  const member = await owner.ok(
    courierMemberSchema,
    "POST",
    `/v1/business/${f.businessId}/couriers`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { userId: courier.id, expectedVersion: 0, active: true },
    },
  );
  const ticket = await client.ok(
    businessSocketTicketSchema,
    "POST",
    `/v1/courier/${f.businessId}/socket-ticket`,
    { body: {} },
  );
  const outcomes = await Promise.allSettled(
    Array.from({ length: 12 }, () => connect({ courierTicket: ticket.ticket })),
  );
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const connected = outcomes.find((r) => r.status === "fulfilled");
  if (connected?.status !== "fulfilled") throw new Error("Kurye soketi açılamadı");
  const socket = connected.value;
  const seen: unknown[] = [];
  let leaked = false;
  socket.on("courier:event", (e) => seen.push(e));
  for (const event of [
    "business:live",
    "business:order",
    "order:changed",
    "kitchen:event",
    "message:new",
  ])
    socket.on(event, () => {
      leaked = true;
    });
  const arrived = next(socket, "courier:event");
  const job = await owner.ok(
    courierJobSchema,
    "PUT",
    `/v1/business/${f.businessId}/orders/${f.order.id}/delivery-assignment`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { memberId: member.id, expectedVersion: 0, expectedOrderVersion: 1 },
    },
  );
  const events = await app.platformDb.many<{ id: string }>(
    sql`select id from outbox_events where business_id=${f.businessId}`,
  );
  await app.services.events.drain({ eventIds: events.map((e) => e.id) });
  expect(await arrived).toMatchObject({ jobId: job.id, type: "delivery.assigned" });
  expect(leaked).toBe(false);
  expect(JSON.stringify(seen)).not.toContain(f.address.phone);
  const replacement = await owner.ok(
    courierMemberSchema,
    "POST",
    `/v1/business/${f.businessId}/couriers`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { userId: other.id, expectedVersion: 0, active: true },
    },
  );
  await owner.ok(
    courierJobSchema,
    "PUT",
    `/v1/business/${f.businessId}/orders/${f.order.id}/delivery-assignment`,
    {
      headers: { "idempotency-key": randomUUID() },
      body: { memberId: replacement.id, expectedVersion: job.version, expectedOrderVersion: 1 },
    },
  );
  expect(
    (
      await client.ok(
        courierLiveReplaySchema,
        "GET",
        `/v1/courier/${f.businessId}/live-events?cursor=0`,
      )
    ).items,
  ).toEqual([]);
  const queued = await app.platformDb.many<{ id: string }>(
    sql`select id from outbox_events where business_id=${f.businessId} and type='delivery.assigned'`,
  );
  await app.services.events.drain({ eventIds: queued.map((e) => e.id) });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(seen).toHaveLength(1);
  const revoked = await client.ok(
    businessSocketTicketSchema,
    "POST",
    `/v1/courier/${f.businessId}/socket-ticket`,
    { body: {} },
  );
  await owner.ok(courierMemberSchema, "POST", `/v1/business/${f.businessId}/couriers`, {
    headers: { "idempotency-key": randomUUID() },
    body: { userId: courier.id, expectedVersion: member.version, active: false },
  });
  await expect(connect({ courierTicket: revoked.ticket })).rejects.toThrow("unauthorized");
});
