import { randomInt } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ADMIN_KEY_HEADER,
  ADMIN_ROLES,
  type AdminRole,
  type ApiErrorBody,
  apiErrorBodySchema,
  type ErrorCode,
  isScopedRole,
} from "@vado/contracts";
import { expect, inject } from "vitest";
import type { z } from "zod";

import { type App, buildApp } from "../../src/app";
import { type Config, loadConfig } from "../../src/core/config";
import { createDatabase, type DatabasePool, sql } from "../../src/core/database";
import { randomToken, sha256 } from "../../src/core/security";
import type { PushMessage } from "../../src/providers/push";
import type { OtpPurpose } from "../../src/providers/sms";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface SentSms {
  phone: string;
  code: string;
  purpose: OtpPurpose;
}

export interface LogEntry {
  level: "info" | "warn" | "error";
  fields: unknown;
  message: string | undefined;
}

export interface TestApp extends App {
  config: Config;
  db: DatabasePool;
  platformDb: DatabasePool;
  /** Yalnızca eski kayıt veya bozuk şema hazırlayan testlerin kurulum bağlantısı. */
  migrationDb: DatabasePool;
  /** Demo modu kapalıyken "gönderilen" doğrulama kodları burada birikir. */
  sentSms: SentSms[];
  /** Sahte sağlayıcının "gönderdiği" anlık bildirimler burada birikir. */
  sentPush: PushMessage[];
  /** Bu adreslere giden bildirim sağlayıcıda "geçersiz adres" sonucunu alır. */
  invalidPushTokens: Set<string>;
  /** Servislerin günlüğe düştüğü kayıtlar burada birikir. */
  logs: LogEntry[];
  /** Her rolden, oturumu açık birer panel hesabı (bkz. `asAdmin`). */
  admins: Record<AdminRole, TestAdmin>;
  /** `admins.business` hesabının bağlı olduğu işletme. */
  adminBusinessId: string;
  stop: () => Promise<void>;
}

/** Oturumu açık, ikinci adımı geçilmiş bir panel hesabı. */
export interface TestAdmin {
  id: string;
  username: string;
  token: string;
  sessionId: string;
}

export interface TestUser {
  id: string;
  phone: string;
  name: string;
  token: string;
  sessionId: string;
}

export interface RequestOptions {
  body?: unknown;
  /**
   * İsteğin geldiği IP adresi. Verilmezse her istek ayrı bir adresten gelmiş sayılır; böylece
   * IP başına işleyen OTP sınırı yalnızca onu sınayan testleri etkiler.
   */
  ip?: string;
  headers?: Record<string, string>;
}

export interface Client {
  /** İsteği gönderir; durum kodunu ve çözümlenmiş gövdeyi döndürür. */
  request: (
    method: Method,
    url: string,
    options?: RequestOptions,
  ) => Promise<{ status: number; body: unknown }>;
  /** 200 bekler ve gövdeyi sözleşme şemasıyla doğrulayarak döndürür. */
  ok: <Schema extends z.ZodType>(
    schema: Schema,
    method: Method,
    url: string,
    options?: RequestOptions,
  ) => Promise<z.infer<Schema>>;
  /** 204 bekler. */
  done: (method: Method, url: string, options?: RequestOptions) => Promise<void>;
  /** İsteğin verilen hata koduyla reddedildiğini doğrular ve hata gövdesini döndürür. */
  fail: (
    code: ErrorCode,
    method: Method,
    url: string,
    options?: RequestOptions,
  ) => Promise<ApiErrorBody["error"]>;
}

/** Her test dosyası kendi uygulama örneğini kurar; veritabanı tüm dosyalar için ortaktır. */
export async function startTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const workDir = await mkdtemp(join(tmpdir(), "vado-test-"));
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: inject("databaseUrl"),
    DATABASE_MIGRATE_URL: inject("databaseMigrateUrl"),
    DATABASE_PLATFORM_URL: inject("databasePlatformUrl"),
    VADO_STORAGE_DIR: join(workDir, "storage"),
    VADO_PACKAGE_DIR: join(workDir, "package-store"),
    ...env,
  });
  const db = createDatabase(config.databaseUrl, 5);
  const platformDb = createDatabase(config.databasePlatformUrl, 3);
  const migrationDb = createDatabase(config.databaseMigrateUrl, 2);
  const sentSms: SentSms[] = [];
  const sentPush: PushMessage[] = [];
  const invalidPushTokens = new Set<string>();
  const logs: LogEntry[] = [];
  const record = (level: LogEntry["level"]) => (fields: unknown, message?: string) => {
    logs.push({ level, fields, message });
  };
  const app = await buildApp({
    config,
    db,
    platformDb,
    sms: {
      sendOtp(phone, code, purpose) {
        sentSms.push({ phone, code, purpose });
        return Promise.resolve();
      },
    },
    push: {
      send(messages) {
        sentPush.push(...messages);
        return Promise.resolve(
          messages.map((message) => (invalidPushTokens.has(message.to) ? "invalid" : "sent")),
        );
      },
    },
    log: { info: record("info"), warn: record("warn"), error: record("error") },
  });

  const adminBusinessId = await createBusiness(db, "Sınama İşletmesi");
  const admins = {} as Record<AdminRole, TestAdmin>;
  for (const role of ADMIN_ROLES) {
    admins[role] = await createAdmin(db, role, {
      businessId: isScopedRole(role) ? adminBusinessId : null,
    });
  }

  return {
    ...app,
    config,
    db,
    platformDb,
    sentSms,
    migrationDb,
    sentPush,
    invalidPushTokens,
    logs,
    admins,
    adminBusinessId,
    async stop() {
      await app.close();
      await db.close();
      await platformDb.close();
      await migrationDb.close();
      await rm(workDir, { recursive: true, force: true });
    },
  };
}

function randomIp(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

/** Çakışmayan, geçerli bir Türkiye cep telefonu numarası üretir. */
export function randomPhone(): string {
  return `+90555${randomInt(0, 10_000_000).toString().padStart(7, "0")}`;
}

/**
 * Girişe ve ikinci adıma girmeden, oturumu açık bir panel hesabı oluşturur. Parolası yoktur
 * (özeti hiçbir parolayla eşleşmez); girişi sınayan testler hesabı kendileri açar.
 */
export async function createAdmin(
  db: DatabasePool,
  role: AdminRole,
  options: { mustChangePassword?: boolean; businessId?: string | null } = {},
): Promise<TestAdmin> {
  const username = `${role}-${randomInt(0, 1_000_000_000)}`;
  const token = randomToken();
  const account = await db.one<{ id: string }>(sql`
    insert into admin_accounts (
      username, display_name, role, business_id, password_hash, must_change_password,
      totp_secret, totp_enabled_at
    )
    values (
      ${username}, ${`Sınama ${role}`}, ${role}, ${options.businessId ?? null}, 'parolasiz',
      ${options.mustChangePassword ?? false}, 'JBSWY3DPEHPK3PXP', now()
    )
    returning id
  `);
  const session = await db.one<{ id: string }>(sql`
    insert into admin_sessions (account_id, token_hash, stage, expires_at)
    values (${account.id}, ${sha256(token)}, 'active', now() + interval '1 hour')
    returning id
  `);
  return { id: account.id, username, token, sessionId: session.id };
}

/** Sahibiyle birlikte, yayında bir işletme oluşturur ve kimliğini döndürür. */
export async function createBusiness(db: DatabasePool, name: string): Promise<string> {
  const owner = await insertFixtureUser(db, `${name} sahibi`);
  const business = await db.one<{ id: string }>(sql`
    insert into businesses (owner_id, name, slug, category, city, verified, status)
    values (
      ${owner.id}, ${name}, ${`isletme-${randomToken().slice(0, 12).toLowerCase()}`}, 'food',
      'İstanbul', true, 'active'
    )
    returning id
  `);
  return business.id;
}

/** SMS doğrulamasına girmeden, adı ve az önce açılmış oturumu olan bir kullanıcı oluşturur. */
export async function createUser(app: TestApp, name: string): Promise<TestUser> {
  const user = await insertFixtureUser(app.db, name);
  const phone = user.phone;
  const token = randomToken();
  const session = await app.db.one<{ id: string }>(sql`
    insert into sessions (user_id, token_hash, device_name, platform, verified_at, expires_at)
    values (
      ${user.id}, ${sha256(token)}, 'Test cihazı', 'android', now(), now() + interval '1 day'
    )
    returning id
  `);
  return { id: user.id, phone, name, token, sessionId: session.id };
}

async function insertFixtureUser(
  db: DatabasePool,
  name: string,
): Promise<{ id: string; phone: string }> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const phone = randomPhone();
    const row = await db.maybeOne<{
      id: string;
    }>(sql`insert into users(phone,display_name,terms_version,terms_accepted_at)
      values(${phone},${name},'test',now()) on conflict(phone) do nothing returning id`);
    if (row !== null) return { id: row.id, phone };
  }
  throw new Error("Test kullanıcısı için benzersiz telefon üretilemedi");
}

/** İki kullanıcıyı doğrudan birbirinin kişisi yapar. */
export async function makeContacts(app: TestApp, a: TestUser, b: TestUser): Promise<void> {
  await app.db.execute(sql`
    insert into contacts (user_id, contact_id) values (${a.id}, ${b.id}), (${b.id}, ${a.id})
  `);
}

function createClient(app: TestApp, baseHeaders: Record<string, string>): Client {
  const request: Client["request"] = async (method, url, options = {}) => {
    const response = await app.server.inject({
      method,
      url,
      headers: { ...baseHeaders, ...options.headers },
      ...(options.body === undefined ? {} : { payload: options.body as object }),
      remoteAddress: options.ip ?? randomIp(),
    });
    const body: unknown = response.body === "" ? null : response.json();
    return { status: response.statusCode, body };
  };

  return {
    request,
    async ok(schema, method, url, options) {
      const response = await request(method, url, options);
      expect(response, `${method} ${url}`).toMatchObject({ status: 200 });
      return schema.parse(response.body);
    },
    async done(method, url, options) {
      const response = await request(method, url, options);
      expect(response, `${method} ${url}`).toEqual({ status: 204, body: null });
    },
    async fail(code, method, url, options) {
      const response = await request(method, url, options);
      const body = apiErrorBodySchema.parse(response.body);
      expect(body.error.code, `${method} ${url}`).toBe(code);
      expect(response.status).toBeGreaterThanOrEqual(400);
      return body.error;
    },
  };
}

/** Verilen oturum belirteciyle istek gönderen istemci. */
export function withToken(app: TestApp, token: string): Client {
  return createClient(app, { authorization: `Bearer ${token}` });
}

/** Kullanıcı adına istek gönderen istemci. */
export function as(app: TestApp, user: TestUser): Client {
  return withToken(app, user.token);
}

/** Oturumsuz istemci. */
export function anonymous(app: TestApp): Client {
  return createClient(app, {});
}

/** Panel sunucusunun yaptığı gibi: yönetici anahtarı ve panel hesabının oturumuyla. */
export function asAdminSession(app: TestApp, token: string): Client {
  return createClient(app, {
    [ADMIN_KEY_HEADER]: app.config.adminApiKey,
    authorization: `Bearer ${token}`,
  });
}

/** Yalnızca yönetici anahtarıyla, oturumsuz: panelin giriş sayfası gibi. */
export function asPanel(app: TestApp): Client {
  return createClient(app, { [ADMIN_KEY_HEADER]: app.config.adminApiKey });
}

/** Verilen roldeki hazır panel hesabıyla (varsayılan: sahip) istek gönderen istemci. */
export function asAdmin(app: TestApp, role: AdminRole = "owner"): Client {
  return asAdminSession(app, app.admins[role].token);
}

/** Geçerli en küçük PNG dosyası (1x1 piksel). */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Tek dosyalık çok parçalı yükleme gövdesi oluşturur. */
export function multipartBody(
  field: string,
  filename: string,
  data: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----vado-test-boundary";
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
      "Content-Type: application/octet-stream\r\n\r\n",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

/** Kullanıcı adına bir görsel yükler ve medya kimliğini döndürür. */
export async function uploadImage(
  app: TestApp,
  user: TestUser,
): Promise<{ id: string; url: string }> {
  const { payload, headers } = multipartBody("file", "foto.png", TINY_PNG);
  const response = await app.server.inject({
    method: "POST",
    url: "/v1/media",
    headers: { ...headers, authorization: `Bearer ${user.token}` },
    payload,
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ id: string; url: string }>();
}

/** Yüklenmiş bir görselin adresi hâlâ sunuluyor mu? */
export async function isServed(app: TestApp, mediaUrl: string): Promise<boolean> {
  const response = await app.server.inject({
    method: "GET",
    url: mediaUrl.slice(app.config.publicUrl.length),
  });
  return response.statusCode === 200;
}
