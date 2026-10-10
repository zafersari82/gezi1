import {
  businessMembershipSchema,
  staffInvitationAcceptedSchema,
  staffInvitationCreatedSchema,
  staffInvitationPreviewSchema,
  staffInvitationsSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { as, createUser, startTestApp, type TestApp } from "./support/harness";
import { sql } from "../src/core/database";
import { createTenantFixture } from "./support/tenant-fixture";

const roster = z.object({ items: z.array(businessMembershipSchema) });

describe("Telefonla bağlı çalışan daveti", () => {
  let app: TestApp;
  beforeAll(async () => { app = await startTestApp(); });
  afterAll(async () => { await app.stop(); });

  it("davet yalnız doğrulanmış alıcıya, seçilmiş şubeye ve bir kez uygulanır", async () => {
    const fixture = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const staff = await createUser(app, "Davetli çalışan");
    const wrong = await createUser(app, "Yanlış alıcı");
    const person = as(app, staff);
    const invitePath = `/v1/business/${fixture.businessId}/invitations`;
    const request = {
      phone: staff.phone, branchIds: [fixture.branchId],
      orderAccess: "view", canManageAvailability: true,
    };
    await person.fail("forbidden", "POST", invitePath, { body: request });
    const created = await owner.ok(staffInvitationCreatedSchema, "POST", invitePath, { body: request });
    expect(created.invitation.status).toBe("pending");
    const list = await owner.ok(staffInvitationsSchema, "GET", invitePath);
    expect(list.items.find((item) => item.id === created.invitation.id)?.branches[0]?.id).toBe(fixture.branchId);
    expect(JSON.stringify(list)).not.toContain(created.token);
    const preview = "/v1/business/invitations/preview";
    const accept = "/v1/business/invitations/accept";
    await as(app, wrong).fail("not_found", "POST", preview, { body: { token: created.token } });
    await as(app, wrong).fail("not_found", "POST", accept, { body: { token: created.token } });
    const details = await person.ok(staffInvitationPreviewSchema, "POST", preview,
      { body: { token: created.token } });
    expect(details.branches[0]?.id).toBe(fixture.branchId);
    await owner.fail("not_found", "PUT", `/v1/business/${fixture.businessId}/members`,
      { body: { userId: wrong.id, role: "staff", active: true } });
    const result = await person.ok(staffInvitationAcceptedSchema, "POST", accept,
      { body: { token: created.token } });
    expect(result.businessId).toBe(fixture.businessId);
    expect((await owner.ok(roster, "GET", `/v1/business/${fixture.businessId}/members`))
      .items.find((member) => member.userId === staff.id)?.role).toBe("staff");
    await person.fail("not_found", "POST", accept, { body: { token: created.token } });
    const access = await person.ok(z.object({ items: z.array(z.string()) }), "GET",
      `/v1/business/${fixture.businessId}/branches/availability-access/me`);
    expect(access.items).toContain(fixture.branchId);
    const orderAccess = await person.ok(z.object({
      viewBranchIds: z.array(z.string()), manageBranchIds: z.array(z.string()),
    }), "GET", `/v1/business/${fixture.businessId}/orders/access/me`);
    expect(orderAccess.viewBranchIds).toContain(fixture.branchId);
    expect(orderAccess.manageBranchIds).not.toContain(fixture.branchId);
  });

  it("iptal, yanlış şube, aşırı yetki ve iki kez kabul reddedilir", async () => {
    const fixture = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const recipient = await createUser(app, "İptal daveti");
    const person = as(app, recipient);
    const path = `/v1/business/${fixture.businessId}/invitations`;
    const body = { phone: recipient.phone, branchIds: [fixture.branchId],
      orderAccess: "manage", canManageAvailability: false };
    await owner.fail("not_found", "POST", path,
      { body: { ...body, branchIds: ["3a3344da-d7bc-4764-ab2b-f22961d67e68"] } });
    await owner.fail("validation_failed", "POST", path,
      { body: { ...body, branchIds: [fixture.branchId, fixture.branchId] } });
    const created = await owner.ok(staffInvitationCreatedSchema, "POST", path, { body });
    await owner.done("POST", `${path}/${created.invitation.id}/revoke`, { body: {} });
    await person.fail("not_found", "POST", "/v1/business/invitations/accept",
      { body: { token: created.token } });
    const second = await owner.ok(staffInvitationCreatedSchema, "POST", path, { body });
    await person.ok(staffInvitationAcceptedSchema, "POST", "/v1/business/invitations/accept",
      { body: { token: second.token } });
    await person.fail("forbidden", "POST", path, { body });
    await person.fail("forbidden", "GET", path);
  });
  it("süresi dolmuş bağlantı, daha önce etkin personel ve yanlış işletme reddedilir", async () => {
    const fixture = await createTenantFixture(app);
    const owner = as(app, fixture.owner);
    const other = await createTenantFixture(app);
    const recipient = await createUser(app, "Süreli davet alıcısı");
    const person = as(app, recipient);
    const path = `/v1/business/${fixture.businessId}/invitations`;
    const request = { phone: recipient.phone, branchIds: [fixture.branchId],
      orderAccess: "view", canManageAvailability: false };
    await owner.fail("not_found", "POST", path,
      { body: { ...request, branchIds: [other.branchId] } });
    const created = await owner.ok(staffInvitationCreatedSchema, "POST", path, { body: request });
    await app.migrationDb.execute(sql`
      update business_staff_invitations set expires_at=now()-interval '1 minute'
      where id=${created.invitation.id}
    `);
    await person.fail("not_found", "POST", "/v1/business/invitations/accept",
      { body: { token: created.token } });
    await app.services.businessManagement.setMember(fixture.scope,
      { userId: recipient.id, role: "staff", active: true });
    await owner.fail("validation_failed", "POST", path, { body: request });
  });

});
