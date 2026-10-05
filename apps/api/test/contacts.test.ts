import {
  contactRequestsSchema,
  contactSchema,
  createContactRequestResponseSchema,
  listOf,
  userProfileSchema,
  userRefSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, createUser, makeContacts, startTestApp, type TestApp } from "./support/harness";

describe("kişiler", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.stop());

  it("istek gönderilir, kabul edilir ve iki taraf kişi olur", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");

    const sent = await as(app, ayse).ok(
      createContactRequestResponseSchema,
      "POST",
      "/v1/contact-requests",
      {
        body: { userId: mehmet.id, message: "Merhaba, ben Ayşe" },
      },
    );
    expect(sent.status).toBe("pending");

    const asSeenByAyse = await as(app, ayse).ok(userProfileSchema, "GET", `/v1/users/${mehmet.id}`);
    expect(asSeenByAyse).toMatchObject({ relation: "request_sent", requestId: sent.requestId });

    const inbox = await as(app, mehmet).ok(contactRequestsSchema, "GET", "/v1/contact-requests");
    expect(inbox.incoming).toHaveLength(1);
    expect(inbox.incoming[0]).toMatchObject({
      message: "Merhaba, ben Ayşe",
      user: { id: ayse.id },
    });
    const asSeenByMehmet = await as(app, mehmet).ok(
      userProfileSchema,
      "GET",
      `/v1/users/${ayse.id}`,
    );
    expect(asSeenByMehmet.relation).toBe("request_received");

    const accepted = await as(app, mehmet).ok(
      userRefSchema,
      "POST",
      `/v1/contact-requests/${sent.requestId}/accept`,
    );
    expect(accepted.id).toBe(ayse.id);

    for (const [viewer, other] of [
      [ayse, mehmet],
      [mehmet, ayse],
    ] as const) {
      const contacts = await as(app, viewer).ok(listOf(contactSchema), "GET", "/v1/contacts");
      expect(contacts.items.map((contact) => contact.id)).toEqual([other.id]);
    }
    const after = await as(app, mehmet).ok(contactRequestsSchema, "GET", "/v1/contact-requests");
    expect(after.incoming).toHaveLength(0);
  });

  it("karşılıklı istekte ikinci istek doğrudan kişi yapar", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    await as(app, ayse).ok(createContactRequestResponseSchema, "POST", "/v1/contact-requests", {
      body: { userId: mehmet.id },
    });
    const reverse = await as(app, mehmet).ok(
      createContactRequestResponseSchema,
      "POST",
      "/v1/contact-requests",
      {
        body: { userId: ayse.id },
      },
    );
    expect(reverse).toEqual({ status: "accepted", requestId: null });

    const profile = await as(app, ayse).ok(userProfileSchema, "GET", `/v1/users/${mehmet.id}`);
    expect(profile.relation).toBe("contact");
  });

  it("aynı kişiye yinelenen istek tek kayıt olarak kalır", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    const body = { userId: mehmet.id };
    const first = await as(app, ayse).ok(
      createContactRequestResponseSchema,
      "POST",
      "/v1/contact-requests",
      { body },
    );
    const second = await as(app, ayse).ok(
      createContactRequestResponseSchema,
      "POST",
      "/v1/contact-requests",
      { body },
    );
    expect(second.requestId).toBe(first.requestId);

    const inbox = await as(app, mehmet).ok(contactRequestsSchema, "GET", "/v1/contact-requests");
    expect(inbox.incoming).toHaveLength(1);
  });

  it("istek reddedilebilir veya geri çekilebilir; üçüncü kişi dokunamaz", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    const outsider = await createUser(app, "Yabancı");

    const first = await as(app, ayse).ok(
      createContactRequestResponseSchema,
      "POST",
      "/v1/contact-requests",
      {
        body: { userId: mehmet.id },
      },
    );
    await as(app, outsider).fail(
      "contact_request_not_found",
      "DELETE",
      `/v1/contact-requests/${first.requestId}`,
    );
    await as(app, outsider).fail(
      "contact_request_not_found",
      "POST",
      `/v1/contact-requests/${first.requestId}/accept`,
    );
    await as(app, ayse).fail(
      "contact_request_not_found",
      "POST",
      `/v1/contact-requests/${first.requestId}/accept`,
    );

    await as(app, mehmet).done("DELETE", `/v1/contact-requests/${first.requestId}`);

    const second = await as(app, ayse).ok(
      createContactRequestResponseSchema,
      "POST",
      "/v1/contact-requests",
      {
        body: { userId: mehmet.id },
      },
    );
    await as(app, ayse).done("DELETE", `/v1/contact-requests/${second.requestId}`);
    const inbox = await as(app, mehmet).ok(contactRequestsSchema, "GET", "/v1/contact-requests");
    expect(inbox.incoming).toHaveLength(0);
  });

  it("kendine, zaten kişisi olana ve olmayan kullanıcıya istek gönderemez", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    await makeContacts(app, ayse, mehmet);
    const client = as(app, ayse);

    await client.fail("cannot_target_self", "POST", "/v1/contact-requests", {
      body: { userId: ayse.id },
    });
    await client.fail("already_contacts", "POST", "/v1/contact-requests", {
      body: { userId: mehmet.id },
    });
    await client.fail("user_not_found", "POST", "/v1/contact-requests", {
      body: { userId: "00000000-0000-4000-8000-000000000000" },
    });
  });

  it("kişi silinince ilişki iki taraftan da kalkar", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    await makeContacts(app, ayse, mehmet);

    await as(app, ayse).done("DELETE", `/v1/contacts/${mehmet.id}`);
    const contacts = await as(app, mehmet).ok(listOf(contactSchema), "GET", "/v1/contacts");
    expect(contacts.items).toHaveLength(0);
    await as(app, ayse).fail("not_contacts", "DELETE", `/v1/contacts/${mehmet.id}`);
  });

  it("engelleme ilişkiyi koparır ve engellenen kişi için kullanıcıyı görünmez yapar", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    await makeContacts(app, ayse, mehmet);

    await as(app, ayse).done("PUT", `/v1/blocks/${mehmet.id}`);

    const contacts = await as(app, mehmet).ok(listOf(contactSchema), "GET", "/v1/contacts");
    expect(contacts.items).toHaveLength(0);
    await as(app, mehmet).fail("user_not_found", "GET", `/v1/users/${ayse.id}`);
    await as(app, mehmet).fail("user_unavailable", "POST", "/v1/contact-requests", {
      body: { userId: ayse.id },
    });
    await as(app, ayse).fail("user_unavailable", "POST", "/v1/contact-requests", {
      body: { userId: mehmet.id },
    });

    const blocked = await as(app, ayse).ok(listOf(userRefSchema), "GET", "/v1/blocks");
    expect(blocked.items.map((user) => user.id)).toEqual([mehmet.id]);
    const profile = await as(app, ayse).ok(userProfileSchema, "GET", `/v1/users/${mehmet.id}`);
    expect(profile.relation).toBe("blocked");

    await as(app, ayse).done("DELETE", `/v1/blocks/${mehmet.id}`);
    const visible = await as(app, mehmet).ok(userProfileSchema, "GET", `/v1/users/${ayse.id}`);
    expect(visible.relation).toBe("none");
  });
});
