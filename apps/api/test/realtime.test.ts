import type { AddressInfo } from "node:net";

import { authResultSchema, type ServerToClientEvents } from "@vado/contracts";
import { io, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  anonymous,
  as,
  createUser,
  makeContacts,
  startTestApp,
  type TestApp,
  type TestUser,
} from "./support/harness";

describe("gerçek zamanlı bildirimler", () => {
  let app: TestApp;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await startTestApp();
    await app.server.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.server.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });
  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });
  afterAll(() => app.stop());

  function connect(token: string): Promise<Socket> {
    const socket = io(url, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once("connect", () => {
        resolve(socket);
      });
      socket.once("connect_error", reject);
    });
  }

  /** Olayın ilk gelişini bekler; süre dolarsa test başarısız olur. */
  function next<Event extends keyof ServerToClientEvents>(
    socket: Socket,
    event: Event,
  ): Promise<Parameters<ServerToClientEvents[Event]>[0]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${event} olayı gelmedi`));
      }, 3000);
      const name: string = event;
      socket.once(name, (payload: Parameters<ServerToClientEvents[Event]>[0]) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  async function pair(): Promise<[TestUser, TestUser, string]> {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    await makeContacts(app, ayse, mehmet);
    const conversation = await app.services.chat.openDirect(ayse.id, mehmet.id);
    return [ayse, mehmet, conversation.id];
  }

  it("geçersiz belirteçle bağlantıyı reddeder", async () => {
    await expect(connect("gecersiz")).rejects.toThrow("unauthorized");
  });

  it("yeni mesajı alıcıya ve gönderenin diğer cihazlarına iletir", async () => {
    const [ayse, mehmet, conversationId] = await pair();
    const receiver = await connect(mehmet.token);
    const senderOtherDevice = await connect(ayse.token);
    const received = next(receiver, "message:new");
    const mirrored = next(senderOtherDevice, "message:new");

    await as(app, ayse).request("POST", `/v1/conversations/${conversationId}/messages`, {
      body: { kind: "text", clientId: "realtime-test-1", body: "Canlı mesaj" },
    });

    expect(await received).toMatchObject({
      conversationId,
      message: { body: "Canlı mesaj", senderId: ayse.id },
    });
    expect((await mirrored).message.body).toBe("Canlı mesaj");
  });

  it("sohbette olmayan kullanıcıya mesaj gitmez", async () => {
    const [ayse, , conversationId] = await pair();
    const outsider = await createUser(app, "Yabancı");
    const socket = await connect(outsider.token);
    let leaked = false;
    socket.on("message:new", () => {
      leaked = true;
    });

    await as(app, ayse).request("POST", `/v1/conversations/${conversationId}/messages`, {
      body: { kind: "text", clientId: "realtime-test-2", body: "Özel" },
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(leaked).toBe(false);
  });

  it("okundu bilgisini karşı tarafa bildirir", async () => {
    const [ayse, mehmet, conversationId] = await pair();
    const message = await app.services.chat.sendMessage(ayse.id, conversationId, {
      kind: "text",
      clientId: "realtime-test-3",
      body: "Okundu mu?",
    });
    const sender = await connect(ayse.token);
    const read = next(sender, "conversation:read");

    await as(app, mehmet).done("POST", `/v1/conversations/${conversationId}/read`, {
      body: { seq: message.seq },
    });
    expect(await read).toEqual({ conversationId, userId: mehmet.id, lastReadSeq: message.seq });
  });

  it("yazıyor bildirimini yalnızca sohbetin diğer üyesine iletir", async () => {
    const [ayse, mehmet, conversationId] = await pair();
    const typist = await connect(ayse.token);
    const watcher = await connect(mehmet.token);
    const typing = next(watcher, "conversation:typing");

    typist.emit("conversation:typing", { conversationId });
    expect(await typing).toEqual({ conversationId, userId: ayse.id });
  });

  it("üyesi olmadığı sohbete yazıyor bildirimi gönderemez", async () => {
    const [, mehmet, conversationId] = await pair();
    const outsider = await createUser(app, "Yabancı");
    const intruder = await connect(outsider.token);
    const watcher = await connect(mehmet.token);
    let leaked = false;
    watcher.on("conversation:typing", () => {
      leaked = true;
    });

    intruder.emit("conversation:typing", { conversationId });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(leaked).toBe(false);
  });

  it("kişi isteği alıcıya anında bildirilir", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    const socket = await connect(mehmet.token);
    const changed = next(socket, "contacts:changed");

    await as(app, ayse).request("POST", "/v1/contact-requests", { body: { userId: mehmet.id } });
    await changed;
  });

  it("hesaba yeni bir cihazdan giriş yapılınca açık cihazlar uyarılır", async () => {
    const user = await createUser(app, "Ayşe");
    const socket = await connect(user.token);
    const alert = next(socket, "session:new-device");

    const guest = anonymous(app);
    await guest.request("POST", "/v1/auth/otp", { body: { phone: user.phone } });
    await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", {
      body: {
        phone: user.phone,
        code: "000000",
        deviceName: "Tanınmayan Telefon",
        platform: "android",
        deviceId: "taninmayan-cihaz-0001",
      },
    });

    expect((await alert).deviceName).toBe("Tanınmayan Telefon");
  });

  it("oturum kapatılınca bağlantı bilgilendirilir ve düşürülür", async () => {
    const user = await createUser(app, "Ayşe");
    const socket = await connect(user.token);
    const revoked = next(socket, "session:revoked");
    const disconnected = new Promise<void>((resolve) => {
      socket.once("disconnect", () => {
        resolve();
      });
    });

    await as(app, user).done("POST", "/v1/auth/logout");
    await revoked;
    await disconnected;
    expect(socket.connected).toBe(false);
  });
});
