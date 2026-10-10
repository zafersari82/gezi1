import { studioConfigurationResponseSchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { as, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGOQLFqFFTEMLQkAC0pNQWlTN4kAAAAASUVORK5CYII=",
  "base64",
);
const design = {
  templateId: "food-fast",
  title: "Taze Pilav",
  tagline: "Her gün",
  palette: "teal",
};

describe("business media quota and lifecycle", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("counts encoded bytes per tenant and enforces quota", async () => {
    const first = await createTenantFixture(app);
    const second = await createTenantFixture(app);
    const uploaded = await app.services.media.uploadBusiness(first.scope, png);
    expect(uploaded.contentType).toBe("image/webp");
    expect(uploaded.url.endsWith(".webp")).toBe(true);
    const usage = await app.services.media.businessUsage(first.scope);
    expect(usage).toMatchObject({ usedBytes: uploaded.byteSize, imageCount: 1 });
    expect((await app.services.media.businessUsage(second.scope)).usedBytes).toBe(0);
    // Move the first tenant near its configured limit without allocating huge files.
    await app.db.execute(
      sql`update businesses set media_quota_bytes=1048576 where id=${first.businessId}`,
    );
    await app.db.execute(sql`update media set byte_size=1048576 where id=${uploaded.id}`);
    await expect(app.services.media.uploadBusiness(first.scope, png)).rejects.toMatchObject({
      code: "media_quota_exceeded",
    });
    const after = await app.services.media.businessUsage(first.scope);
    expect(after.imageCount).toBe(1);
    expect((await app.services.media.uploadBusiness(second.scope, png)).contentType).toBe(
      "image/webp",
    );
  });

  it("removes aged unreferenced images, not draft or published storefront pictures", async () => {
    const business = await createTenantFixture(app);
    const api = as(app, business.owner);
    const root = `/v1/business/${business.businessId}/studio`;
    const oldUnused = await app.services.media.uploadBusiness(business.scope, png);
    const logo = await app.services.media.uploadBusiness(business.scope, png);
    const created = await api.ok(studioConfigurationResponseSchema, "PUT", root, {
      body: { ...design, logoMediaId: logo.id, expectedVersion: 0 },
    });
    await api.ok(studioConfigurationResponseSchema, "POST", `${root}/publish`, {
      body: { expectedVersion: created.configuration?.version },
    });
    await api.ok(studioConfigurationResponseSchema, "PUT", root, {
      body: { ...design, logoMediaId: null, expectedVersion: created.configuration?.version },
    });
    await scoped(app.db, business.businessId, (tx) =>
      tx.execute(sql`
      update business_media set created_at=now()-interval '8 days'
      where business_id=${business.businessId}
    `),
    );
    const result = await app.services.media.pruneBusiness(business.scope);
    expect(result.removed).toBe(1);
    const remaining = await app.services.media.businessUsage(business.scope);
    expect(remaining.imageCount).toBe(1);
    expect(await app.db.maybeOne(sql`select id from media where id=${oldUnused.id}`)).toBeNull();
    expect(await app.db.maybeOne(sql`select id from media where id=${logo.id}`)).not.toBeNull();
    // Once an owner publishes a design without the logo, it becomes collectible.
    await api.ok(studioConfigurationResponseSchema, "POST", `${root}/publish`, {
      body: { expectedVersion: 2 },
    });
    const cleared = await app.services.media.pruneBusiness(business.scope);
    expect(cleared.removed).toBe(1);
    expect((await app.services.media.businessUsage(business.scope)).imageCount).toBe(0);
  });
});
