import type { AddressInfo } from "node:net";

import {
  businessSocketTicketSchema,
  devicePairingPollSchema,
  devicePairingSchema,
} from "@vado/contracts";
import { io, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { anonymous, as, startTestApp, type TestApp } from "./support/harness";
import { createRestaurantFixture } from "./support/restaurant-fixture";

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
function connect(auth: Record<string, string>): Promise<Socket> {
  const socket = io(url, { auth, transports: ["websocket"], reconnection: false });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => {
      resolve(socket);
    });
    socket.once("connect_error", reject);
  });
}
function next(socket: Socket, event: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${event} gelmedi`));
    }, 3000);
    socket.once(event, (data: unknown) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
it("mutfak ve müşteri anlık olay alır; cihaz diğer şubeyi ve kişisel kanalı alamaz, iptalde kopar", async () => {
  const f = await createRestaurantFixture(app);
  const foreign = await createRestaurantFixture(app);
  const pair = await anonymous(app).ok(devicePairingSchema, "POST", "/v1/device-pairings", {
    body: {},
  });
  const approval = await as(app, f.owner).request("POST", `/v1/business/${f.businessId}/devices`, {
    body: {
      code: pair.code,
      label: "Mutfak ekranı",
      branchId: f.branchId,
      appInstanceId: f.instanceId,
    },
  });
  expect(approval.status).toBe(200);
  const poll = await anonymous(app).ok(
    devicePairingPollSchema,
    "POST",
    `/v1/device-pairings/${pair.id}/poll`,
    { body: { secret: pair.secret } },
  );
  if (poll.status !== "approved") throw new Error("Eşleştirme onaylanmadı");
  const device = anonymous(app);
  const headers = { authorization: `Bearer ${poll.token}` };
  const ticket = await device.ok(businessSocketTicketSchema, "POST", "/v1/device/socket-ticket", {
    body: {},
    headers,
  });
  const kitchen = await connect({ deviceTicket: ticket.ticket });
  const customer = await connect({ token: f.customer.token });
  const other = await connect({ token: foreign.customer.token });
  await expect(connect({ deviceTicket: ticket.ticket })).rejects.toThrow("unauthorized");
  const seen: unknown[] = [];
  kitchen.on("device:event", (event) => seen.push(event));
  let leaked = false;
  for (const event of ["message:new", "business:live", "order:changed"])
    kitchen.on(event, () => {
      leaked = true;
    });
  other.on("order:changed", (event: unknown) => {
    if (
      typeof event === "object" &&
      event !== null &&
      "businessId" in event &&
      event.businessId === f.businessId
    )
      leaked = true;
  });
  const live = next(kitchen, "device:event");
  const own = next(customer, "order:changed");
  const pending = await app.platformDb.many<{ id: string }>(
    sql`select id from outbox_events where business_id=any(${[f.businessId, foreign.businessId]}::uuid[])`,
  );
  await app.services.events.drain({ eventIds: pending.map((e) => e.id) });
  expect(await live).toMatchObject({ businessId: f.businessId, orderId: f.order.id });
  expect(await own).toMatchObject({ orderId: f.order.id });
  expect(seen).toHaveLength(1);
  expect(leaked).toBe(false);
  const revoked = next(kitchen, "device:revoked");
  const disconnected = next(kitchen, "disconnect");
  await as(app, f.owner).request(
    "POST",
    `/v1/business/${f.businessId}/devices/${poll.device.id}/revoke`,
    { body: {} },
  );
  await revoked;
  await disconnected;
  expect(kitchen.connected).toBe(false);
});
