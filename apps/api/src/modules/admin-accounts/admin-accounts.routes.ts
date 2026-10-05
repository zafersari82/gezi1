import {
  ADMIN_CLIENT_AGENT_HEADER,
  ADMIN_CLIENT_IP_HEADER,
  adminChangePasswordBodySchema,
  adminCreateAccountBodySchema,
  adminLoginBodySchema,
  adminSecondFactorBodySchema,
  adminTotpConfirmBodySchema,
  adminUpdateAccountBodySchema,
} from "@vado/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { adminAccess, idParamsSchema, noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";
import type { ClientInfo } from "./admin-accounts.service";

const USER_AGENT_MAX_LENGTH = 200;

/** Giriş denemeleri genel sınırdan daha sıkı bir istek sınırına tabidir. */
const LOGIN_RATE_LIMIT = { rateLimit: { max: 30, timeWindow: "1 minute" } };

function header(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name];
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Yöneticinin tarayıcısı: panel sunucusu IP adresini ve tarayıcı bilgisini başlıkla iletir.
 * Bu başlıklara yalnızca yönetici anahtarı doğrulandıktan sonra (guard çağrısından sonra) bakılır.
 */
function clientOf(request: FastifyRequest): ClientInfo {
  const userAgent = header(request, ADMIN_CLIENT_AGENT_HEADER) ?? header(request, "user-agent");
  return {
    ip: header(request, ADMIN_CLIENT_IP_HEADER) ?? request.ip,
    userAgent: userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
  };
}

/** Panel hesabının girişi, kendi hesabı ve (yalnızca sahibin yaptığı) hesap yönetimi. */
export function adminAccountRoutes(
  server: FastifyInstance,
  { services, adminGuard, adminKeyGuard }: RouteContext,
): void {
  const { adminAccounts } = services;

  // -- Giriş ----------------------------------------------------------------

  server.post(
    "/v1/admin/auth/login",
    { config: { admin: "public", ...LOGIN_RATE_LIMIT } },
    (request) => {
      adminKeyGuard(request);
      const body = parse(adminLoginBodySchema, request.body);
      return adminAccounts.login(body, clientOf(request));
    },
  );

  server.post(
    "/v1/admin/auth/second-factor",
    { config: { admin: "second_factor", ...LOGIN_RATE_LIMIT } },
    async (request) => {
      const pending = await adminGuard(request);
      const body = parse(adminSecondFactorBodySchema, request.body);
      return adminAccounts.verifySecondFactor(pending, body, clientOf(request));
    },
  );

  server.post("/v1/admin/auth/totp-setup", adminAccess("second_factor"), async (request) => {
    const pending = await adminGuard(request);
    return adminAccounts.startTotpSetup(pending);
  });

  server.post(
    "/v1/admin/auth/totp-setup/confirm",
    { config: { admin: "second_factor", ...LOGIN_RATE_LIMIT } },
    async (request) => {
      const pending = await adminGuard(request);
      const body = parse(adminTotpConfirmBodySchema, request.body);
      return adminAccounts.confirmTotpSetup(pending, body.code, clientOf(request));
    },
  );

  server.post("/v1/admin/auth/logout", adminAccess("session"), async (request, reply) => {
    const context = await adminGuard(request);
    await adminAccounts.logout(context);
    return noContent(reply);
  });

  // -- Kendi hesabım --------------------------------------------------------

  server.get("/v1/admin/me", adminAccess("session"), async (request) => {
    const context = await adminGuard(request);
    return adminAccounts.me(context);
  });

  server.put("/v1/admin/me/password", adminAccess("session"), async (request, reply) => {
    const context = await adminGuard(request);
    const body = parse(adminChangePasswordBodySchema, request.body);
    await adminAccounts.changePassword(context, body);
    return noContent(reply);
  });

  server.get("/v1/admin/me/sessions", adminAccess("session"), async (request) => {
    const context = await adminGuard(request);
    return { items: await adminAccounts.listSessions(context) };
  });

  server.delete("/v1/admin/me/sessions/:id", adminAccess("session"), async (request, reply) => {
    const context = await adminGuard(request);
    const { id } = parse(idParamsSchema, request.params);
    await adminAccounts.revokeSession(context, id);
    return noContent(reply);
  });

  server.post("/v1/admin/me/recovery-codes", adminAccess("session"), async (request) => {
    const context = await adminGuard(request);
    const body = parse(adminTotpConfirmBodySchema, request.body);
    return adminAccounts.regenerateRecoveryCodes(context, body.code);
  });

  // -- Hesap yönetimi -------------------------------------------------------

  server.get("/v1/admin/accounts", adminAccess("accounts.manage"), async (request) => {
    await adminGuard(request);
    return { items: await adminAccounts.listAccounts() };
  });

  server.post("/v1/admin/accounts", adminAccess("accounts.manage"), async (request) => {
    const { actor } = await adminGuard(request);
    const body = parse(adminCreateAccountBodySchema, request.body);
    return adminAccounts.createAccount(actor, body);
  });

  server.patch("/v1/admin/accounts/:id", adminAccess("accounts.manage"), async (request) => {
    const { actor } = await adminGuard(request);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(adminUpdateAccountBodySchema, request.body);
    return adminAccounts.updateAccount(actor, id, body);
  });

  server.post(
    "/v1/admin/accounts/:id/password-reset",
    adminAccess("accounts.manage"),
    async (request) => {
      const { actor } = await adminGuard(request);
      const { id } = parse(idParamsSchema, request.params);
      return adminAccounts.resetPassword(actor, id);
    },
  );

  server.post(
    "/v1/admin/accounts/:id/totp-reset",
    adminAccess("accounts.manage"),
    async (request) => {
      const { actor } = await adminGuard(request);
      const { id } = parse(idParamsSchema, request.params);
      return adminAccounts.resetTotp(actor, id);
    },
  );
}
