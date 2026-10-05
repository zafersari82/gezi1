import {
  confirmVerificationBodySchema,
  requestOtpBodySchema,
  verifyDeviceBodySchema,
  verifyOtpBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { idParamsSchema, noContent, parse } from "../../core/http";
import type { RouteContext } from "../../routes";

/** Kod isteme ve doğrulama uç noktaları genel sınırdan daha sıkı bir istek sınırına tabidir. */
const OTP_ROUTE_OPTIONS = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

export function authRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { auth } = services;

  server.post("/v1/auth/otp", OTP_ROUTE_OPTIONS, async (request) => {
    const body = parse(requestOtpBodySchema, request.body);
    return auth.requestOtp(body.phone, request.ip);
  });

  server.post("/v1/auth/otp/verify", OTP_ROUTE_OPTIONS, async (request) => {
    const body = parse(verifyOtpBodySchema, request.body);
    return auth.verifyOtp(body, request.ip);
  });

  server.get("/v1/auth/verification", async (request) => {
    const context = await guard(request);
    return auth.verificationStatus(context);
  });

  server.post("/v1/auth/verification/device", async (request, reply) => {
    const context = await guard(request);
    const body = parse(verifyDeviceBodySchema, request.body);
    await auth.verifyWithDeviceKey(context, body.deviceKey);
    return noContent(reply);
  });

  server.post("/v1/auth/verification/otp", OTP_ROUTE_OPTIONS, async (request) => {
    const context = await guard(request);
    return auth.requestVerification(context, request.ip);
  });

  server.post("/v1/auth/verification/otp/confirm", OTP_ROUTE_OPTIONS, async (request, reply) => {
    const context = await guard(request);
    const body = parse(confirmVerificationBodySchema, request.body);
    await auth.confirmVerification(context, body.code);
    return noContent(reply);
  });

  server.post("/v1/auth/logout", async (request, reply) => {
    const { userId, sessionId } = await guard(request);
    await auth.revokeSession(userId, sessionId);
    return noContent(reply);
  });

  server.get("/v1/auth/sessions", async (request) => {
    const context = await guard(request);
    return { items: await auth.listSessions(context) };
  });

  server.delete("/v1/auth/sessions/:id", async (request, reply) => {
    const context = await guard(request);
    const { id } = parse(idParamsSchema, request.params);
    // Başka bir cihazın oturumunu kapatmak hassas işlemdir; kendi oturumunu kapatmak değildir.
    if (id !== context.sessionId) await auth.requireRecentVerification(context);
    await auth.revokeSession(context.userId, id);
    return noContent(reply);
  });
}
