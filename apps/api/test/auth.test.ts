import {
  authResultSchema,
  listOf,
  meSchema,
  otpCooldownDetailsSchema,
  requestOtpResponseSchema,
  sessionSchema,
  TERMS_VERSION,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import { sha256 } from "../src/core/security";
import {
  anonymous,
  as,
  type Client,
  createUser,
  randomPhone,
  startTestApp,
  type TestApp,
} from "./support/harness";

const device = {
  deviceName: "Test Telefonu",
  platform: "android",
  deviceId: "test-cihazi-0000-0001",
} as const;

/** Bekleme süresini beklemeden geçmek için telefonun son kodunu geçmişe taşır. */
async function skipCooldown(app: TestApp, phone: string): Promise<void> {
  await app.db.execute(sql`
    update otp_challenges set created_at = created_at - interval '61 seconds' where phone = ${phone}
  `);
}

describe("demo modunda kimlik doğrulama", () => {
  let app: TestApp;
  let guest: Client;

  beforeAll(async () => {
    app = await startTestApp();
    guest = anonymous(app);
  });
  afterAll(() => app.stop());

  it("kod ister, doğrular ve oturum açar", async () => {
    const phone = randomPhone();
    const otp = await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", {
      body: { phone },
    });
    expect(otp.devCode).toBe("000000");

    const result = await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", {
      body: { phone, code: "000000", acceptedTermsVersion: TERMS_VERSION, ...device },
    });
    expect(result.user.phone).toBe(phone);
    expect(result.user.displayName).toBeNull();

    const me = await guest.ok(meSchema, "GET", "/v1/me", {
      headers: { authorization: `Bearer ${result.token}` },
    });
    expect(me.id).toBe(result.user.id);
  });

  it("farklı biçimde yazılan aynı numarayı tek hesap sayar", async () => {
    const phone = randomPhone();
    const local = `0${phone.slice(3)}`;
    await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", { body: { phone: local } });
    const first = await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", {
      body: { phone: local, code: "000000", acceptedTermsVersion: TERMS_VERSION, ...device },
    });

    // İlk kod kullanıldığı için ikinci cihazdan giriş beklemeden yeni kod isteyebilir.
    await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", { body: { phone } });
    const second = await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", {
      body: { phone, code: "000000", ...device },
    });
    expect(second.user.id).toBe(first.user.id);
  });

  it("geçersiz numarayı reddeder", async () => {
    await guest.fail("invalid_phone", "POST", "/v1/auth/otp", {
      body: { phone: "0212 123 45 67" },
    });
  });

  it("aynı numaraya art arda kod göndermez", async () => {
    const phone = randomPhone();
    await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", { body: { phone } });
    const error = await guest.fail("otp_cooldown", "POST", "/v1/auth/otp", { body: { phone } });
    const { retryInSeconds } = otpCooldownDetailsSchema.parse(error.details);
    expect(retryInSeconds).toBeGreaterThan(55);
    expect(retryInSeconds).toBeLessThanOrEqual(60);
  });

  it("kullanılan kodlar bekleme süresini kaldırır ama on dakikalık sınırı kaldırmaz", async () => {
    const phone = randomPhone();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", { body: { phone } });
      await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", {
        body: { phone, code: "000000", acceptedTermsVersion: TERMS_VERSION, ...device },
      });
    }
    await guest.fail("otp_rate_limited", "POST", "/v1/auth/otp", { body: { phone } });
  });

  it("aynı numaraya on dakikada en fazla beş kod gönderir", async () => {
    const phone = randomPhone();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", { body: { phone } });
      await skipCooldown(app, phone);
    }
    await guest.fail("otp_rate_limited", "POST", "/v1/auth/otp", { body: { phone } });
  });

  it("aynı IP adresinden gelen kod isteklerini sınırlar", async () => {
    const ip = "203.0.113.77";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", {
        body: { phone: randomPhone() },
        ip,
      });
    }
    await guest.fail("otp_rate_limited", "POST", "/v1/auth/otp", {
      body: { phone: randomPhone() },
      ip,
    });
  });

  it("yeni hesapta koşulların onaylanmasını ister", async () => {
    const phone = randomPhone();
    await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", { body: { phone } });
    await guest.fail("terms_not_accepted", "POST", "/v1/auth/otp/verify", {
      body: { phone, code: "000000", ...device },
    });
  });

  it("kodu yalnızca bir kez kabul eder", async () => {
    const phone = randomPhone();
    const body = { phone, code: "000000", acceptedTermsVersion: TERMS_VERSION, ...device };
    await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", { body: { phone } });
    await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", { body });
    await guest.fail("otp_invalid", "POST", "/v1/auth/otp/verify", { body });
  });

  it("süresi dolan kodu reddeder", async () => {
    const phone = randomPhone();
    await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", { body: { phone } });
    await app.db.execute(sql`
      update otp_challenges set expires_at = now() - interval '1 second' where phone = ${phone}
    `);
    await guest.fail("otp_invalid", "POST", "/v1/auth/otp/verify", {
      body: { phone, code: "000000", acceptedTermsVersion: TERMS_VERSION, ...device },
    });
  });

  it("oturumsuz isteği reddeder", async () => {
    await guest.fail("unauthorized", "GET", "/v1/me");
    await guest.fail("unauthorized", "GET", "/v1/me", {
      headers: { authorization: "Bearer gecersiz-belirtec" },
    });
  });
});

describe("gerçek SMS modunda kimlik doğrulama", () => {
  let app: TestApp;
  let guest: Client;

  beforeAll(async () => {
    app = await startTestApp({ VADO_DEMO_MODE: "false" });
    guest = anonymous(app);
  });
  afterAll(() => app.stop());

  it("rastgele kodu SMS ile gönderir ve yanıtta göstermez", async () => {
    const phone = randomPhone();
    const otp = await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", {
      body: { phone },
    });
    expect(otp.devCode).toBeUndefined();

    const sms = app.sentSms.find((message) => message.phone === phone);
    expect(sms?.code).toMatch(/^\d{6}$/);

    const stored = await app.db.one<{ code_hash: string }>(sql`
      select code_hash from otp_challenges where phone = ${phone}
    `);
    expect(stored.code_hash).not.toContain(sms?.code);

    await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", {
      body: { phone, code: sms?.code, acceptedTermsVersion: TERMS_VERSION, ...device },
    });
  });

  it("beş hatalı denemeden sonra doğru kodu da kabul etmez", async () => {
    const phone = randomPhone();
    await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", { body: { phone } });
    const code = app.sentSms.find((message) => message.phone === phone)?.code ?? "";
    const wrong = code === "111111" ? "222222" : "111111";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await guest.fail("otp_invalid", "POST", "/v1/auth/otp/verify", {
        body: { phone, code: wrong, acceptedTermsVersion: TERMS_VERSION, ...device },
      });
    }
    await guest.fail("otp_locked", "POST", "/v1/auth/otp/verify", {
      body: { phone, code, acceptedTermsVersion: TERMS_VERSION, ...device },
    });
  });
});

describe("oturumlar", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.stop());

  it("açık oturumları listeler ve seçilen oturumu kapatır", async () => {
    const user = await createUser(app, "Ayşe");
    const otherToken = "ikinci-cihaz-belirteci";
    const other = await app.db.one<{ id: string }>(sql`
      insert into sessions (user_id, token_hash, device_name, platform, expires_at)
      values (${user.id}, ${sha256(otherToken)}, 'Tablet', 'ios', now() + interval '1 day')
      returning id
    `);

    const client = as(app, user);
    const sessions = await client.ok(listOf(sessionSchema), "GET", "/v1/auth/sessions");
    expect(sessions.items).toHaveLength(2);
    expect(sessions.items.find((session) => session.current)?.id).toBe(user.sessionId);

    await client.done("DELETE", `/v1/auth/sessions/${other.id}`);
    await anonymous(app).fail("unauthorized", "GET", "/v1/me", {
      headers: { authorization: `Bearer ${otherToken}` },
    });
    await client.fail("session_not_found", "DELETE", `/v1/auth/sessions/${other.id}`);
  });

  it("başkasının oturumunu kapatamaz", async () => {
    const ayse = await createUser(app, "Ayşe");
    const mehmet = await createUser(app, "Mehmet");
    await as(app, ayse).fail(
      "session_not_found",
      "DELETE",
      `/v1/auth/sessions/${mehmet.sessionId}`,
    );
    await as(app, mehmet).ok(meSchema, "GET", "/v1/me");
  });

  it("çıkış yapınca belirteç geçersiz olur", async () => {
    const user = await createUser(app, "Zeynep");
    const client = as(app, user);
    await client.done("POST", "/v1/auth/logout");
    await client.fail("unauthorized", "GET", "/v1/me");
  });

  it("süresi dolan oturumu kabul etmez", async () => {
    const user = await createUser(app, "Can");
    await app.db.execute(sql`
      update sessions set expires_at = now() - interval '1 minute' where id = ${user.sessionId}
    `);
    await as(app, user).fail("unauthorized", "GET", "/v1/me");
  });

  it("eski kod ve oturum kayıtlarını temizler", async () => {
    const user = await createUser(app, "Elif");
    await app.db.execute(sql`
      update sessions set revoked_at = now() - interval '40 days' where id = ${user.sessionId}
    `);
    await app.services.auth.purgeExpired();
    const remaining = await app.db.maybeOne(sql`
      select 1 from sessions where id = ${user.sessionId}
    `);
    expect(remaining).toBeNull();
  });
});
