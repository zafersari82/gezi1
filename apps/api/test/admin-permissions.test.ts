import { ADMIN_ROLES, type AdminPermission, roleHasPermission } from "@vado/contracts";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { adminAccess, type AdminRoute, collectAdminRoutes } from "../src/core/http";
import { randomToken, sha256 } from "../src/core/security";
import {
  asAdmin,
  asAdminSession,
  asPanel,
  createAdmin,
  startTestApp,
  type TestApp,
} from "./support/harness";

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

/** Uç adresindeki parametreleri biçimce geçerli ama var olmayan değerlerle doldurur. */
function concrete(url: string): string {
  return url
    .replace(":merchantId", "olmayan-satici")
    .replace(":version", "9.9.9")
    .replace("*", "olmayan.js")
    .replace(
      ":id",
      url.startsWith("/v1/admin/packages") || url.startsWith("/v1/admin/miniapps")
        ? "olmayan-kayit"
        : MISSING_ID,
    );
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const isMethod = (method: string): method is Method =>
  ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method);

describe("yönetim uçlarında yetki", () => {
  let app: TestApp;
  let routes: (AdminRoute & { method: Method; permission: AdminPermission })[];

  beforeAll(async () => {
    app = await startTestApp();
    routes = app.adminRoutes.flatMap((route) =>
      isMethod(route.method) &&
      route.access !== "public" &&
      route.access !== "session" &&
      route.access !== "second_factor"
        ? [{ ...route, method: route.method, permission: route.access }]
        : [],
    );
  });
  afterAll(() => app.stop());

  it("bütün yönetim uçları erişimini bildirir; panelin kullandığı uçların hepsi listededir", () => {
    expect(routes.length).toBe(35);
    const listed = app.adminRoutes.map((route) => `${route.method} ${route.url}`);
    for (const route of [
      "GET /v1/admin/overview",
      "POST /v1/admin/packages/:id/versions/:version/approve",
      "POST /v1/admin/miniapps/:id/disable",
      "GET /v1/admin/accounts",
      "POST /v1/admin/auth/login",
      "GET /v1/admin/me",
    ]) {
      expect(listed).toContain(route);
    }
  });

  it("erişimini bildirmeyen yönetim ucu kaydedilemez", async () => {
    const server = Fastify();
    collectAdminRoutes(server);
    expect(() => server.get("/v1/admin/izinsiz", () => "")).toThrow(/erişimi bildirmiyor/);
    server.get("/v1/admin/izinli", adminAccess("audit.read"), () => "");
    server.get("/v1/genel", () => "");
    await server.close();
  });

  it("her uçta, izni olmayan her rol reddedilir", async () => {
    const rows: string[] = [];
    for (const route of routes) {
      for (const role of ADMIN_ROLES) {
        const response = await asAdmin(app, role).request(route.method, concrete(route.url), {
          body: {},
        });
        const allowed = roleHasPermission(role, route.permission);
        const denied = response.status === 403;
        rows.push(`${route.method} ${route.url} ${role}: ${allowed ? "izinli" : "izinsiz"}`);
        expect(denied, `${route.method} ${route.url} — ${role}`).toBe(!allowed);
        expect(response.status, `${route.method} ${route.url} — ${role}`).toBeLessThan(500);
        if (!allowed) expect(response.body).toMatchObject({ error: { code: "forbidden" } });
      }
    }
    expect(rows).toHaveLength(routes.length * ADMIN_ROLES.length);
  });

  it("parolasını değiştirmesi gereken hesap hiçbir izinli uca ulaşamaz", async () => {
    const owner = await createAdmin(app.db, "owner", { mustChangePassword: true });
    for (const route of routes) {
      await asAdminSession(app, owner.token).fail(
        "admin_password_change_required",
        route.method,
        concrete(route.url),
        { body: {} },
      );
    }
  });

  it("oturumsuz istek ve yarım oturum hiçbir uca ulaşamaz", async () => {
    // Parolası geçilmiş ama ikinci adımı yapılmamış oturum.
    const token = randomToken();
    await app.db.execute(sql`
      insert into admin_sessions (account_id, token_hash, stage, expires_at)
      values (${app.admins.owner.id}, ${sha256(token)}, 'second_factor', now() + interval '5 minutes')
    `);
    for (const route of routes) {
      for (const client of [asPanel(app), asAdminSession(app, token)]) {
        await client.fail("admin_session_invalid", route.method, concrete(route.url), {
          body: {},
        });
      }
    }
  });
});
