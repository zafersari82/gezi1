import { randomUUID } from "node:crypto";

import { studioConfigurationResponseSchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { withTenant } from "../src/core/tenant-scope";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";

describe("VADO Business Studio mağaza taslağı", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("telefon başvurusunun şablonunu işletmeye ait taslak olarak saklar", async () => {
    const owner = await createUser(app, "Stüdyo sahibi");
    const stranger = await createUser(app, "Başka mağaza sahibi");
    const created = await as(app, owner).request("POST", "/v1/businesses", {
      body: {
        name: "Ustanın Pilavı",
        slug: `pilav-${randomUUID()}`,
        category: "food",
        city: "Ankara",
        templateId: "food-fast",
      },
    });
    expect(created.status).toBe(200);
    const id = (created.body as { id: string }).id;
    const read = await as(app, owner).ok(
      studioConfigurationResponseSchema,
      "GET",
      `/v1/business/${id}/studio`,
    );
    expect(read).toMatchObject({ businessName: "Ustanın Pilavı", category: "food" });
    expect(read.configuration).toMatchObject({
      templateId: "food-fast",
      status: "draft",
      version: 1,
      title: "Ustanın Pilavı",
    });
    expect(await as(app, stranger).request("GET", `/v1/business/${id}/studio`)).toMatchObject({
      status: 403,
    });
    const scope = await app.services.businessManagement.authorise(owner.id, id);
    expect(
      await withTenant(app.db, scope, (tx) =>
        tx.many(sql`select * from business_studio where business_id = ${id}`),
      ),
    ).toHaveLength(1);
    expect(await app.db.many(sql`select * from business_studio`)).toEqual([]);
  });

  it("görünüm taslağı değiştirilebilir; eşzamanlı değişiklik eski sürümü ezemez", async () => {
    const owner = await createUser(app, "Taslak sahibi");
    const staff = await createUser(app, "Taslak personeli");
    const stranger = await createUser(app, "Taslak yabancısı");
    const business = await as(app, owner).request("POST", "/v1/businesses", {
      body: {
        name: "Güncel Pilav",
        slug: `design-${randomUUID()}`,
        category: "food",
        city: "İzmir",
      },
    });
    expect(business.status).toBe(200);
    const id = (business.body as { id: string }).id;
    const initial = {
      templateId: "food-fast",
      title: "Güncel Pilav",
      tagline: "Sıcak servis",
      palette: "forest",
      expectedVersion: 0,
    };
    const created = await as(app, owner).ok(
      studioConfigurationResponseSchema,
      "PUT",
      `/v1/business/${id}/studio`,
      { body: initial },
    );
    expect(created.configuration).toMatchObject({
      title: "Güncel Pilav",
      tagline: "Sıcak servis",
      palette: "forest",
      version: 1,
      status: "draft",
    });
    const updated = await as(app, owner).ok(
      studioConfigurationResponseSchema,
      "PUT",
      `/v1/business/${id}/studio`,
      { body: { ...initial, templateId: "food-premium", title: "Pilav Evi", expectedVersion: 1 } },
    );
    expect(updated.configuration).toMatchObject({
      templateId: "food-premium",
      version: 2,
      status: "draft",
    });
    await as(app, owner).fail("record_version_conflict", "PUT", `/v1/business/${id}/studio`, {
      body: { ...initial, title: "Eski telefondaki taslak", expectedVersion: 1 },
    });
    await as(app, owner).fail("validation_failed", "PUT", `/v1/business/${id}/studio`, {
      body: { ...initial, templateId: "beauty-team", expectedVersion: 2 },
    });
    const scopeForRoles = await app.services.businessManagement.authorise(owner.id, id);
    await app.services.businessManagement.setMember(scopeForRoles, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    await as(app, staff).fail("forbidden", "PUT", `/v1/business/${id}/studio`, {
      body: { ...initial, expectedVersion: 2 },
    });
    await as(app, stranger).fail("forbidden", "PUT", `/v1/business/${id}/studio`, {
      body: { ...initial, expectedVersion: 2 },
    });
    const read = await as(app, owner).ok(
      studioConfigurationResponseSchema,
      "GET",
      `/v1/business/${id}/studio`,
    );
    expect(read.configuration).toMatchObject({ title: "Pilav Evi", version: 2 });
    const scope = await app.services.businessManagement.authorise(owner.id, id);
    expect(
      await withTenant(app.db, scope, (tx) =>
        tx.many(sql`
      select * from business_studio where business_id=${id} and title='Pilav Evi'
    `),
      ),
    ).toHaveLength(1);
    expect(await app.db.many(sql`select * from business_studio where business_id=${id}`)).toEqual(
      [],
    );
  });

  it("farklı sektörün şablonunu veritabanına kaydetmeden reddeder", async () => {
    const owner = await createUser(app, "Uygunsuz şablon sahibi");
    const invalid = await as(app, owner).request("POST", "/v1/businesses", {
      body: {
        name: "Uygunsuz Mağaza",
        slug: `wrong-${randomUUID()}`,
        category: "food",
        city: "İstanbul",
        templateId: "beauty-team",
      },
    });
    expect(invalid.status).toBe(400);
  });
});
