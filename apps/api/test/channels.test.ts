import { channelFollowSchema, channelPageSchema, channelPostSchema } from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createTenantFixture } from "./support/tenant-fixture";

describe("VADO Business Channels", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("yalnız takip edilen işletmenin duyurularını gösterir ve takipten çıkış anında keser", async () => {
    const merchant = await createTenantFixture(app);
    const stranger = await createUser(app, "Takip etmeyen");
    const member = as(app, merchant.customer);
    const owner = as(app, merchant.owner);
    const followPath = `/v1/businesses/${merchant.businessId}/channel/follow`;
    const writePath = `/v1/business/${merchant.businessId}/channel/posts`;

    const post = await owner.ok(channelPostSchema, "POST", writePath, {
      body: { body: "  Bugün pilavımız hazır.  " },
    });
    expect(post.body).toBe("Bugün pilavımız hazır.");
    expect((await member.ok(channelPageSchema, "GET", "/v1/channels/feed")).items).toEqual([]);
    expect(
      (await as(app, stranger).ok(channelPageSchema, "GET", "/v1/channels/feed")).items,
    ).toEqual([]);
    expect((await member.ok(channelFollowSchema, "PUT", followPath)).following).toBe(true);
    expect((await member.ok(channelFollowSchema, "PUT", followPath)).following).toBe(true);
    expect(
      (await member.ok(channelPageSchema, "GET", "/v1/channels/feed")).items.map((p) => p.id),
    ).toContain(post.id);
    expect((await member.ok(channelFollowSchema, "DELETE", followPath)).following).toBe(false);
    expect((await member.ok(channelPageSchema, "GET", "/v1/channels/feed")).items).toEqual([]);
    expect((await member.ok(channelFollowSchema, "GET", followPath)).following).toBe(false);
  });

  it("yalnız sahip ve yönetici yayınlayabilir; personel ve yabancı reddedilir", async () => {
    const merchant = await createTenantFixture(app);
    const staff = await createUser(app, "Servis personeli");
    const stranger = await createUser(app, "Başka kişi");
    await app.services.businessManagement.setMember(merchant.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    const path = `/v1/business/${merchant.businessId}/channel/posts`;
    await as(app, staff).fail("forbidden", "POST", path, { body: { body: "Yetkisiz duyuru" } });
    await as(app, stranger).fail("forbidden", "POST", path, { body: { body: "Yabancı" } });
    await as(app, merchant.owner).fail("validation_failed", "POST", path, {
      body: { body: "   " },
    });
  });

  it("başka işletmenin duyurusu yönetilemez; sadece yayınlanmış duyurular kamuya açıktır", async () => {
    const first = await createTenantFixture(app);
    const second = await createTenantFixture(app);
    const ownPath = `/v1/business/${first.businessId}/channel/posts`;
    const post = await as(app, first.owner).ok(channelPostSchema, "POST", ownPath, {
      body: { body: "Yerel mağazamız açık" },
    });
    await as(app, second.owner).fail("forbidden", "POST", `${ownPath}/${post.id}/withdraw`, {
      body: {},
    });
    const stranger = await createUser(app, "Ziyaretçi");
    const publicFeed = await as(app, stranger).ok(
      channelPageSchema,
      "GET",
      `/v1/businesses/${first.businessId}/channel/posts`,
    );
    expect(publicFeed.items.map((item) => item.id)).toContain(post.id);
    await as(app, first.owner).request("POST", `${ownPath}/${post.id}/withdraw`, { body: {} });
    const after = await as(app, stranger).ok(
      channelPageSchema,
      "GET",
      `/v1/businesses/${first.businessId}/channel/posts`,
    );
    expect(after.items).toEqual([]);
  });

  it("geri çekilen duyuruyu akıştan çıkarır ve sayfalamada tekrar üretmez", async () => {
    const merchant = await createTenantFixture(app);
    const owner = as(app, merchant.owner);
    const reader = as(app, merchant.customer);
    const path = `/v1/business/${merchant.businessId}/channel/posts`;
    await reader.ok(
      channelFollowSchema,
      "PUT",
      `/v1/businesses/${merchant.businessId}/channel/follow`,
    );
    const ids: string[] = [];
    for (const body of ["Birinci", "İkinci", "Üçüncü"]) {
      ids.push((await owner.ok(channelPostSchema, "POST", path, { body: { body } })).id);
    }
    const page1 = await reader.ok(channelPageSchema, "GET", "/v1/channels/feed?limit=2");
    expect(page1.items.map((p) => p.id)).toEqual([ids[2], ids[1]]);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await reader.ok(
      channelPageSchema,
      "GET",
      `/v1/channels/feed?limit=2&cursor=${page1.nextCursor}`,
    );
    expect(page2.items.map((p) => p.id)).toEqual([ids[0]]);
    const publicPosts = await reader.ok(
      channelPageSchema,
      "GET",
      `/v1/businesses/${merchant.businessId}/channel/posts?limit=1`,
    );
    expect(publicPosts.items).toHaveLength(1);
    expect((await owner.request("POST", `${path}/${ids[1]}/withdraw`, { body: {} })).status).toBe(
      200,
    );
    const updated = await reader.ok(channelPageSchema, "GET", "/v1/channels/feed");
    expect(updated.items.map((p) => p.id)).toEqual([ids[2], ids[0]]);
    await owner.fail("not_found", "POST", `${path}/${ids[1]}/withdraw`, { body: {} });
  });
});
