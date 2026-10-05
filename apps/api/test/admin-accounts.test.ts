import {
  adminAccountSchema,
  adminLoginResultSchema,
  adminMeSchema,
  adminOverviewSchema,
  adminRecoveryCodesSchema,
  type AdminRole,
  adminSessionResultSchema,
  adminSessionSchema,
  adminTemporaryPasswordSchema,
  adminTotpSetupSchema,
  listOf,
} from "@vado/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI_ACTOR } from "../src/core/audit";
import { type Database, sql } from "../src/core/database";
import { base32Decode, hotp, totpStep } from "../src/core/totp";
import { createAdminAccountService } from "../src/modules/admin-accounts/admin-accounts.service";
import {
  anonymous,
  asAdmin,
  asAdminSession,
  asPanel,
  startTestApp,
  type TestApp,
} from "./support/harness";

const NEW_PASSWORD = "yeni-ve-uzun-bir-parola";

/** Doğrulama uygulamasının verilen andaki (adım farkıyla) kodu. */
function codeFor(secret: string, offset = 0): string {
  return hotp(base32Decode(secret), totpStep(Date.now()) + offset);
}

describe("panel hesapları", () => {
  let app: TestApp;
  let counter = 0;

  beforeAll(async () => {
    // İkinci adımda gerçek kodlar sınanır: demo modunun 000000 kolaylığı kapalıdır.
    app = await startTestApp({ VADO_DEMO_MODE: "false" });
  });
  afterAll(() => app.stop());

  /** Komut satırının yaptığı gibi hesap açar; geçici parolayla döner. */
  async function openAccount(role: AdminRole = "owner") {
    counter += 1;
    return app.services.adminAccounts.createAccount(CLI_ACTOR, {
      username: `hesap-${role}-${Date.now().toString(36)}-${counter}`,
      displayName: "Sınama Hesabı",
      role,
    });
  }

  async function login(username: string, password: string) {
    return asPanel(app).ok(adminLoginResultSchema, "POST", "/v1/admin/auth/login", {
      body: { username, password },
    });
  }

  /** Hesabı baştan sona açar: giriş, ikinci adımın kurulumu, parola değişikliği. */
  async function activeAccount(role: AdminRole = "owner") {
    const { account, temporaryPassword } = await openAccount(role);
    const pending = await login(account.username, temporaryPassword);
    const setup = await asAdminSession(app, pending.token).ok(
      adminTotpSetupSchema,
      "POST",
      "/v1/admin/auth/totp-setup",
    );
    const session = await asAdminSession(app, pending.token).ok(
      adminSessionResultSchema,
      "POST",
      "/v1/admin/auth/totp-setup/confirm",
      { body: { code: codeFor(setup.secret) } },
    );
    await asAdminSession(app, session.token).done("PUT", "/v1/admin/me/password", {
      body: { currentPassword: temporaryPassword, newPassword: NEW_PASSWORD },
    });
    return { account, secret: setup.secret, token: session.token, session };
  }

  /** Hesabın en son kabul edilen kodu: aynı kod ikinci kez geçmemelidir. */
  async function lastUsedCode(accountId: string, secret: string): Promise<string> {
    const row = await app.db.one<{ step: string }>(sql`
      select totp_last_step as step from admin_accounts where id = ${accountId}
    `);
    return hotp(base32Decode(secret), Number(row.step));
  }

  async function auditActions(accountId: string): Promise<string[]> {
    const rows = await app.db.many<{ action: string }>(sql`
      select action from audit_log where target_type = 'admin_account' and target_id = ${accountId}
      order by id
    `);
    return rows.map((row) => row.action);
  }

  describe("giriş ve ikinci adımın kurulumu", () => {
    it("ilk giriş: geçici parola, ikinci adımın kurulumu, kurtarma kodları ve parola değişikliği", async () => {
      const { account, temporaryPassword } = await openAccount();
      expect(account).toMatchObject({ totpEnabled: false, mustChangePassword: true });
      expect(temporaryPassword).toMatch(/^[a-z2-7]{4}(-[a-z2-7]{4}){5}$/);

      const pending = await login(account.username, temporaryPassword);
      expect(pending.next).toBe("totp_setup");
      const half = asAdminSession(app, pending.token);
      // Yarım oturum yalnızca ikinci adıma yarar.
      await half.fail("admin_session_invalid", "GET", "/v1/admin/me");
      await half.fail("admin_session_invalid", "GET", "/v1/admin/overview");

      const setup = await half.ok(adminTotpSetupSchema, "POST", "/v1/admin/auth/totp-setup");
      expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(setup.uri).toContain(`secret=${setup.secret}`);
      await half.fail("admin_second_factor_invalid", "POST", "/v1/admin/auth/totp-setup/confirm", {
        body: { code: codeFor(setup.secret, 5) },
      });
      const session = await half.ok(
        adminSessionResultSchema,
        "POST",
        "/v1/admin/auth/totp-setup/confirm",
        { body: { code: codeFor(setup.secret) } },
      );
      expect(session.recoveryCodes).toHaveLength(10);
      expect(session.token).not.toBe(pending.token);
      await half.fail("admin_session_invalid", "POST", "/v1/admin/auth/totp-setup");

      const client = asAdminSession(app, session.token);
      const me = await client.ok(adminMeSchema, "GET", "/v1/admin/me");
      expect(me.account).toMatchObject({
        id: account.id,
        totpEnabled: true,
        mustChangePassword: true,
      });
      expect(me.permissions).toContain("accounts.manage");
      // Parola değişmeden hiçbir izin çalışmaz.
      await client.fail("admin_password_change_required", "GET", "/v1/admin/overview");

      await client.fail("admin_password_invalid", "PUT", "/v1/admin/me/password", {
        body: { currentPassword: "yanlış-parola", newPassword: NEW_PASSWORD },
      });
      await client.fail("validation_failed", "PUT", "/v1/admin/me/password", {
        body: { currentPassword: temporaryPassword, newPassword: "kısa" },
      });
      await client.fail("admin_password_reused", "PUT", "/v1/admin/me/password", {
        body: { currentPassword: temporaryPassword, newPassword: temporaryPassword },
      });
      await client.done("PUT", "/v1/admin/me/password", {
        body: { currentPassword: temporaryPassword, newPassword: NEW_PASSWORD },
      });
      await client.ok(adminOverviewSchema, "GET", "/v1/admin/overview");

      expect(await auditActions(account.id)).toEqual([
        "admin.account_created",
        "admin.second_factor_failed",
        "admin.totp_enabled",
        "admin.login",
        "admin.password_changed",
      ]);
    });

    it("ikinci adımı kurulmuş hesap girişte kod ister; aynı kod ikinci kez geçmez", async () => {
      const { account, secret } = await activeAccount();
      const first = await login(account.username, NEW_PASSWORD);
      expect(first.next).toBe("totp");
      // Kurulumda kullanılan kod girişte yeniden kullanılamaz.
      await asAdminSession(app, first.token).fail(
        "admin_second_factor_invalid",
        "POST",
        "/v1/admin/auth/second-factor",
        { body: { code: await lastUsedCode(account.id, secret) } },
      );

      const second = await login(account.username, NEW_PASSWORD);
      const next = codeFor(secret, 1);
      await asAdminSession(app, second.token).ok(
        adminSessionResultSchema,
        "POST",
        "/v1/admin/auth/second-factor",
        { body: { code: next } },
      );
      const third = await login(account.username, NEW_PASSWORD);
      await asAdminSession(app, third.token).fail(
        "admin_second_factor_invalid",
        "POST",
        "/v1/admin/auth/second-factor",
        { body: { code: next } },
      );
    });

    it("kurtarma kodu bir kez geçer; ikinci kullanımı reddedilir", async () => {
      const { account, session } = await activeAccount();
      const [code] = session.recoveryCodes ?? [];
      expect(code).toBeDefined();

      const first = await login(account.username, NEW_PASSWORD);
      await asAdminSession(app, first.token).ok(
        adminSessionResultSchema,
        "POST",
        "/v1/admin/auth/second-factor",
        { body: { recoveryCode: code?.toUpperCase() } },
      );
      const second = await login(account.username, NEW_PASSWORD);
      await asAdminSession(app, second.token).fail(
        "admin_second_factor_invalid",
        "POST",
        "/v1/admin/auth/second-factor",
        { body: { recoveryCode: code } },
      );
      expect(await auditActions(account.id)).toContain("admin.login_recovery_code");
    });

    it("kurtarma kodları güncel kodla yenilenir; eskiler geçersiz olur", async () => {
      const { account, secret, token, session } = await activeAccount();
      const client = asAdminSession(app, token);
      await client.fail("admin_second_factor_invalid", "POST", "/v1/admin/me/recovery-codes", {
        body: { code: codeFor(secret, 5) },
      });
      const renewed = await client.ok(
        adminRecoveryCodesSchema,
        "POST",
        "/v1/admin/me/recovery-codes",
        { body: { code: codeFor(secret, 1) } },
      );
      expect(renewed.recoveryCodes).toHaveLength(10);

      const pending = await login(account.username, NEW_PASSWORD);
      await asAdminSession(app, pending.token).fail(
        "admin_second_factor_invalid",
        "POST",
        "/v1/admin/auth/second-factor",
        { body: { recoveryCode: session.recoveryCodes?.[0] } },
      );
      await asAdminSession(app, pending.token).ok(
        adminSessionResultSchema,
        "POST",
        "/v1/admin/auth/second-factor",
        { body: { recoveryCode: renewed.recoveryCodes[0] } },
      );
    });

    it("yönetici anahtarı olmadan giriş yapılamaz; oturum olmadan yönetim ucu çağrılamaz", async () => {
      await anonymous(app).fail("admin_unauthorized", "POST", "/v1/admin/auth/login", {
        body: { username: "sahip", password: "her-hangi-bir-parola" },
      });
      await asPanel(app).fail("admin_session_invalid", "GET", "/v1/admin/me");
      await asPanel(app).fail("admin_session_invalid", "GET", "/v1/admin/overview");
      // Panel oturumu anahtarsız tek başına yetmez.
      await anonymous(app).fail("admin_unauthorized", "GET", "/v1/admin/overview", {
        headers: { authorization: `Bearer ${app.admins.owner.token}` },
      });
    });
  });

  describe("parola denemeleri", () => {
    it("hesap yok, parola yanlış ve hesap kapalı dışarıdan ayırt edilemez", async () => {
      const { account, temporaryPassword } = await openAccount("support");
      const unknown = await asPanel(app).fail(
        "admin_login_failed",
        "POST",
        "/v1/admin/auth/login",
        {
          body: { username: "boyle-biri-yok", password: temporaryPassword },
        },
      );
      const wrong = await asPanel(app).fail("admin_login_failed", "POST", "/v1/admin/auth/login", {
        body: { username: account.username, password: "yanlış-parola-123" },
      });
      await asAdmin(app).ok(adminAccountSchema, "PATCH", `/v1/admin/accounts/${account.id}`, {
        body: { status: "disabled" },
      });
      const disabled = await asPanel(app).fail(
        "admin_login_failed",
        "POST",
        "/v1/admin/auth/login",
        { body: { username: account.username, password: temporaryPassword } },
      );
      expect(new Set([unknown.message, wrong.message, disabled.message]).size).toBe(1);

      const failed = await app.db.many<{ actor: string }>(sql`
        select actor from audit_log where action = 'admin.login_failed' and target_id = ${account.id}
      `);
      expect(failed).toHaveLength(2);
    });

    it("beş hatalı denemeden sonra hesap kilitlenir; kilitliyken doğru parola da geçmez", async () => {
      const { account, temporaryPassword } = await openAccount("auditor");
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await asPanel(app).fail("admin_login_failed", "POST", "/v1/admin/auth/login", {
          body: { username: account.username, password: `yanlış-parola-${attempt}` },
        });
      }
      await asPanel(app).fail("admin_login_failed", "POST", "/v1/admin/auth/login", {
        body: { username: account.username, password: temporaryPassword },
      });
      const accounts = await asAdmin(app).ok(
        listOf(adminAccountSchema),
        "GET",
        "/v1/admin/accounts",
      );
      expect(accounts.items.find((item) => item.id === account.id)?.lockedUntil).not.toBeNull();

      // Kilit süresi dolunca doğru parola yeniden geçer.
      await app.db.execute(sql`
        update admin_accounts set locked_until = now() - interval '1 second' where id = ${account.id}
      `);
      expect((await login(account.username, temporaryPassword)).next).toBe("totp_setup");
    });

    it("beşinci hatalı denemede hesap hemen kilitlenir", async () => {
      const { account } = await openAccount("auditor");
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await asPanel(app).fail("admin_login_failed", "POST", "/v1/admin/auth/login", {
          body: { username: account.username, password: `yanlış-parola-${attempt}` },
        });
      }
      const row = await app.db.one<{ locked: boolean }>(sql`
        select coalesce(locked_until > now(), false) as locked
        from admin_accounts where id = ${account.id}
      `);
      expect(row.locked).toBe(true);
    });

    it("ikinci adımdaki hatalı kodlar da sayılır ve hesabı kilitler", async () => {
      const { account, secret } = await activeAccount("reviewer");
      const pending = await login(account.username, NEW_PASSWORD);
      const half = asAdminSession(app, pending.token);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await half.fail("admin_second_factor_invalid", "POST", "/v1/admin/auth/second-factor", {
          body: { code: codeFor(secret, 10 + attempt) },
        });
      }
      await half.fail("admin_second_factor_invalid", "POST", "/v1/admin/auth/second-factor", {
        body: { code: codeFor(secret, 1) },
      });
      await asPanel(app).fail("admin_login_failed", "POST", "/v1/admin/auth/login", {
        body: { username: account.username, password: NEW_PASSWORD },
      });
      expect(await auditActions(account.id)).toContain("admin.second_factor_failed");
    });

    it("eş zamanlı hatalı denemeler de hesabı kilitler", async () => {
      const { account } = await openAccount("auditor");
      const responses = await Promise.all(
        Array.from({ length: 12 }, (_, attempt) =>
          asPanel(app).request("POST", "/v1/admin/auth/login", {
            body: { username: account.username, password: `eş-zamanlı-tahmin-${attempt}` },
          }),
        ),
      );
      expect(responses.every((response) => response.status === 401)).toBe(true);
      const row = await app.db.one<{ locked: boolean }>(sql`
        select locked_until > now() as locked from admin_accounts where id = ${account.id}
      `);
      expect(row.locked).toBe(true);
      const verified = await app.db.one<{ count: number }>(sql`
        select count(*)::int as count from audit_log
        where action = 'admin.login_failed' and target_id = ${account.id}
      `);
      expect(verified.count).toBe(12);
    });
  });

  describe("oturumlar", () => {
    it("oturumlar listelenir, başka tarayıcıdaki oturum uzaktan kapatılır", async () => {
      const { account, secret, token } = await activeAccount();
      const pending = await login(account.username, NEW_PASSWORD);
      const other = await asAdminSession(app, pending.token).ok(
        adminSessionResultSchema,
        "POST",
        "/v1/admin/auth/second-factor",
        { body: { code: codeFor(secret, 1) } },
      );

      const client = asAdminSession(app, token);
      const sessions = await client.ok(listOf(adminSessionSchema), "GET", "/v1/admin/me/sessions");
      expect(sessions.items).toHaveLength(2);
      const remote = sessions.items.find((session) => !session.current);
      expect(remote).toBeDefined();
      await client.done("DELETE", `/v1/admin/me/sessions/${remote?.id}`);
      await asAdminSession(app, other.token).fail("admin_session_invalid", "GET", "/v1/admin/me");
      await client.fail("session_not_found", "DELETE", `/v1/admin/me/sessions/${remote?.id}`);
      // Başka bir hesabın oturumu kapatılamaz.
      await client.fail(
        "session_not_found",
        "DELETE",
        `/v1/admin/me/sessions/${app.admins.owner.sessionId}`,
      );
    });

    it("parola değişince hesabın diğer oturumları kapanır, değiştiren oturum açık kalır", async () => {
      const { account, secret, token } = await activeAccount();
      const pending = await login(account.username, NEW_PASSWORD);
      const other = await asAdminSession(app, pending.token).ok(
        adminSessionResultSchema,
        "POST",
        "/v1/admin/auth/second-factor",
        { body: { code: codeFor(secret, 1) } },
      );
      await asAdminSession(app, token).done("PUT", "/v1/admin/me/password", {
        body: { currentPassword: NEW_PASSWORD, newPassword: `${NEW_PASSWORD}-2` },
      });
      await asAdminSession(app, other.token).fail("admin_session_invalid", "GET", "/v1/admin/me");
      await asAdminSession(app, token).ok(adminMeSchema, "GET", "/v1/admin/me");
    });

    it("kullanılmayan oturum otuz dakikada, kullanılan oturum on iki saatte kapanır", async () => {
      const idle = await activeAccount("auditor");
      await app.db.execute(sql`
        update admin_sessions set last_seen_at = now() - interval '31 minutes'
        where account_id = ${idle.account.id}
      `);
      await asAdminSession(app, idle.token).fail("admin_session_invalid", "GET", "/v1/admin/me");

      const old = await activeAccount("auditor");
      await app.db.execute(sql`
        update admin_sessions set expires_at = now() - interval '1 second'
        where account_id = ${old.account.id}
      `);
      await asAdminSession(app, old.token).fail("admin_session_invalid", "GET", "/v1/admin/me");
    });

    it("aynı kod eş zamanlı iki girişte kullanılırsa yalnızca biri geçer", async () => {
      const { account, secret } = await activeAccount("auditor");
      const [first, second] = await Promise.all([
        login(account.username, NEW_PASSWORD),
        login(account.username, NEW_PASSWORD),
      ]);
      const code = codeFor(secret, 1);
      const responses = await Promise.all(
        [first, second].map((pending) =>
          asAdminSession(app, pending.token).request("POST", "/v1/admin/auth/second-factor", {
            body: { code },
          }),
        ),
      );
      expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    });

    it("hesap veritabanında kapatılırsa açık oturumu da geçmez", async () => {
      const { account, token } = await activeAccount("auditor");
      await app.db.execute(
        sql`update admin_accounts set status = 'disabled' where id = ${account.id}`,
      );
      await asAdminSession(app, token).fail("admin_session_invalid", "GET", "/v1/admin/me");
    });

    it("çıkış oturumu kapatır", async () => {
      const { token } = await activeAccount("support");
      await asAdminSession(app, token).done("POST", "/v1/admin/auth/logout");
      await asAdminSession(app, token).fail("admin_session_invalid", "GET", "/v1/admin/me");
    });
  });

  describe("hesap yönetimi", () => {
    const owner = () => asAdmin(app);

    it("sahip hesap açar; geçici parola bir kez döner, kullanıcı adı tekrar kullanılamaz", async () => {
      const username = `yeni-${Date.now().toString(36)}`;
      const created = await owner().ok(adminTemporaryPasswordSchema, "POST", "/v1/admin/accounts", {
        body: {
          username: ` ${username.toUpperCase()} `,
          displayName: "Yeni Operatör",
          role: "operator",
        },
      });
      expect(created.account).toMatchObject({
        username,
        role: "operator",
        status: "active",
        totpEnabled: false,
        mustChangePassword: true,
      });
      await owner().fail("admin_username_taken", "POST", "/v1/admin/accounts", {
        body: { username, displayName: "Aynı Ad", role: "support" },
      });
      await owner().fail("validation_failed", "POST", "/v1/admin/accounts", {
        body: { username: "a", displayName: "Kısa", role: "support" },
      });
      await owner().fail("validation_failed", "POST", "/v1/admin/accounts", {
        body: { username: "gecerli-ad", displayName: "Rolü yok", role: "admin" },
      });

      const audit = await app.db.one<{ actor: string }>(sql`
        select actor from audit_log
        where action = 'admin.account_created' and target_id = ${created.account.id}
      `);
      expect(audit.actor).toBe(app.admins.owner.id);
    });

    it("rol değişince hesabın oturumları kapanır; yeni rol yeni girişte geçerli olur", async () => {
      const { account, token } = await activeAccount("support");
      const changed = await owner().ok(
        adminAccountSchema,
        "PATCH",
        `/v1/admin/accounts/${account.id}`,
        {
          body: { role: "auditor" },
        },
      );
      expect(changed.role).toBe("auditor");
      await asAdminSession(app, token).fail("admin_session_invalid", "GET", "/v1/admin/me");
      expect(await auditActions(account.id)).toContain("admin.role_changed");

      // Yalnızca ad değişince oturumlar açık kalır.
      const renamed = await activeAccount("support");
      await owner().ok(adminAccountSchema, "PATCH", `/v1/admin/accounts/${renamed.account.id}`, {
        body: { displayName: "Yeni Ad" },
      });
      await asAdminSession(app, renamed.token).ok(adminMeSchema, "GET", "/v1/admin/me");
    });

    it("parola sıfırlama geçici parola verir, kilidi açar ve oturumları kapatır", async () => {
      const { account, token } = await activeAccount("operator");
      await app.db.execute(sql`
        update admin_accounts set locked_until = now() + interval '10 minutes' where id = ${account.id}
      `);
      const reset = await owner().ok(
        adminTemporaryPasswordSchema,
        "POST",
        `/v1/admin/accounts/${account.id}/password-reset`,
      );
      expect(reset.account).toMatchObject({ mustChangePassword: true, lockedUntil: null });
      await asAdminSession(app, token).fail("admin_session_invalid", "GET", "/v1/admin/me");
      await asPanel(app).fail("admin_login_failed", "POST", "/v1/admin/auth/login", {
        body: { username: account.username, password: NEW_PASSWORD },
      });
      expect((await login(account.username, reset.temporaryPassword)).next).toBe("totp");
      expect(await auditActions(account.id)).toContain("admin.password_reset");
    });

    it("ikinci adımı sıfırlanan hesap bir sonraki girişte yeniden kurar", async () => {
      const { account, token, session } = await activeAccount("operator");
      const reset = await owner().ok(
        adminAccountSchema,
        "POST",
        `/v1/admin/accounts/${account.id}/totp-reset`,
      );
      expect(reset.totpEnabled).toBe(false);
      await asAdminSession(app, token).fail("admin_session_invalid", "GET", "/v1/admin/me");
      const pending = await login(account.username, NEW_PASSWORD);
      expect(pending.next).toBe("totp_setup");
      // Eski kurtarma kodları da silinmiştir.
      await asAdminSession(app, pending.token).fail(
        "admin_session_invalid",
        "POST",
        "/v1/admin/auth/second-factor",
        { body: { recoveryCode: session.recoveryCodes?.[0] } },
      );
    });

    it("son etkin sahip sahiplikten çıkarılamaz ve kapatılamaz", async () => {
      const { account } = await activeAccount("owner");
      const rollback = new Error("Sınama işlemi geri alınır");
      // Diğer sahipler yalnızca bu işlemin içinde kapatılır; işlem sonunda geri alınır ve
      // aynı veritabanını kullanan diğer sınamalar etkilenmez.
      const withOnlyOwner = (run: (tx: Database) => Promise<void>) =>
        expect(
          app.db.transaction(async (tx) => {
            await tx.execute(sql`
              update admin_accounts set status = 'disabled'
              where role = 'owner' and status = 'active' and id <> ${account.id}
            `);
            await run(tx);
            throw rollback;
          }),
        ).rejects.toBe(rollback);

      await withOnlyOwner(async (tx) => {
        const service = createAdminAccountService({ config: app.config, db: tx });
        await expect(
          service.updateAccount(CLI_ACTOR, account.id, { role: "auditor" }),
        ).rejects.toMatchObject({ code: "admin_last_owner" });
        await expect(
          service.updateAccount(CLI_ACTOR, account.id, { status: "disabled" }),
        ).rejects.toMatchObject({ code: "admin_last_owner" });
        // Kural veritabanında da durur: elle yazılmış SQL de son sahibi kaldıramaz.
        await expect(
          tx.execute(sql`update admin_accounts set role = 'auditor' where id = ${account.id}`),
        ).rejects.toThrow(/En az bir etkin sahip/);
      });
      await withOnlyOwner(async (tx) => {
        await expect(
          tx.execute(sql`delete from admin_accounts where id = ${account.id}`),
        ).rejects.toThrow(/En az bir etkin sahip/);
      });

      // Başka bir sahip varken rol değiştirilebilir.
      const changed = await app.services.adminAccounts.updateAccount(CLI_ACTOR, account.id, {
        role: "auditor",
      });
      expect(changed.role).toBe("auditor");
    });

    it("olmayan hesap için 404 döner", async () => {
      const missing = "00000000-0000-4000-8000-000000000000";
      await owner().fail("admin_account_not_found", "PATCH", `/v1/admin/accounts/${missing}`, {
        body: { role: "support" },
      });
      await owner().fail(
        "admin_account_not_found",
        "POST",
        `/v1/admin/accounts/${missing}/totp-reset`,
      );
      await owner().fail(
        "admin_account_not_found",
        "POST",
        `/v1/admin/accounts/${missing}/password-reset`,
      );
    });
  });
});

describe("panel hesapları (demo modu)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.stop());

  it("demo modunda ikinci adımda 000000 kodu geçer", async () => {
    const { account, temporaryPassword } = await app.services.adminAccounts.createAccount(
      CLI_ACTOR,
      { username: `demo-${Date.now().toString(36)}`, displayName: "Demo Hesabı", role: "owner" },
    );
    const pending = await asPanel(app).ok(adminLoginResultSchema, "POST", "/v1/admin/auth/login", {
      body: { username: account.username, password: temporaryPassword },
    });
    await asAdminSession(app, pending.token).ok(
      adminTotpSetupSchema,
      "POST",
      "/v1/admin/auth/totp-setup",
    );
    const session = await asAdminSession(app, pending.token).ok(
      adminSessionResultSchema,
      "POST",
      "/v1/admin/auth/totp-setup/confirm",
      { body: { code: "000000" } },
    );
    expect(session.recoveryCodes).toHaveLength(10);
  });
});
