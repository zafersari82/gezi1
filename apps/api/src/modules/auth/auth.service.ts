import { randomInt } from "node:crypto";

import {
  type AuthResult,
  normalizePhone,
  type OtpCooldownDetails,
  type Platform,
  type RequestOtpResponse,
  type Session,
  TERMS_VERSION,
  type UserStatus,
  type VerificationStatus,
  type VerifyOtpBody,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { AuthContext } from "../../core/http";
import { randomToken, sha256 } from "../../core/security";
import type { OtpPurpose } from "../../providers/sms";
import type { NotificationService } from "../notifications/notifications.service";
import { findMe } from "../users/user-rows";

const OTP_TTL_SECONDS = 300;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_WINDOW_MINUTES = 10;
const OTP_MAX_PER_PHONE = 5;
const OTP_MAX_PER_IP = 20;
const DEMO_OTP_CODE = "000000";

/** Kimlik kanıtlandıktan sonra hassas işlemlerin yeniden sormadan yapılabildiği süre. */
const VERIFICATION_WINDOW_SECONDS = 600;
/** Yeni cihazın "yeni" sayıldığı süre: bu sürede hassas işlemler yalnızca SMS koduyla onaylanır. */
const NEW_DEVICE_HOURS = 24;

interface SessionRow {
  id: string;
  device_name: string;
  platform: Platform;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  last_ip: string | null;
  recently_new_device: boolean;
}

export function createAuthService(
  { config, db, keys, sms, storage, realtime }: AppContext,
  { notifications }: { notifications: NotificationService },
) {
  function requirePhone(input: string): string {
    const phone = normalizePhone(input);
    if (phone === null) throw new AppError("invalid_phone");
    return phone;
  }

  /** İmzaya amaç da girer: giriş için üretilen kod işlem onayında, onay kodu girişte geçmez. */
  const otpText = (purpose: OtpPurpose, phone: string, code: string) =>
    `${purpose}:${phone}:${code}`;

  /** Yeni cihazın "yeni" sayıldığı sürenin içinde mi? `sessions` satırı üzerinde çalışır. */
  const recentlyNewDevice = sql`(new_device and created_at > now() - make_interval(hours => ${NEW_DEVICE_HOURS}))`;

  /**
   * Doğrulama kodu üretir ve gönderir. Telefon ve IP başına istek sayısı sınırlıdır.
   * Numaraya aynı amaçla gönderilmiş ve henüz kullanılmamış bir kod varken kısa süre yeni kod
   * gönderilmez; kod kullanıldıysa (ör. ikinci cihazdan giriş) beklemeye gerek yoktur.
   */
  async function issueOtp(
    phone: string,
    ip: string,
    purpose: OtpPurpose,
  ): Promise<RequestOtpResponse> {
    const recent = await db.one<{
      by_phone: number;
      by_ip: number;
      seconds_since_pending: number | null;
    }>(sql`
      select
        count(*) filter (where phone = ${phone}) as by_phone,
        count(*) filter (where request_ip = ${ip}) as by_ip,
        extract(
          epoch from now() - max(created_at) filter (
            where phone = ${phone} and purpose = ${purpose} and consumed_at is null
          )
        )::int as seconds_since_pending
      from otp_challenges
      where created_at > now() - make_interval(mins => ${OTP_WINDOW_MINUTES})
        and (phone = ${phone} or request_ip = ${ip})
    `);
    if (
      recent.seconds_since_pending !== null &&
      recent.seconds_since_pending < OTP_RESEND_SECONDS
    ) {
      throw new AppError("otp_cooldown", {
        retryInSeconds: OTP_RESEND_SECONDS - recent.seconds_since_pending,
      } satisfies OtpCooldownDetails);
    }
    if (recent.by_phone >= OTP_MAX_PER_PHONE || recent.by_ip >= OTP_MAX_PER_IP) {
      throw new AppError("otp_rate_limited");
    }

    const code = config.demoMode
      ? DEMO_OTP_CODE
      : randomInt(0, 1_000_000).toString().padStart(6, "0");
    await db.execute(sql`
      insert into otp_challenges (phone, purpose, code_hash, request_ip, expires_at)
      values (
        ${phone},
        ${purpose},
        ${keys.otp.sign(otpText(purpose, phone, code))},
        ${ip},
        now() + make_interval(secs => ${OTP_TTL_SECONDS})
      )
    `);
    if (!config.demoMode) await sms.sendOtp(phone, code, purpose);

    return {
      expiresInSeconds: OTP_TTL_SECONDS,
      resendInSeconds: OTP_RESEND_SECONDS,
      ...(config.demoMode ? { devCode: code } : {}),
    };
  }

  /** Giriş kodu ister. */
  function requestOtp(rawPhone: string, ip: string): Promise<RequestOtpResponse> {
    return issueOtp(requirePhone(rawPhone), ip, "login");
  }

  /** Kodu tüketir; hatalıysa, süresi dolmuşsa ya da başka amaçla istenmişse hata fırlatır. */
  async function consumeOtp(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    // Deneme sayacı karşılaştırmadan önce artırılır; eş zamanlı tahminler sınırı aşamaz.
    const challenge = await db.maybeOne<{ id: string; code_hash: string; attempts: number }>(sql`
      update otp_challenges
      set attempts = attempts + 1
      where id = (
        select id from otp_challenges
        where phone = ${phone}
          and purpose = ${purpose}
          and consumed_at is null
          and expires_at > now()
        order by created_at desc
        limit 1
      )
      returning id, code_hash, attempts
    `);
    if (challenge === null) throw new AppError("otp_invalid");
    if (challenge.attempts > OTP_MAX_ATTEMPTS) throw new AppError("otp_locked");
    if (keys.otp.verify(otpText(purpose, phone, code), challenge.code_hash) === null) {
      throw new AppError("otp_invalid");
    }

    const consumed = await db.execute(sql`
      update otp_challenges set consumed_at = now()
      where id = ${challenge.id} and consumed_at is null
    `);
    if (consumed === 0) throw new AppError("otp_invalid");
  }

  /** Kodu doğrular; hesap yoksa oluşturur ve yeni bir oturum açar. */
  async function verifyOtp(body: VerifyOtpBody, ip: string): Promise<AuthResult> {
    const phone = requirePhone(body.phone);
    await consumeOtp(phone, body.code, "login");

    const opened = await db.transaction(async (tx) => {
      let account = await tx.maybeOne<{ id: string; status: UserStatus }>(sql`
        select id, status from users where phone = ${phone}
      `);
      if (account === null) {
        if (body.acceptedTermsVersion !== TERMS_VERSION) throw new AppError("terms_not_accepted");
        account = await tx.one(sql`
          insert into users (phone, terms_version, terms_accepted_at)
          values (${phone}, ${TERMS_VERSION}, now())
          returning id, status
        `);
      }
      if (account.status !== "active") throw new AppError("account_suspended");

      // Hesabın başka oturumları varken bu cihaz hiç görülmemişse giriş "yeni cihaz" sayılır.
      // İlk girişte karşılaştıracak cihaz yoktur; o giriş yeni cihaz sayılmaz.
      const { new_device: newDevice } = await tx.one<{ new_device: boolean }>(sql`
        select
          exists (select 1 from sessions where user_id = ${account.id})
          and not exists (
            select 1 from sessions where user_id = ${account.id} and device_id = ${body.deviceId}
          ) as new_device
      `);

      const token = randomToken();
      const deviceKey = randomToken();
      const session = await tx.one<{ id: string; expires_at: Date }>(sql`
        insert into sessions (
          user_id, token_hash, device_name, platform, device_id, new_device,
          created_ip, last_ip, verified_at, device_key_hash, expires_at
        )
        values (
          ${account.id},
          ${sha256(token)},
          ${body.deviceName},
          ${body.platform},
          ${body.deviceId},
          ${newDevice},
          ${ip},
          ${ip},
          -- Yeni cihazda giriş kodu hassas işlemlere yetmez; onlar için ayrı bir kod istenir.
          case when ${newDevice} then null else now() end,
          ${sha256(deviceKey)},
          now() + make_interval(days => ${config.sessionDays})
        )
        returning id, expires_at
      `);
      if (newDevice) {
        await recordAudit(tx, {
          actor: account.id,
          action: "auth.new_device",
          targetType: "session",
          targetId: session.id,
          metadata: { deviceName: body.deviceName, platform: body.platform, ip },
        });
      }

      const user = await findMe(tx, storage, account.id);
      if (user === null) throw new AppError("unauthorized");
      return {
        eventId: newDevice ? await notifications.enqueueNewDevice(tx, session.id) : null,
        newDevice,
        sessionId: session.id,
        result: { token, expiresAt: session.expires_at.toISOString(), deviceKey, user },
      };
    });

    if (opened.newDevice) {
      realtime.emit([opened.result.user.id], "session:new-device", {
        sessionId: opened.sessionId,
        deviceName: body.deviceName,
      });
      notifications.kick(opened.eventId);
    }
    return opened.result;
  }

  /**
   * Oturum belirtecini doğrular. Her istekte ve her gerçek zamanlı bağlantıda çağrılır.
   * Kullanılan oturum kendiliğinden uzar; yalnızca kullanılmayan cihazın oturumu sona erer.
   */
  async function authenticate(token: string, ip: string | null = null): Promise<AuthContext> {
    const row = await db.maybeOne<{
      session_id: string;
      user_id: string;
      status: UserStatus;
      stale: boolean;
    }>(sql`
      select
        s.id as session_id,
        s.user_id,
        u.status,
        s.last_seen_at < now() - interval '5 minutes' as stale
      from sessions s
      join users u on u.id = s.user_id
      where s.token_hash = ${sha256(token)} and s.revoked_at is null and s.expires_at > now()
    `);
    if (row === null) throw new AppError("unauthorized");
    if (row.status === "suspended") throw new AppError("account_suspended");
    if (row.status !== "active") throw new AppError("unauthorized");

    if (row.stale) {
      await db.execute(sql`
        update sessions
        set
          last_seen_at = now(),
          last_ip = coalesce(${ip}, last_ip),
          expires_at = now() + make_interval(days => ${config.sessionDays})
        where id = ${row.session_id}
      `);
    }
    return { userId: row.user_id, sessionId: row.session_id };
  }

  /**
   * Hassas işlemlerden (ödeme onayı, hesap silme, başka oturumu kapatma) önce çağrılır:
   * kimlik yakın zamanda kanıtlanmamışsa `verification_required` fırlatır.
   */
  async function requireRecentVerification(auth: AuthContext): Promise<void> {
    const { verified } = await verificationStatus(auth);
    if (!verified) throw new AppError("verification_required");
  }

  async function verificationStatus(auth: AuthContext): Promise<VerificationStatus> {
    const row = await db.one<{ verified: boolean; device_key_allowed: boolean }>(sql`
      select
        coalesce(
          verified_at > now() - make_interval(secs => ${VERIFICATION_WINDOW_SECONDS}),
          false
        ) as verified,
        device_key_hash is not null and not ${recentlyNewDevice} as device_key_allowed
      from sessions
      where id = ${auth.sessionId}
    `);
    return { verified: row.verified, deviceKeyAllowed: row.device_key_allowed };
  }

  /**
   * Cihazda saklanan anahtarla kimliği yeniden kanıtlar. Uygulama anahtarı ancak parmak izi, yüz
   * ya da cihaz şifresi sorulduktan sonra gönderir. Yeni cihazda ilk gün kabul edilmez.
   */
  async function verifyWithDeviceKey(auth: AuthContext, deviceKey: string): Promise<void> {
    const verified = await db.execute(sql`
      update sessions set verified_at = now()
      where id = ${auth.sessionId}
        and device_key_hash = ${sha256(deviceKey)}
        and not ${recentlyNewDevice}
    `);
    if (verified === 0) throw new AppError("device_key_rejected");
  }

  /** Hesabın telefon numarası; yeniden doğrulama kodu yalnızca bu numaraya gider. */
  async function phoneOf(userId: string): Promise<string> {
    const row = await db.maybeOne<{ phone: string | null }>(sql`
      select phone from users where id = ${userId}
    `);
    const phone = row?.phone ?? null;
    if (phone === null) throw new AppError("unauthorized");
    return phone;
  }

  /** Açık oturumda, hesabın numarasına işlem onay kodu gönderir. */
  async function requestVerification(auth: AuthContext, ip: string): Promise<RequestOtpResponse> {
    return issueOtp(await phoneOf(auth.userId), ip, "verify");
  }

  /** İşlem onay kodunu doğrular ve oturumu taze doğrulanmış sayar. */
  async function confirmVerification(auth: AuthContext, code: string): Promise<void> {
    await consumeOtp(await phoneOf(auth.userId), code, "verify");
    await db.execute(sql`update sessions set verified_at = now() where id = ${auth.sessionId}`);
  }

  async function listSessions(auth: AuthContext): Promise<Session[]> {
    const rows = await db.many<SessionRow>(sql`
      select
        id, device_name, platform, created_at, last_seen_at, expires_at, last_ip,
        ${recentlyNewDevice} as recently_new_device
      from sessions
      where user_id = ${auth.userId} and revoked_at is null and expires_at > now()
      order by last_seen_at desc
    `);
    return rows.map((row) => ({
      id: row.id,
      deviceName: row.device_name,
      platform: row.platform,
      createdAt: row.created_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      current: row.id === auth.sessionId,
      ip: row.last_ip,
      newDevice: row.recently_new_device,
    }));
  }

  /** Oturumu kapatır ve o oturumun açık bağlantılarını düşürür. */
  async function revokeSession(userId: string, sessionId: string): Promise<void> {
    const revoked = await db.execute(sql`
      update sessions set revoked_at = now()
      where id = ${sessionId} and user_id = ${userId} and revoked_at is null
    `);
    if (revoked === 0) throw new AppError("session_not_found");
    realtime.disconnectSession(sessionId);
  }

  /** Kullanıcının tüm oturumlarını kapatır (hesap askıya alma ve silmede kullanılır). */
  async function revokeAllSessions(userId: string): Promise<void> {
    const rows = await db.many<{ id: string }>(sql`
      update sessions set revoked_at = now()
      where user_id = ${userId} and revoked_at is null
      returning id
    `);
    for (const row of rows) realtime.disconnectSession(row.id);
  }

  /** Süresi geçmiş kodları ve eski oturum kayıtlarını siler. Düzenli aralıklarla çağrılır. */
  async function purgeExpired(): Promise<void> {
    await db.execute(sql`delete from otp_challenges where created_at < now() - interval '1 day'`);
    await db.execute(sql`
      delete from sessions
      where coalesce(revoked_at, expires_at) < now() - interval '30 days'
    `);
  }

  return {
    requestOtp,
    verifyOtp,
    authenticate,
    requireRecentVerification,
    verificationStatus,
    verifyWithDeviceKey,
    requestVerification,
    confirmVerification,
    listSessions,
    revokeSession,
    revokeAllSessions,
    purgeExpired,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
