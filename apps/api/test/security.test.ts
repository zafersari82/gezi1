import {
  type AuthResult,
  authResultSchema,
  listOf,
  meSchema,
  requestOtpResponseSchema,
  sessionSchema,
  TERMS_VERSION,
  verificationStatusSchema,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "../src/core/database";
import {
  anonymous,
  as,
  type Client,
  createUser,
  randomPhone,
  startTestApp,
  type TestApp,
  withToken,
} from "./support/harness";

const DEVICE_A = "cihaz-a-0000-0000-0001";
const DEVICE_B = "cihaz-b-0000-0000-0002";

/** Giriş yapmış bir cihaz: giriş yanıtı, oturum kimliği ve o oturumla istek gönderen istemci. */
interface SignedIn extends AuthResult {
  client: Client;
  sessionId: string;
}

describe("cihaz tanıma ve yeniden doğrulama", () => {
  let app: TestApp;
  let guest: Client;

  beforeAll(async () => {
    app = await startTestApp();
    guest = anonymous(app);
  });
  afterAll(() => app.stop());

  const loginBody = (phone: string, deviceId: string) => ({
    phone,
    code: "000000",
    acceptedTermsVersion: TERMS_VERSION,
    deviceName: "Test Telefonu",
    platform: "android",
    deviceId,
  });

  /** Telefon numarasıyla, verilen cihazdan giriş yapar (demo modunda kod 000000). */
  async function signIn(phone: string, deviceId: string, ip = "10.1.1.1"): Promise<SignedIn> {
    await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", { body: { phone }, ip });
    const result = await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", {
      body: loginBody(phone, deviceId),
      ip,
    });
    const client = withToken(app, result.token);
    const sessions = await client.ok(listOf(sessionSchema), "GET", "/v1/auth/sessions");
    const current = sessions.items.find((session) => session.current);
    if (current === undefined) throw new Error("geçerli oturum listede yok");
    return { ...result, client, sessionId: current.id };
  }

  /** Oturumun son doğrulamasını geçmişe taşır; on dakikalık süre dolmuş olur. */
  async function expireVerification(sessionId: string): Promise<void> {
    await app.db.execute(sql`
      update sessions set verified_at = now() - interval '11 minutes' where id = ${sessionId}
    `);
  }

  /** Yeni cihazın "yeni" sayıldığı 24 saati geçmişe taşır. */
  async function ageSession(sessionId: string): Promise<void> {
    await app.db.execute(sql`
      update sessions set created_at = now() - interval '25 hours' where id = ${sessionId}
    `);
  }

  it("ilk girişte cihazı ve IP adresini kaydeder; ilk cihaz yeni cihaz sayılmaz", async () => {
    const first = await signIn(randomPhone(), DEVICE_A, "10.1.1.1");

    const sessions = await first.client.ok(listOf(sessionSchema), "GET", "/v1/auth/sessions");
    expect(sessions.items).toMatchObject([{ current: true, ip: "10.1.1.1", newDevice: false }]);
    const status = await first.client.ok(verificationStatusSchema, "GET", "/v1/auth/verification");
    expect(status).toEqual({ verified: true, deviceKeyAllowed: true });
  });

  it("tanımadığı cihazdan girişi yeni cihaz sayar, aynı cihazdan yeniden girişi saymaz", async () => {
    const phone = randomPhone();
    const first = await signIn(phone, DEVICE_A);
    const second = await signIn(phone, DEVICE_B, "10.2.2.2");
    await signIn(phone, DEVICE_A);

    const sessions = await first.client.ok(listOf(sessionSchema), "GET", "/v1/auth/sessions");
    expect(
      sessions.items.filter((session) => session.newDevice).map((session) => session.id),
    ).toEqual([second.sessionId]);

    const audit = await app.db.many<{ target_id: string; metadata: { ip: string } }>(sql`
      select target_id, metadata from audit_log
      where action = 'auth.new_device' and actor = ${first.user.id}
    `);
    expect(audit).toMatchObject([{ target_id: second.sessionId, metadata: { ip: "10.2.2.2" } }]);
  });

  it("yeni cihazda giriş kodu hassas işleme yetmez; ayrı bir onay kodu ister", async () => {
    const phone = randomPhone();
    const known = await signIn(phone, DEVICE_A);
    const intruder = await signIn(phone, DEVICE_B);

    const status = await intruder.client.ok(
      verificationStatusSchema,
      "GET",
      "/v1/auth/verification",
    );
    expect(status).toEqual({ verified: false, deviceKeyAllowed: false });
    await intruder.client.fail(
      "verification_required",
      "DELETE",
      `/v1/auth/sessions/${known.sessionId}`,
    );
    await intruder.client.fail("verification_required", "DELETE", "/v1/me");
    await intruder.client.fail("device_key_rejected", "POST", "/v1/auth/verification/device", {
      body: { deviceKey: intruder.deviceKey },
    });

    // Tanınan cihaz, yeni cihazın oturumunu yeniden sormadan kapatabilir.
    await known.client.done("DELETE", `/v1/auth/sessions/${intruder.sessionId}`);
    await intruder.client.fail("unauthorized", "GET", "/v1/me");
  });

  it("yeni cihaz onay koduyla doğrulanır; bir gün sonra cihaz anahtarı da kabul edilir", async () => {
    const phone = randomPhone();
    const known = await signIn(phone, DEVICE_A);
    const fresh = await signIn(phone, DEVICE_B);

    await fresh.client.ok(requestOtpResponseSchema, "POST", "/v1/auth/verification/otp");
    await fresh.client.fail("otp_invalid", "POST", "/v1/auth/verification/otp/confirm", {
      body: { code: "111111" },
    });
    await fresh.client.done("POST", "/v1/auth/verification/otp/confirm", {
      body: { code: "000000" },
    });
    await fresh.client.done("DELETE", `/v1/auth/sessions/${known.sessionId}`);

    await expireVerification(fresh.sessionId);
    await ageSession(fresh.sessionId);
    const status = await fresh.client.ok(verificationStatusSchema, "GET", "/v1/auth/verification");
    expect(status).toEqual({ verified: false, deviceKeyAllowed: true });
    await fresh.client.done("POST", "/v1/auth/verification/device", {
      body: { deviceKey: fresh.deviceKey },
    });
  });

  it("tanınan cihazda doğrulama eskiyince cihaz anahtarıyla yenilenir", async () => {
    const phone = randomPhone();
    const device = await signIn(phone, DEVICE_A);
    await expireVerification(device.sessionId);

    await device.client.fail("verification_required", "DELETE", "/v1/me");
    await device.client.fail("device_key_rejected", "POST", "/v1/auth/verification/device", {
      body: { deviceKey: "x".repeat(43) },
    });
    await device.client.done("POST", "/v1/auth/verification/device", {
      body: { deviceKey: device.deviceKey },
    });
    await device.client.done("DELETE", "/v1/me");
  });

  it("giriş kodu işlem onayında, onay kodu girişte geçmez", async () => {
    const phone = randomPhone();
    const device = await signIn(phone, DEVICE_A);

    // Yalnızca giriş kodu istenmişken işlem onayı denenir.
    await guest.ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", { body: { phone } });
    await device.client.fail("otp_invalid", "POST", "/v1/auth/verification/otp/confirm", {
      body: { code: "000000" },
    });
    await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", {
      body: loginBody(phone, DEVICE_A),
    });

    // Yalnızca işlem onay kodu istenmişken giriş denenir.
    await device.client.ok(requestOtpResponseSchema, "POST", "/v1/auth/verification/otp");
    await guest.fail("otp_invalid", "POST", "/v1/auth/otp/verify", {
      body: loginBody(phone, DEVICE_B),
    });
    await device.client.done("POST", "/v1/auth/verification/otp/confirm", {
      body: { code: "000000" },
    });
  });

  it("kendi oturumunu kapatmak doğrulama istemez", async () => {
    const device = await signIn(randomPhone(), DEVICE_A);
    await expireVerification(device.sessionId);

    await device.client.done("DELETE", `/v1/auth/sessions/${device.sessionId}`);
  });

  it("kullanılan oturum kendiliğinden uzar ve son IP adresi güncellenir", async () => {
    const device = await signIn(randomPhone(), DEVICE_A, "10.1.1.1");
    await app.db.execute(sql`
      update sessions
      set expires_at = now() + interval '1 hour', last_seen_at = now() - interval '10 minutes'
      where id = ${device.sessionId}
    `);

    await device.client.ok(meSchema, "GET", "/v1/me", { ip: "10.9.9.9" });

    const session = await app.db.one<{ days_left: number; last_ip: string }>(sql`
      select extract(day from expires_at - now())::int as days_left, last_ip
      from sessions where id = ${device.sessionId}
    `);
    expect(session).toEqual({ days_left: 29, last_ip: "10.9.9.9" });
  });
});

describe("gerçek SMS modunda işlem onay kodu", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({ VADO_DEMO_MODE: "false" });
  });
  afterAll(() => app.stop());

  it("kodu hesabın numarasına ayrı bir iletiyle gönderir ve yanıtta göstermez", async () => {
    const user = await createUser(app, "Ayşe");
    const client = as(app, user);

    const sent = await client.ok(requestOtpResponseSchema, "POST", "/v1/auth/verification/otp");
    expect(sent.devCode).toBeUndefined();
    const sms = app.sentSms.find((message) => message.phone === user.phone);
    expect(sms?.purpose).toBe("verify");
    expect(sms?.code).toMatch(/^\d{6}$/);

    await client.done("POST", "/v1/auth/verification/otp/confirm", { body: { code: sms?.code } });
  });
});
