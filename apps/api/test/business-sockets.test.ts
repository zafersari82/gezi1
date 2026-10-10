import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { io, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { randomToken, sha256 } from "../src/core/security";
import {
  anonymous,
  as,
  createUser,
  makeContacts,
  startTestApp,
  type TestApp,
} from "./support/harness";
import { createOrderingFixture } from "./support/ordering-fixture";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

const ticketSchema = z.object({ ticket: z.string(), expiresAt: z.string(), socketUrl: z.string() });
let app: TestApp;
let url: string;
const sockets: Socket[] = [];
beforeAll(async () => {
  app = await startTestApp();
  await app.server.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.server.address() as AddressInfo;
  url = `http://127.0.0.1:${address.port}`;
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
function next(socket: Socket, name: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${name} gelmedi`));
    }, 3000);
    socket.once(name, (event: unknown) => {
      clearTimeout(timer);
      resolve(event);
    });
  });
}

test("bilet yalnız VADO oturumu ve etkin işletme üyeliğiyle verilir", async () => {
  const f = await createTenantFixture(app);
  const path = `/v1/business/${f.businessId}/socket-ticket`;
  await anonymous(app).fail("unauthorized", "POST", path);
  await as(app, f.customer).fail("forbidden", "POST", path);
  const ticket = await as(app, f.owner).ok(ticketSchema, "POST", path);
  expect(ticket.ticket).not.toBe(f.owner.token);
  expect(Date.parse(ticket.expiresAt) - Date.now()).toBeGreaterThan(0);
  expect(Date.parse(ticket.expiresAt) - Date.now()).toBeLessThanOrEqual(60_000);
  const other = await createTenantFixture(app);
  await as(app, f.owner).fail(
    "forbidden",
    "POST",
    `/v1/business/${other.businessId}/socket-ticket`,
  );
  await as(app, f.owner).fail("validation_failed", "POST", path, {
    body: { businessId: other.businessId },
  });
});

test("aynı bilet elli eş zamanlı bağlantıda yalnız bir kez tüketilir", async () => {
  const f = await createTenantFixture(app);
  const ticket = await as(app, f.owner).ok(
    ticketSchema,
    "POST",
    `/v1/business/${f.businessId}/socket-ticket`,
  );
  const results = await Promise.allSettled(
    Array.from({ length: 50 }, () => connect({ businessTicket: ticket.ticket })),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(49);
});

test("tüketilmiş bilet SQL ile ikinci kez tüketilemez", async () => {
  const f = await createTenantFixture(app);
  const ticket = await as(app, f.owner).ok(
    ticketSchema,
    "POST",
    `/v1/business/${f.businessId}/socket-ticket`,
  );
  const socket = await connect({ businessTicket: ticket.ticket });
  socket.disconnect();
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(sql`
    update business_socket_tickets set used_at=now() where token_hash=${sha256(ticket.ticket)}
  `),
    ),
  ).rejects.toMatchObject({ code: "23514" });
});

test("geçersiz ve süresi dolmuş bilet bağlantı açamaz", async () => {
  await expect(connect({ businessTicket: "gecersiz" })).rejects.toThrow("unauthorized");
  const f = await createTenantFixture(app);
  const token = randomToken();
  await scoped(app.db, f.businessId, (tx) =>
    tx.execute(sql`
    insert into business_socket_tickets(business_id,user_id,session_id,token_hash,created_at,expires_at)
    values(${f.businessId},${f.owner.id},${f.owner.sessionId},${sha256(token)},now()-interval '61 seconds',now()-interval '1 second')`),
  );
  await expect(connect({ businessTicket: token })).rejects.toThrow("unauthorized");
});

test("üyelik ve oturum iptali önceden verilmiş bileti geçersiz kılar", async () => {
  const f = await createTenantFixture(app);
  const staff = await createUser(app, "Personel");
  await app.services.businessManagement.setMember(f.scope, {
    userId: staff.id,
    role: "staff",
    active: true,
  });
  // Personel bilet alır; olaylar alıcının izinlerine göre süzülür. İşletme dışı kişi alamaz.
  const outsider = await createUser(app, "Dışarıdan");
  await as(app, outsider).fail("forbidden", "POST", `/v1/business/${f.businessId}/socket-ticket`);
  const ticket = await as(app, staff).ok(
    ticketSchema,
    "POST",
    `/v1/business/${f.businessId}/socket-ticket`,
  );
  await app.services.businessManagement.setMember(f.scope, {
    userId: staff.id,
    role: "staff",
    active: false,
  });
  await expect(connect({ businessTicket: ticket.ticket })).rejects.toThrow("unauthorized");
  const second = await as(app, f.owner).ok(
    ticketSchema,
    "POST",
    `/v1/business/${f.businessId}/socket-ticket`,
  );
  await app.services.auth.revokeSession(f.owner.id, f.owner.sessionId);
  await expect(connect({ businessTicket: second.ticket })).rejects.toThrow("unauthorized");
});

test("Business soketi kişisel sohbet almaz ve yazıyor bildirimi üretemez", async () => {
  const f = await createTenantFixture(app);
  const friend = await createUser(app, "Arkadaş");
  await makeContacts(app, f.owner, friend);
  const conversation = await app.services.chat.openDirect(f.owner.id, friend.id);
  const ticket = await as(app, f.owner).ok(
    ticketSchema,
    "POST",
    `/v1/business/${f.businessId}/socket-ticket`,
  );
  const business = await connect({ businessTicket: ticket.ticket });
  const personal = await connect({ token: f.owner.token });
  const friendSocket = await connect({ token: friend.token });
  const message = next(personal, "message:new");
  let leaked = false;
  business.on("message:new", () => {
    leaked = true;
  });
  friendSocket.on("conversation:typing", () => {
    leaked = true;
  });
  business.emit("conversation:typing", { conversationId: conversation.id });
  await app.services.chat.sendMessage(friend.id, conversation.id, {
    kind: "text",
    clientId: randomUUID(),
    body: "Özel mesaj",
  });
  await message;
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(leaked).toBe(false);
});

test("outbox sipariş olayı yalnız ilgili işletme soketine gider; tekrar etkisizdir", async () => {
  const f = await createOrderingFixture(app);
  const other = await createTenantFixture(app);
  await app.services.businessManagement.setMember(other.scope, {
    userId: f.owner.id,
    role: "manager",
    active: true,
  });
  const first = await as(app, f.owner).ok(
    ticketSchema,
    "POST",
    `/v1/business/${f.businessId}/socket-ticket`,
  );
  const second = await as(app, f.owner).ok(
    ticketSchema,
    "POST",
    `/v1/business/${other.businessId}/socket-ticket`,
  );
  const business = await connect({ businessTicket: first.ticket });
  const otherSocket = await connect({ businessTicket: second.ticket });
  const personal = await connect({ token: f.owner.token });
  let count = 0;
  let leaked = false;
  business.on("business:order", () => {
    count++;
  });
  otherSocket.on("business:order", () => {
    leaked = true;
  });
  personal.on("business:order", () => {
    leaked = true;
  });
  const arrived = next(business, "business:order");
  const row = await app.platformDb.one<{ id: string }>(
    sql`select id from outbox_events where business_id=${f.businessId} and order_id=${f.order.id}`,
  );
  await app.services.events.drain({ eventIds: [row.id] });
  expect(await arrived).toMatchObject({
    eventId: row.id,
    businessId: f.businessId,
    orderId: f.order.id,
    sequence: 1,
    type: "order.placed",
  });
  await app.services.events.drain({ eventIds: [row.id] });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(count).toBe(1);
  expect(leaked).toBe(false);
});

test("bilet tablosunda RLS zorlanır; başka işletme okuyamaz veya değiştiremez", async () => {
  const f = await createTenantFixture(app);
  const other = await createTenantFixture(app);
  await as(app, f.owner).ok(ticketSchema, "POST", `/v1/business/${f.businessId}/socket-ticket`);
  const meta = await app.db.one<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    sql`select relrowsecurity,relforcerowsecurity from pg_class where relname='business_socket_tickets'`,
  );
  expect(meta).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  expect(await app.db.many(sql`select id from business_socket_tickets`)).toEqual([]);
  await scoped(app.db, other.businessId, async (tx) => {
    expect(
      await tx.many(sql`select id from business_socket_tickets where business_id=${f.businessId}`),
    ).toEqual([]);
    expect(
      await tx.execute(
        sql`update business_socket_tickets set used_at=now() where business_id=${f.businessId}`,
      ),
    ).toBe(0);
    expect(
      await tx.execute(sql`delete from business_socket_tickets where business_id=${f.businessId}`),
    ).toBe(0);
  });
  await expect(
    scoped(app.db, f.businessId, (tx) =>
      tx.execute(
        sql`update business_socket_tickets set token_hash=${sha256(randomToken())} where business_id=${f.businessId}`,
      ),
    ),
  ).rejects.toMatchObject({ code: "23514" });
});

test("oturum kapatıldığında açık Business soketi de kapatılır", async () => {
  const f = await createTenantFixture(app);
  const ticket = await as(app, f.owner).ok(
    ticketSchema,
    "POST",
    `/v1/business/${f.businessId}/socket-ticket`,
  );
  const socket = await connect({ businessTicket: ticket.ticket });
  const revoked = next(socket, "session:revoked");
  const disconnected = new Promise<void>((resolve) =>
    socket.once("disconnect", () => {
      resolve();
    }),
  );
  await app.services.auth.revokeSession(f.owner.id, f.owner.sessionId);
  await revoked;
  await disconnected;
  expect(socket.connected).toBe(false);
});

test("Business bağlantısı VADO oturumunun kalan süresini aşmaz", async () => {
  const f = await createTenantFixture(app);
  await app.db.execute(
    sql`update sessions set expires_at=now()+interval '2 seconds' where id=${f.owner.sessionId}`,
  );
  const ticket = await app.services.businessSockets.issue(f.scope, f.owner.sessionId);
  const socket = await connect({ businessTicket: ticket.ticket });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Süresi dolan bağlantı kapanmadı"));
    }, 4000);
    socket.once("disconnect", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  expect(socket.connected).toBe(false);
});

test("üyelik kapatıldıktan sonra açık sokete yeni sipariş olayı gönderilmez", async () => {
  const f = await createOrderingFixture(app);
  const staff = await createUser(app, "Eski personel");
  await scoped(app.db, f.businessId, (tx) =>
    tx.execute(
      sql`insert into business_members(business_id,user_id,role) values(${f.businessId},${staff.id},'manager')`,
    ),
  );
  const ticket = await as(app, staff).ok(
    ticketSchema,
    "POST",
    `/v1/business/${f.businessId}/socket-ticket`,
  );
  const socket = await connect({ businessTicket: ticket.ticket });
  let leaked = false;
  socket.on("business:order", () => {
    leaked = true;
  });
  await scoped(app.db, f.businessId, (tx) =>
    tx.execute(sql`update business_members set active=false where user_id=${staff.id}`),
  );
  const event = await scoped(app.db, f.businessId, (tx) =>
    tx.one<{ id: string }>(sql`select id from outbox_events where order_id=${f.order.id}`),
  );
  await app.services.events.drain({ eventIds: [event.id] });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(leaked).toBe(false);
});

test("süresi dolan biletler en çok binlik partilerle temizlenir; geçerli bilet korunur", async () => {
  const f = await createTenantFixture(app);
  const valid = await app.services.businessSockets.issue(f.scope, f.owner.sessionId);
  await scoped(app.db, f.businessId, (tx) =>
    tx.execute(sql`insert into business_socket_tickets(business_id,user_id,session_id,token_hash,created_at,expires_at)
    select ${f.businessId},${f.owner.id},${f.owner.sessionId},repeat('a',32)||replace(gen_random_uuid()::text,'-',''),now()-interval '5 minutes',now()-interval '4 minutes' from generate_series(1,1001)`),
  );
  expect(await app.services.tenantMaintenance.purgeBusinessTickets()).toBe(1000);
  const remaining = () =>
    scoped(app.db, f.businessId, (tx) =>
      tx.many(sql`select id from business_socket_tickets where expires_at<=now()`),
    );
  expect(await remaining()).toHaveLength(1);
  expect(await app.services.tenantMaintenance.purgeBusinessTickets()).toBeLessThanOrEqual(1000);
  expect(await remaining()).toEqual([]);
  expect(await app.services.businessSockets.consume(valid.ticket)).toMatchObject({
    businessId: f.businessId,
    userId: f.owner.id,
  });
});
