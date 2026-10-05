import { apiErrorBodySchema, ERROR_CODES, ERROR_MESSAGES } from "@vado/contracts";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppError } from "../src/core/errors";
import { loggerOptions } from "../src/core/http";
import { anonymous, as, createUser, startTestApp, type TestApp } from "./support/harness";

describe("HTTP katmanı", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.stop());

  it("sağlık uç noktası veritabanını da yoklar", async () => {
    const response = await anonymous(app).request("GET", "/health");
    expect(response).toEqual({ status: 200, body: { status: "ok", version: "2.5.0" } });
  });

  it("bilinmeyen adres için sözleşmedeki hata biçimini döndürür", async () => {
    const response = await anonymous(app).request("GET", "/v1/olmayan-adres");
    expect(response.status).toBe(404);
    expect(apiErrorBodySchema.parse(response.body).error).toEqual({
      code: "not_found",
      message: ERROR_MESSAGES.not_found,
    });
  });

  it("doğrulama hatasında hangi alanın hatalı olduğunu bildirir", async () => {
    const user = await createUser(app, "Ayşe");
    const response = await as(app, user).request("PATCH", "/v1/me", { body: { bio: 42 } });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: "validation_failed", details: [{ path: "bio" }] },
    });
  });

  it("doğrulama hatasının nedenini Türkçe yazar", async () => {
    const missing = await anonymous(app).request("POST", "/v1/auth/otp/verify", {
      body: { phone: "0555 000 00 01", code: "000000", deviceName: "Terminal", platform: "web" },
    });
    const { details } = apiErrorBodySchema.parse(missing.body).error;
    expect(details).toMatchObject([{ path: "deviceId" }]);
    expect(JSON.stringify(details)).toMatch(/"message":"Geçersiz/);

    const user = await createUser(app, "Zehra");
    const long = await as(app, user).request("PATCH", "/v1/me", { body: { bio: "a".repeat(500) } });
    const problems = apiErrorBodySchema.parse(long.body).error.details;
    expect(JSON.stringify(problems)).not.toMatch(/Invalid|Too big|expected/);
  });

  it("bozuk JSON gövdesini 400 ile reddeder", async () => {
    const response = await app.server.inject({
      method: "POST",
      url: "/v1/auth/otp",
      headers: { "content-type": "application/json" },
      payload: "{bozuk",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "validation_failed" } });
  });

  it("geçersiz kimlik biçimini veritabanına gitmeden reddeder", async () => {
    const user = await createUser(app, "Mehmet");
    await as(app, user).fail("validation_failed", "GET", "/v1/users/uuid-degil");
    await as(app, user).fail("validation_failed", "GET", "/v1/conversations/1%20or%201=1");
  });

  it("güvenlik başlıklarını ekler ve izinli olmayan kaynağa CORS izni vermez", async () => {
    const allowed = await app.server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:8081" },
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:8081");
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");

    const denied = await app.server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://kotu.example.com" },
    });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("istek günlüğüne adresin sorgu bölümünü yazmaz", async () => {
    const lines: string[] = [];
    const server = Fastify({
      logger: {
        ...loggerOptions("info"),
        stream: {
          write: (line: string) => {
            lines.push(line);
          },
        },
      },
    });
    server.get("/v1/users/search", () => ({ items: [] }));
    await server.inject({ method: "GET", url: "/v1/users/search?q=05551234567" });
    await server.close();

    const log = lines.join("");
    expect(log).toContain('"url":"/v1/users/search"');
    expect(log).not.toContain("05551234567");
  });

  it("her hata kodunun iletisi ve durum kodu tanımlıdır", () => {
    for (const code of ERROR_CODES) {
      const error = new AppError(code);
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.statusCode).toBeGreaterThanOrEqual(400);
    }
  });
});
