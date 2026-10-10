import { randomUUID } from "node:crypto";

import {
  businessRegionBranchSchema,
  businessRegionSchema,
  orderGrantSchema,
  orderGrantsSchema,
  orderSchema,
  orderSummarySchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { sql } from "../src/core/database";
import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { createOrderingFixture } from "./support/ordering-fixture";
import { createTenantFixture, scoped } from "./support/tenant-fixture";

const orderList = z.object({
  items: z.array(orderSummarySchema),
  nextCursor: z.string().nullable(),
});
const savedGrant = orderGrantSchema.pick({ userId: true, access: true });
const branchAccess = z.object({
  viewBranchIds: z.array(z.string().uuid()),
  manageBranchIds: z.array(z.string().uuid()),
});

describe("Şube ve bölge sipariş erişimi", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });

  it("stok yetkisi siparişleri açmaz, yalnız bölge/şube sipariş izni açar", async () => {
    const fixture = await createOrderingFixture(app);
    const other = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const staff = await createUser(app, "Sipariş sorumlusu");
    const member = as(app, staff);
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    const branch2 = await app.services.businessManagement.saveBranch(fixture.scope, {
      name: "İkinci şube",
      timezone: "Europe/Istanbul",
      address: "",
      active: true,
    });
    const orders = `/v1/business/${fixture.businessId}/orders`;
    const target = `${orders}/${fixture.order.id}`;
    const branch2Grants = `/v1/business/${fixture.businessId}/branches/${branch2.id}/order-grants`;
    const grants = `/v1/business/${fixture.businessId}/branches/${fixture.branchId}/order-grants`;
    const regionRoot = `/v1/business/${fixture.businessId}/regions`;
    await owner.ok(
      z.object({ userId: z.string(), allowed: z.boolean() }),
      "PUT",
      `/v1/business/${fixture.businessId}/branches/${fixture.branchId}/availability-grants`,
      { body: { userId: staff.id, allowed: true } },
    );
    expect((await member.ok(orderList, "GET", orders)).items).toEqual([]);
    expect(await member.ok(branchAccess, "GET", `${orders}/access/me`)).toEqual({
      viewBranchIds: [],
      manageBranchIds: [],
    });
    await member.fail("not_found", "GET", target);
    await member.fail("forbidden", "GET", grants);
    await member.fail("forbidden", "POST", `/v1/business/${fixture.businessId}/socket-ticket`, {
      body: {},
    });
    await owner.ok(savedGrant, "PUT", branch2Grants, {
      body: { userId: staff.id, access: "view" },
    });
    expect((await member.ok(orderList, "GET", orders)).items).toEqual([]);
    await owner.ok(savedGrant, "PUT", grants, { body: { userId: staff.id, access: "view" } });
    expect((await member.ok(orderList, "GET", orders)).items.map((order) => order.id)).toEqual([
      fixture.order.id,
    ]);
    expect((await member.ok(orderSchema, "GET", target)).id).toBe(fixture.order.id);
    expect((await member.ok(branchAccess, "GET", `${orders}/access/me`)).manageBranchIds).toEqual(
      [],
    );
    const payment = `${target}/payment`;
    const paymentBody = { expectedPaymentVersion: 0, place: "counter", method: "cash" };
    await member.fail("not_found", "POST", payment, { body: paymentBody });
    await owner.ok(savedGrant, "PUT", grants, { body: { userId: staff.id, access: "manage" } });
    expect((await member.ok(branchAccess, "GET", `${orders}/access/me`)).manageBranchIds).toEqual([
      fixture.branchId,
    ]);
    await member.fail("order_state_invalid", "POST", payment, { body: paymentBody });
    await owner.ok(savedGrant, "PUT", grants, { body: { userId: staff.id, access: "none" } });
    expect((await member.ok(orderList, "GET", orders)).items).toEqual([]);
    await member.fail("not_found", "GET", target);
    await owner.ok(savedGrant, "PUT", grants, { body: { userId: staff.id, access: "view" } });
    const region = await owner.ok(businessRegionSchema, "POST", regionRoot, {
      body: { name: `Bölge-${randomUUID().slice(0, 6)}` },
    });
    await owner.ok(
      businessRegionBranchSchema,
      "PUT",
      `${regionRoot}/branches/${fixture.branchId}`,
      { body: { regionId: region.id, expectedRegionId: null } },
    );
    await owner.ok(savedGrant, "PUT", `${regionRoot}/${region.id}/order-grants`, {
      body: { userId: staff.id, access: "view" },
    });
    await owner.ok(savedGrant, "PUT", grants, { body: { userId: staff.id, access: "none" } });
    expect((await member.ok(orderList, "GET", orders)).items.map((order) => order.id)).toEqual([
      fixture.order.id,
    ]);
    await owner.ok(
      businessRegionBranchSchema,
      "PUT",
      `${regionRoot}/branches/${fixture.branchId}`,
      { body: { regionId: null, expectedRegionId: region.id } },
    );
    expect((await member.ok(orderList, "GET", orders)).items).toEqual([]);
    await owner.fail(
      "not_found",
      "PUT",
      `/v1/business/${fixture.businessId}/branches/${other.branchId}/order-grants`,
      { body: { userId: staff.id, access: "view" } },
    );
    await owner.ok(savedGrant, "PUT", grants, { body: { userId: staff.id, access: "view" } });
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: staff.id,
      role: "staff",
      active: false,
    });
    await app.services.businessManagement.setMember(fixture.scope, {
      userId: staff.id,
      role: "staff",
      active: true,
    });
    expect((await member.ok(orderList, "GET", orders)).items).toEqual([]);
    const ownerGrants = await owner.ok(orderGrantsSchema, "GET", grants);
    expect(ownerGrants.items).toContainEqual(
      expect.objectContaining({ userId: staff.id, access: "none" }),
    );
    const foreignRows = await scoped(app.db, other.businessId, (tx) =>
      tx.many(
        sql`select * from business_branch_order_grants where business_id=${fixture.businessId}`,
      ),
    );
    expect(foreignRows).toEqual([]);
  });
});
