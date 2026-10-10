import { randomUUID } from "node:crypto";

import {
  businessChatInboxSchema,
  businessChatMessageSchema,
  businessChatMessagesSchema,
  conversationDetailSchema,
  conversationSchema,
  listOf,
  messageSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture } from "./support/tenant-fixture";

const openedSchema = z.object({ conversationId: z.uuid() });
const listSchema = listOf(conversationSchema);
const nextId = () => `business-${randomUUID()}`;

describe("VADO Business Chat S2", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("müşteri kişi eklemeden tek işletme konuşması açar, sohbet çekirdeğiyle mesajlaşır", async () => {
    const business = await createTenantFixture(app);
    const customer = as(app, business.customer);
    const path = `/v1/businesses/${business.businessId}/chat`;
    const first = await customer.ok(openedSchema, "POST", path, { body: {} });
    const second = await customer.ok(openedSchema, "POST", path, { body: {} });
    expect(second.conversationId).toBe(first.conversationId);
    const detail = await customer.ok(
      conversationDetailSchema,
      "GET",
      `/v1/conversations/${first.conversationId}`,
    );
    expect(detail.kind).toBe("business");
    const posted = await customer.ok(
      messageSchema,
      "POST",
      `/v1/conversations/${first.conversationId}/messages`,
      {
        body: { kind: "text", body: "Bugün açık mısınız?", clientId: nextId() },
      },
    );
    expect(posted.body).toBe("Bugün açık mısınız?");
    const inbox = await as(app, business.owner).ok(
      businessChatInboxSchema,
      "GET",
      `/v1/business/${business.businessId}/chats`,
    );
    expect(inbox.items.some((t) => t.conversationId === first.conversationId)).toBe(true);
    const list = await customer.ok(listSchema, "GET", "/v1/conversations");
    expect(list.items.some((t) => t.id === first.conversationId)).toBe(true);
  });

  it("işletme personeli güncel üyelikle cevap verir, müşteri çalışan kimliğini görmez", async () => {
    const business = await createTenantFixture(app);
    const c = as(app, business.customer);
    const owner = as(app, business.owner);
    const { conversationId } = await c.ok(
      openedSchema,
      "POST",
      `/v1/businesses/${business.businessId}/chat`,
      { body: {} },
    );
    await c.ok(messageSchema, "POST", `/v1/conversations/${conversationId}/messages`, {
      body: { kind: "text", body: "Sipariş durumum nedir?", clientId: nextId() },
    });
    const url = `/v1/business/${business.businessId}/chats/${conversationId}`;
    const before = await owner.ok(businessChatMessagesSchema, "GET", `${url}/messages`);
    expect(before.items[0]?.fromCustomer).toBe(true);
    const clientId = nextId();
    const reply = await owner.ok(businessChatMessageSchema, "POST", `${url}/messages`, {
      body: { body: "Hazırlanıyor", clientId },
    });
    const repeat = await owner.ok(businessChatMessageSchema, "POST", `${url}/messages`, {
      body: { body: "Hazırlanıyor", clientId },
    });
    expect(repeat.id).toBe(reply.id);
    await owner.fail("idempotency_conflict", "POST", `${url}/messages`, {
      body: { body: "Başka yanıt", clientId },
    });
    const visible = await c.ok(
      z.object({ items: z.array(messageSchema), nextCursor: z.string().nullable() }),
      "GET",
      `/v1/conversations/${conversationId}/messages`,
    );
    expect(visible.items[0]).toMatchObject({ body: "Hazırlanıyor", senderId: null });
    const receipt = await owner.ok(z.object({ ok: z.boolean() }), "POST", `${url}/read`, {
      body: {},
    });
    expect(receipt.ok).toBe(true);
  });

  it("başka işletme ve yabancı hesap müşteri mesajlarını göremez", async () => {
    const first = await createTenantFixture(app);
    const second = await createTenantFixture(app);
    const outsider = await createUser(app, "Yabancı");
    const { conversationId } = await as(app, first.customer).ok(
      openedSchema,
      "POST",
      `/v1/businesses/${first.businessId}/chat`,
      { body: {} },
    );
    await as(app, first.customer).ok(
      messageSchema,
      "POST",
      `/v1/conversations/${conversationId}/messages`,
      {
        body: { kind: "text", body: "Özel mesaj", clientId: nextId() },
      },
    );
    await as(app, outsider).fail(
      "conversation_not_found",
      "GET",
      `/v1/conversations/${conversationId}/messages`,
    );
    await as(app, second.owner).fail(
      "conversation_not_found",
      "GET",
      `/v1/business/${second.businessId}/chats/${conversationId}/messages`,
    );
    await as(app, second.owner).fail(
      "conversation_not_found",
      "POST",
      `/v1/business/${second.businessId}/chats/${conversationId}/messages`,
      {
        body: { body: "Yetkisiz", clientId: nextId() },
      },
    );
    await as(app, outsider).fail("forbidden", "GET", `/v1/business/${first.businessId}/chats`);
    const staff = await createUser(app, "Şube personeli");
    await app.services.businessManagement.setMember(first.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    await as(app, staff).fail("forbidden", "GET", `/v1/business/${first.businessId}/chats`);
  });

  it("müşteri işletme sohbetine fotoğraf gönderemez, aynı clientId ile farklı sohbete içerik sızdırılmaz", async () => {
    const first = await createTenantFixture(app);
    const second = await createTenantFixture(app);
    const viewer = as(app, first.customer);
    const a = await viewer.ok(openedSchema, "POST", `/v1/businesses/${first.businessId}/chat`, {
      body: {},
    });
    const b = await viewer.ok(openedSchema, "POST", `/v1/businesses/${second.businessId}/chat`, {
      body: {},
    });
    const clientId = nextId();
    await viewer.ok(messageSchema, "POST", `/v1/conversations/${a.conversationId}/messages`, {
      body: { kind: "text", body: "İlk sohbet", clientId },
    });
    await viewer.fail(
      "idempotency_conflict",
      "POST",
      `/v1/conversations/${b.conversationId}/messages`,
      {
        body: { kind: "text", body: "Başka sohbet", clientId },
      },
    );
    await viewer.fail(
      "validation_failed",
      "POST",
      `/v1/conversations/${a.conversationId}/messages`,
      {
        body: { kind: "image", clientId: nextId(), mediaId: randomUUID() },
      },
    );
  });
});
