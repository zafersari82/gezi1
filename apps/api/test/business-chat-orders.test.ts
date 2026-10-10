import { businessChatOrderSchema, businessChatOrdersSchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createOrderingFixture } from "./support/ordering-fixture";

const openedSchema = z.object({ conversationId: z.uuid() });

describe("S7 işletme sohbetinde sipariş görünürlüğü", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("müşteri yalnız kendi siparişini sohbetten paylaşır; durum her sorguda güncel okunur", async () => {
    const fixture = await createOrderingFixture(app);
    const customer = as(app, fixture.customer);
    const owner = as(app, fixture.owner);
    const path = `/v1/businesses/${fixture.businessId}/chat`;
    const { conversationId } = await customer.ok(openedSchema, "POST", path, { body: {} });
    const url = `/v1/conversations/${conversationId}/orders`;
    const list = await customer.ok(businessChatOrdersSchema, "GET", url);
    expect(list.items.some((order) => order.id === fixture.order.id)).toBe(true);
    const detail = await customer.ok(businessChatOrderSchema, "GET", `${url}/${fixture.order.id}`);
    expect(detail).toMatchObject({
      id: fixture.order.id,
      status: "placed",
      businessId: fixture.businessId,
    });
    const merchant = await owner.ok(
      businessChatOrderSchema,
      "GET",
      `/v1/business/${fixture.businessId}/chats/${conversationId}/orders/${fixture.order.id}`,
    );
    expect(merchant.id).toBe(detail.id);
    const status = await owner.request(
      "PUT",
      `/v1/business/${fixture.businessId}/orders/${fixture.order.id}/status`,
      {
        body: { status: "accepted", expectedVersion: fixture.order.version },
      },
    );
    expect(status.status).toBe(200);
    const updated = await customer.ok(businessChatOrderSchema, "GET", `${url}/${fixture.order.id}`);
    expect(updated.status).toBe("accepted");
  });

  it("başka müşteri veya işletme başka müşterinin sipariş kartını okuyamaz", async () => {
    const fixture = await createOrderingFixture(app);
    const other = await createUser(app, "Diğer müşteri");
    const customer = as(app, fixture.customer);
    const conversation = await customer.ok(
      openedSchema,
      "POST",
      `/v1/businesses/${fixture.businessId}/chat`,
      { body: {} },
    );
    const otherConversation = await as(app, other).ok(
      openedSchema,
      "POST",
      `/v1/businesses/${fixture.businessId}/chat`,
      { body: {} },
    );
    await as(app, other).fail(
      "conversation_not_found",
      "GET",
      `/v1/conversations/${conversation.conversationId}/orders`,
    );
    await as(app, other).fail(
      "conversation_not_found",
      "GET",
      `/v1/conversations/${conversation.conversationId}/orders/${fixture.order.id}`,
    );
    await as(app, other).fail(
      "not_found",
      "GET",
      `/v1/conversations/${otherConversation.conversationId}/orders/${fixture.order.id}`,
    );
    await as(app, fixture.owner).fail(
      "conversation_not_found",
      "GET",
      `/v1/conversations/${conversation.conversationId}/orders/${fixture.order.id}`,
    );
    const otherBusiness = await createOrderingFixture(app);
    await as(app, otherBusiness.owner).fail(
      "conversation_not_found",
      "GET",
      `/v1/business/${otherBusiness.businessId}/chats/${conversation.conversationId}/orders/${fixture.order.id}`,
    );
  });
});
