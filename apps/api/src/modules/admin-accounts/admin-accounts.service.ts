import { randomBytes } from "node:crypto";

import {
  ADMIN_ROLE_PERMISSIONS,
  type AdminAccount,
  type AdminAccountStatus,
  type AdminChangePasswordBody,
  type AdminCreateAccountBody,
  type AdminLoginBody,
  type AdminLoginResult,
  type AdminMe,
  type AdminRecoveryCodes,
  type AdminRole,
  type AdminSecondFactorBody,
  type AdminSession,
  type AdminSessionResult,
  type AdminTemporaryPassword,
  type AdminTotpSetup,
  type AdminUpdateAccountBody,
  isScopedRole,
  RECOVERY_CODE_COUNT,
} from "@vado/contracts";

import { ANONYMOUS_ACTOR, recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { type Database, isUniqueViolation, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { AdminContext, AdminSessionStage } from "../../core/http";
import { hashPassword, randomToken, sha256, verifyPassword } from "../../core/security";
import { base32Encode, generateTotpSecret, totpUri, verifyTotp } from "../../core/totp";

/** Parola doğrulandıktan sonra ikinci adımın tamamlanabileceği süre. */
const SECOND_FACTOR_TTL_MINUTES = 10;
/** Kullanılmayan panel oturumunun kapandığı süre. */
const SESSION_IDLE_MINUTES = 30;
/** Kullanılsa da panel oturumunun en uzun ömrü; sonunda yeniden giriş istenir. */
const SESSION_MAX_HOURS = 12;
/** Oturumun "son görülme" zamanı en çok bu sıklıkla yazılır. */
const SESSION_TOUCH_SECONDS = 60;
/** Bu kadar başarısız denemeden (parola ya da ikinci adım) sonra hesap kilitlenir. */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;
/** Demo modunda ikinci adımda bu kod da kabul edilir (SMS kodundaki `000000` gibi). */
const DEMO_TOTP_CODE = "000000";
const TOTP_ISSUER = "VADO Control";

interface AccountRow {
  id: string;
  username: string;
  display_name: string;
  role: AdminRole;
  business_id: string | null;
  business_name: string | null;
  status: AdminAccountStatus;
  must_change_password: boolean;
  totp_enabled_at: Date | null;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_at: Date;
}

const ACCOUNT_COLUMNS = sql`
  a.id, a.username, a.display_name, a.role, a.business_id,
  (select b.name from businesses b where b.id = a.business_id) as business_name,
  a.status, a.must_change_password, a.totp_enabled_at,
  case when a.locked_until > now() then a.locked_until end as locked_until,
  a.last_login_at, a.created_at
`;

interface SessionRow {
  id: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  ip: string | null;
  user_agent: string | null;
}

function toAccount(row: AccountRow): AdminAccount {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    business:
      row.business_id === null ? null : { id: row.business_id, name: row.business_name ?? "" },
    status: row.status,
    totpEnabled: row.totp_enabled_at !== null,
    mustChangePassword: row.must_change_password,
    lockedUntil: row.locked_until?.toISOString() ?? null,
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

/** Kurtarma kodu: 80 bit, okunması kolay olsun diye dörder harflik gruplar (`abcd-efgh-…`). */
function generateRecoveryCode(): string {
  return base32Encode(randomBytes(10)).toLowerCase().match(/.{4}/g)?.join("-") ?? "";
}

/** Geçici parola: 120 bit, elle yazılabilir gruplar hâlinde. */
function generateTemporaryPassword(): string {
  return base32Encode(randomBytes(15)).toLowerCase().match(/.{4}/g)?.join("-") ?? "";
}

/** Kurtarma kodunun saklanan özeti; tireler ve büyük harf yok sayılır. */
function recoveryCodeHash(code: string): string {
  return sha256(code.toLowerCase().replaceAll("-", ""));
}

/** Oturumun hangi ağdan ve tarayıcıdan açıldığı; oturum listesinde gösterilir. */
export interface ClientInfo {
  ip: string;
  userAgent: string | null;
}

/**
 * Yönetim paneli hesapları: parola, iki adımlı doğrulama, oturumlar ve hesap yönetimi.
 *
 * Kimliği API doğrular. Panel, hesabın oturum belirtecini çerezde tutar ve her çağrıda API'ye
 * taşır; hesabın kim olduğuna ve neyi yapabileceğine her istekte burada, veritabanından bakılır.
 */
export function createAdminAccountService({ config, db }: Pick<AppContext, "config" | "db">) {
  // Var olmayan hesapla girişte de bir parola özeti hesaplanır; yanıt süresi hesabın varlığını
  // ele vermez.
  let dummyHash: Promise<string> | null = null;
  const timingDecoy = () => (dummyHash ??= hashPassword(randomToken()));

  async function findAccount(tx: Database, accountId: string): Promise<AdminAccount> {
    const row = await tx.maybeOne<AccountRow>(sql`
      select ${ACCOUNT_COLUMNS} from admin_accounts a where a.id = ${accountId}
    `);
    if (row === null) throw new AppError("admin_account_not_found");
    return toAccount(row);
  }

  async function revokeSessions(tx: Database, accountId: string, except: string | null = null) {
    await tx.execute(sql`
      update admin_sessions set revoked_at = now()
      where account_id = ${accountId}
        and revoked_at is null
        and ${except === null ? sql`true` : sql`id <> ${except}`}
    `);
  }

  /**
   * Bir deneme hakkı ayırır. Sayaç karşılaştırmadan önce artırılır: eş zamanlı tahminler sınırı
   * aşamaz. Sınır dolmuşsa hesap kilitlenir ve deneme reddedilir.
   */
  async function reserveAttempt(accountId: string): Promise<boolean> {
    const row = await db.maybeOne<{ allowed: boolean }>(sql`
      update admin_accounts
      set
        failed_attempts = case
          when failed_attempts >= ${LOGIN_MAX_ATTEMPTS} then 0 else failed_attempts + 1
        end,
        locked_until = case
          when failed_attempts >= ${LOGIN_MAX_ATTEMPTS}
            then now() + make_interval(mins => ${LOGIN_LOCK_MINUTES})
          else locked_until
        end
      where id = ${accountId}
        and status = 'active'
        and (locked_until is null or locked_until <= now())
      returning (locked_until is null or locked_until <= now()) as allowed
    `);
    return row?.allowed === true;
  }

  /** Başarısız denemenin ardından sınır dolduysa hesabı hemen kilitler. */
  async function recordFailure(accountId: string, action: string, ip: string): Promise<void> {
    await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`
        update admin_accounts
        set
          failed_attempts = 0,
          locked_until = now() + make_interval(mins => ${LOGIN_LOCK_MINUTES})
        where id = ${accountId} and failed_attempts >= ${LOGIN_MAX_ATTEMPTS}
      `);
      await recordAudit(tx, {
        actor: accountId,
        action,
        targetType: "admin_account",
        targetId: accountId,
        metadata: { ip, locked: locked > 0 },
      });
    });
  }

  async function openSession(
    tx: Database,
    accountId: string,
    stage: AdminSessionStage,
    client: ClientInfo,
  ): Promise<{ token: string; expiresAt: string }> {
    const token = randomToken();
    const ttl =
      stage === "second_factor"
        ? sql`make_interval(mins => ${SECOND_FACTOR_TTL_MINUTES})`
        : sql`make_interval(hours => ${SESSION_MAX_HOURS})`;
    const row = await tx.one<{ expires_at: Date }>(sql`
      insert into admin_sessions (account_id, token_hash, stage, expires_at, ip, user_agent)
      values (${accountId}, ${sha256(token)}, ${stage}, now() + ${ttl}, ${client.ip}, ${client.userAgent})
      returning expires_at
    `);
    return { token, expiresAt: row.expires_at.toISOString() };
  }

  // -- Giriş ----------------------------------------------------------------

  /**
   * Parolayı doğrular ve yalnızca ikinci adıma yarayan bir yarım oturum açar. Hesap yoksa,
   * kapalıysa, kilitliyse ya da parola yanlışsa hep aynı hata döner.
   */
  async function login(body: AdminLoginBody, client: ClientInfo): Promise<AdminLoginResult> {
    const account = await db.maybeOne<{
      id: string;
      password_hash: string;
      totp_enabled_at: Date | null;
    }>(sql`
      select id, password_hash, totp_enabled_at from admin_accounts where username = ${body.username}
    `);
    if (account === null) {
      await verifyPassword(body.password, await timingDecoy());
      await recordAudit(db, {
        actor: ANONYMOUS_ACTOR,
        action: "admin.login_failed",
        targetType: "admin_account",
        targetId: "-",
        metadata: { ip: client.ip },
      });
      throw new AppError("admin_login_failed");
    }

    const allowed = await reserveAttempt(account.id);
    const matches = await verifyPassword(
      body.password,
      allowed ? account.password_hash : await timingDecoy(),
    );
    if (!allowed || !matches) {
      await recordFailure(account.id, "admin.login_failed", client.ip);
      throw new AppError("admin_login_failed");
    }

    const session = await openSession(db, account.id, "second_factor", client);
    return { ...session, next: account.totp_enabled_at === null ? "totp_setup" : "totp" };
  }

  /** Kodu hesabın sırrıyla doğrular ve kullanılan zaman adımını kaydeder (yeniden kullanılamaz). */
  async function consumeTotp(accountId: string, secret: string, code: string): Promise<boolean> {
    if (config.demoMode && code === DEMO_TOTP_CODE) return true;
    const last = await db.one<{ totp_last_step: string }>(sql`
      select totp_last_step from admin_accounts where id = ${accountId}
    `);
    const step = verifyTotp(secret, code, Date.now(), Number(last.totp_last_step));
    if (step === null) return false;
    const updated = await db.execute(sql`
      update admin_accounts set totp_last_step = ${step}
      where id = ${accountId} and totp_last_step < ${step}
    `);
    return updated > 0;
  }

  /** İkinci adım geçildi: yarım oturum kapanır, yeni belirteçle tam oturum açılır. */
  async function completeLogin(
    tx: Database,
    pending: AdminContext,
    client: ClientInfo,
    action: string,
  ): Promise<{ token: string; expiresAt: string }> {
    await tx.execute(sql`
      update admin_sessions set revoked_at = now() where id = ${pending.sessionId}
    `);
    await tx.execute(sql`
      update admin_accounts
      set failed_attempts = 0, locked_until = null, last_login_at = now()
      where id = ${pending.accountId}
    `);
    const session = await openSession(tx, pending.accountId, "active", client);
    await recordAudit(tx, {
      actor: pending.accountId,
      action,
      targetType: "admin_account",
      targetId: pending.accountId,
      metadata: { ip: client.ip },
    });
    return session;
  }

  async function secretOf(accountId: string, enabled: boolean): Promise<string> {
    const row = await db.one<{ totp_secret: string | null; totp_enabled_at: Date | null }>(sql`
      select totp_secret, totp_enabled_at from admin_accounts where id = ${accountId}
    `);
    if ((row.totp_enabled_at !== null) !== enabled) {
      throw new AppError(enabled ? "admin_session_invalid" : "admin_totp_already_enabled");
    }
    if (row.totp_secret === null) throw new AppError("admin_second_factor_invalid");
    return row.totp_secret;
  }

  /** İkinci adımı doğrulama uygulamasındaki kodla ya da bir kurtarma koduyla geçer. */
  async function verifySecondFactor(
    pending: AdminContext,
    body: AdminSecondFactorBody,
    client: ClientInfo,
  ): Promise<AdminSessionResult> {
    const secret = await secretOf(pending.accountId, true);
    if (!(await reserveAttempt(pending.accountId))) {
      throw new AppError("admin_second_factor_invalid");
    }

    let action = "admin.login";
    let passed: boolean;
    if ("code" in body) {
      passed = await consumeTotp(pending.accountId, secret, body.code);
    } else {
      action = "admin.login_recovery_code";
      const used = await db.execute(sql`
        update admin_recovery_codes set used_at = now()
        where account_id = ${pending.accountId}
          and code_hash = ${recoveryCodeHash(body.recoveryCode)}
          and used_at is null
      `);
      passed = used > 0;
    }
    if (!passed) {
      await recordFailure(pending.accountId, "admin.second_factor_failed", client.ip);
      throw new AppError("admin_second_factor_invalid");
    }

    const session = await db.transaction((tx) => completeLogin(tx, pending, client, action));
    return { ...session, recoveryCodes: null };
  }

  /** İkinci adımın kurulumunu başlatır: yeni bir sır üretir. Kurulum doğrulanana kadar etkin değildir. */
  async function startTotpSetup(pending: AdminContext): Promise<AdminTotpSetup> {
    const secret = generateTotpSecret();
    const updated = await db.execute(sql`
      update admin_accounts set totp_secret = ${secret}, updated_at = now()
      where id = ${pending.accountId} and totp_enabled_at is null
    `);
    if (updated === 0) throw new AppError("admin_totp_already_enabled");
    const account = await findAccount(db, pending.accountId);
    return { secret, uri: totpUri(TOTP_ISSUER, account.username, secret) };
  }

  async function replaceRecoveryCodes(tx: Database, accountId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await tx.execute(sql`delete from admin_recovery_codes where account_id = ${accountId}`);
    await tx.execute(sql`
      insert into admin_recovery_codes (account_id, code_hash)
      select ${accountId}, unnest(${codes.map(recoveryCodeHash)}::text[])
    `);
    return codes;
  }

  /**
   * Kurulumu uygulamadaki ilk kodla doğrular, ikinci adımı etkinleştirir ve oturumu açar.
   * Kurtarma kodları yalnızca bu yanıtta döner.
   */
  async function confirmTotpSetup(
    pending: AdminContext,
    code: string,
    client: ClientInfo,
  ): Promise<AdminSessionResult> {
    const secret = await secretOf(pending.accountId, false);
    if (!(await reserveAttempt(pending.accountId))) {
      throw new AppError("admin_second_factor_invalid");
    }
    if (!(await consumeTotp(pending.accountId, secret, code))) {
      await recordFailure(pending.accountId, "admin.second_factor_failed", client.ip);
      throw new AppError("admin_second_factor_invalid");
    }

    return db.transaction(async (tx) => {
      await tx.execute(sql`
        update admin_accounts set totp_enabled_at = now(), updated_at = now()
        where id = ${pending.accountId}
      `);
      const recoveryCodes = await replaceRecoveryCodes(tx, pending.accountId);
      await recordAudit(tx, {
        actor: pending.accountId,
        action: "admin.totp_enabled",
        targetType: "admin_account",
        targetId: pending.accountId,
      });
      const session = await completeLogin(tx, pending, client, "admin.login");
      return { ...session, recoveryCodes };
    });
  }

  /**
   * Belirteci doğrular ve oturumun sahibini döndürür. Kullanılan oturumun "son görülme" zamanı
   * güncellenir; uzun süre kullanılmayan, süresi dolan ya da hesabı kapatılan oturum geçmez.
   */
  async function authenticate(token: string, stage: AdminSessionStage): Promise<AdminContext> {
    const row = await db.maybeOne<{
      session_id: string;
      account_id: string;
      role: AdminRole;
      business_id: string | null;
      must_change_password: boolean;
      stale: boolean;
    }>(sql`
      select
        s.id as session_id,
        a.id as account_id,
        a.role,
        a.business_id,
        a.must_change_password,
        s.last_seen_at < now() - make_interval(secs => ${SESSION_TOUCH_SECONDS}) as stale
      from admin_sessions s
      join admin_accounts a on a.id = s.account_id
      where s.token_hash = ${sha256(token)}
        and s.stage = ${stage}
        and s.revoked_at is null
        and s.expires_at > now()
        and s.last_seen_at > now() - make_interval(mins => ${SESSION_IDLE_MINUTES})
        and a.status = 'active'
    `);
    if (row === null) throw new AppError("admin_session_invalid");
    if (row.stale) {
      await db.execute(
        sql`update admin_sessions set last_seen_at = now() where id = ${row.session_id}`,
      );
    }
    return {
      actor: row.account_id,
      accountId: row.account_id,
      sessionId: row.session_id,
      role: row.role,
      businessId: row.business_id,
      mustChangePassword: row.must_change_password,
    };
  }

  // -- Kendi hesabım --------------------------------------------------------

  async function me(context: AdminContext): Promise<AdminMe> {
    const account = await findAccount(db, context.accountId);
    return { account, permissions: [...ADMIN_ROLE_PERMISSIONS[account.role]] };
  }

  /** Oturumu kapatır (çıkış). */
  async function logout(context: AdminContext): Promise<void> {
    await db.execute(sql`
      update admin_sessions set revoked_at = now()
      where id = ${context.sessionId} and revoked_at is null
    `);
  }

  /** Parolayı değiştirir; hesabın diğer bütün oturumları kapanır. */
  async function changePassword(
    context: AdminContext,
    body: AdminChangePasswordBody,
  ): Promise<void> {
    const row = await db.one<{ password_hash: string }>(sql`
      select password_hash from admin_accounts where id = ${context.accountId}
    `);
    if (!(await verifyPassword(body.currentPassword, row.password_hash))) {
      throw new AppError("admin_password_invalid");
    }
    if (body.newPassword === body.currentPassword) throw new AppError("admin_password_reused");
    const hash = await hashPassword(body.newPassword);
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        update admin_accounts
        set
          password_hash = ${hash},
          must_change_password = false,
          password_changed_at = now(),
          updated_at = now()
        where id = ${context.accountId}
      `);
      await revokeSessions(tx, context.accountId, context.sessionId);
      await recordAudit(tx, {
        actor: context.actor,
        action: "admin.password_changed",
        targetType: "admin_account",
        targetId: context.accountId,
      });
    });
  }

  async function listSessions(context: AdminContext): Promise<AdminSession[]> {
    const rows = await db.many<SessionRow>(sql`
      select id, created_at, last_seen_at, expires_at, ip, user_agent
      from admin_sessions
      where account_id = ${context.accountId}
        and stage = 'active'
        and revoked_at is null
        and expires_at > now()
        and last_seen_at > now() - make_interval(mins => ${SESSION_IDLE_MINUTES})
      order by last_seen_at desc
    `);
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      ip: row.ip,
      userAgent: row.user_agent,
      current: row.id === context.sessionId,
    }));
  }

  /** Hesabın kendi oturumlarından birini (başka bir tarayıcıdakini) kapatır. */
  async function revokeSession(context: AdminContext, sessionId: string): Promise<void> {
    const revoked = await db.transaction(async (tx) => {
      const count = await tx.execute(sql`
        update admin_sessions set revoked_at = now()
        where id = ${sessionId} and account_id = ${context.accountId} and revoked_at is null
      `);
      if (count > 0) {
        await recordAudit(tx, {
          actor: context.actor,
          action: "admin.session_revoked",
          targetType: "admin_session",
          targetId: sessionId,
        });
      }
      return count;
    });
    if (revoked === 0) throw new AppError("session_not_found");
  }

  /** Kurtarma kodlarını yeniler; eskiler geçersiz olur. Uygulamadaki güncel kodu ister. */
  async function regenerateRecoveryCodes(
    context: AdminContext,
    code: string,
  ): Promise<AdminRecoveryCodes> {
    const secret = await secretOf(context.accountId, true);
    if (!(await consumeTotp(context.accountId, secret, code))) {
      throw new AppError("admin_second_factor_invalid");
    }
    return db.transaction(async (tx) => {
      const recoveryCodes = await replaceRecoveryCodes(tx, context.accountId);
      await recordAudit(tx, {
        actor: context.actor,
        action: "admin.recovery_codes_regenerated",
        targetType: "admin_account",
        targetId: context.accountId,
      });
      return { recoveryCodes };
    });
  }

  // -- Hesap yönetimi -------------------------------------------------------

  async function listAccounts(): Promise<AdminAccount[]> {
    const rows = await db.many<AccountRow>(sql`
      select ${ACCOUNT_COLUMNS} from admin_accounts a
      order by a.status, a.display_name, a.username
    `);
    return rows.map(toAccount);
  }

  /**
   * Yeni hesap açar. Varsayılan parola yoktur: geçici parola rastgele üretilir, yalnızca bu yanıtta
   * döner ve ilk girişte değiştirilir. İkinci adım da ilk girişte kurulur.
   */
  async function createAccount(
    actor: string,
    body: AdminCreateAccountBody,
  ): Promise<AdminTemporaryPassword> {
    const temporaryPassword = generateTemporaryPassword();
    const hash = await hashPassword(temporaryPassword);
    const businessId = body.businessId ?? null;
    try {
      const account = await db.transaction(async (tx) => {
        if (businessId !== null) {
          const business = await tx.maybeOne(
            sql`select 1 from businesses where id = ${businessId}`,
          );
          if (business === null) throw new AppError("business_not_found");
        }
        const { id } = await tx.one<{ id: string }>(sql`
          insert into admin_accounts (username, display_name, role, business_id, password_hash)
          values (${body.username}, ${body.displayName}, ${body.role}, ${businessId}, ${hash})
          returning id
        `);
        await recordAudit(tx, {
          actor,
          action: "admin.account_created",
          targetType: "admin_account",
          targetId: id,
          metadata: {
            username: body.username,
            role: body.role,
            ...(businessId === null ? {} : { businessId }),
          },
        });
        return findAccount(tx, id);
      });
      return { account, temporaryPassword };
    } catch (error) {
      if (isUniqueViolation(error, "admin_accounts_username_key")) {
        throw new AppError("admin_username_taken");
      }
      throw error;
    }
  }

  /**
   * Hesabın adını, rolünü ya da durumunu değiştirir. Rol değişir ya da hesap kapatılırsa açık
   * oturumları kapanır: yeni yetkiler bir sonraki girişte geçerli olur, eski oturum eski yetkiyle
   * kalmaz. Son etkin sahip hesabı sahiplikten çıkarılamaz ve kapatılamaz.
   */
  async function updateAccount(
    actor: string,
    accountId: string,
    body: AdminUpdateAccountBody,
  ): Promise<AdminAccount> {
    return db.transaction(async (tx) => {
      const before = await tx.maybeOne<{ role: AdminRole; status: AdminAccountStatus }>(sql`
        select role, status from admin_accounts where id = ${accountId} for update
      `);
      if (before === null) throw new AppError("admin_account_not_found");
      const role = body.role ?? before.role;
      const status = body.status ?? before.status;
      // Kapsam açılışta belirlenir; işletme hesabı başka role, ekip hesabı işletme rolüne geçemez.
      if (isScopedRole(role) || isScopedRole(before.role)) {
        if (role !== before.role) throw new AppError("admin_scope_change_forbidden");
      }
      if (
        before.role === "owner" &&
        before.status === "active" &&
        (role !== "owner" || status !== "active")
      ) {
        await requireAnotherOwner(tx, accountId);
      }

      await tx.execute(sql`
        update admin_accounts
        set
          display_name = coalesce(${body.displayName ?? null}, display_name),
          role = ${role},
          status = ${status},
          updated_at = now()
        where id = ${accountId}
      `);
      if (role !== before.role || status !== before.status) await revokeSessions(tx, accountId);
      await recordAudit(tx, {
        actor,
        action: role !== before.role ? "admin.role_changed" : "admin.account_updated",
        targetType: "admin_account",
        targetId: accountId,
        metadata: { ...body, previousRole: before.role, previousStatus: before.status },
      });
      return findAccount(tx, accountId);
    });
  }

  /** Sahiplerin satırları kilitlenir; iki sahip birbirini aynı anda çıkaramaz. */
  async function requireAnotherOwner(tx: Database, accountId: string): Promise<void> {
    const others = await tx.many<{ id: string }>(sql`
      select id from admin_accounts
      where role = 'owner' and status = 'active' and id <> ${accountId}
      for update
    `);
    if (others.length === 0) throw new AppError("admin_last_owner");
  }

  /**
   * Parolayı geçici bir parolayla değiştirir, kilidi açar ve oturumları kapatır. Hesap ilk
   * girişte parolasını yeniden belirler. İkinci adım değişmez.
   */
  async function resetPassword(actor: string, accountId: string): Promise<AdminTemporaryPassword> {
    const temporaryPassword = generateTemporaryPassword();
    const hash = await hashPassword(temporaryPassword);
    const account = await db.transaction(async (tx) => {
      const updated = await tx.execute(sql`
        update admin_accounts
        set
          password_hash = ${hash},
          must_change_password = true,
          password_changed_at = now(),
          failed_attempts = 0,
          locked_until = null,
          updated_at = now()
        where id = ${accountId}
      `);
      if (updated === 0) throw new AppError("admin_account_not_found");
      await revokeSessions(tx, accountId);
      await recordAudit(tx, {
        actor,
        action: "admin.password_reset",
        targetType: "admin_account",
        targetId: accountId,
      });
      return findAccount(tx, accountId);
    });
    return { account, temporaryPassword };
  }

  /**
   * İkinci adımı sıfırlar (telefonunu kaybeden yönetici için): sır ve kurtarma kodları silinir,
   * oturumlar kapanır, hesap bir sonraki girişte ikinci adımı yeniden kurar.
   */
  async function resetTotp(actor: string, accountId: string): Promise<AdminAccount> {
    return db.transaction(async (tx) => {
      const updated = await tx.execute(sql`
        update admin_accounts
        set totp_secret = null, totp_enabled_at = null, updated_at = now()
        where id = ${accountId}
      `);
      if (updated === 0) throw new AppError("admin_account_not_found");
      await tx.execute(sql`delete from admin_recovery_codes where account_id = ${accountId}`);
      await revokeSessions(tx, accountId);
      await recordAudit(tx, {
        actor,
        action: "admin.totp_reset",
        targetType: "admin_account",
        targetId: accountId,
      });
      return findAccount(tx, accountId);
    });
  }

  /** Komut satırı hesabı kullanıcı adıyla bulur. */
  async function findByUsername(username: string): Promise<AdminAccount> {
    const row = await db.maybeOne<AccountRow>(sql`
      select ${ACCOUNT_COLUMNS} from admin_accounts a where a.username = ${username}
    `);
    if (row === null) throw new AppError("admin_account_not_found");
    return toAccount(row);
  }

  /** Panele girip hesapları yönetebilecek biri var mı? Yoksa API başlarken uyarır. */
  async function hasActiveOwner(): Promise<boolean> {
    const row = await db.maybeOne(sql`
      select 1 from admin_accounts where role = 'owner' and status = 'active' limit 1
    `);
    return row !== null;
  }

  /** Süresi geçmiş oturum kayıtlarını siler. Düzenli aralıklarla çağrılır. */
  async function purgeExpired(): Promise<void> {
    await db.execute(sql`
      delete from admin_sessions
      where coalesce(revoked_at, expires_at) < now() - interval '30 days'
    `);
  }

  return {
    login,
    verifySecondFactor,
    startTotpSetup,
    confirmTotpSetup,
    authenticate,
    me,
    logout,
    changePassword,
    listSessions,
    revokeSession,
    regenerateRecoveryCodes,
    listAccounts,
    createAccount,
    updateAccount,
    resetPassword,
    resetTotp,
    findByUsername,
    hasActiveOwner,
    purgeExpired,
  };
}

export type AdminAccountService = ReturnType<typeof createAdminAccountService>;
