import { randomInt } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ADMIN_KEY_HEADER,
  type ApiErrorBody,
  apiErrorBodySchema,
  type ErrorCode,
} from "@vado/contracts";
import { expect, inject } from "vitest";
import type { z } from "zod";

import { type App, buildApp } from "../../src/app";
import { type Config, loadConfig } from "../../src/core/config";
import { createDatabase, type DatabasePool, sql } from "../../src/core/database";
import { randomToken, sha256 } from "../../src/core/security";
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
  /** Demo modu kapalıyken "gönderilen" doğrulama kodları burada birikir. */
  sentSms: SentSms[];
  /** Servislerin günlüğe düştüğü kayıtlar burada birikir. */
  logs: LogEntry[];
  stop: () => Promise<void>;
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
    VADO_STORAGE_DIR: join(workDir, "storage"),
    VADO_PACKAGE_DIR: join(workDir, "package-store"),
    ...env,
  });
  const db = createDatabase(config.databaseUrl, 5);
  const sentSms: SentSms[] = [];
  const logs: LogEntry[] = [];
  const record = (level: LogEntry["level"]) => (fields: unknown, message?: string) => {
    logs.push({ level, fields, message });
  };
  const app = await buildApp({
    config,
    db,
    sms: {
      sendOtp(phone, code, purpose) {
        sentSms.push({ phone, code, purpose });
        return Promise.resolve();
      },
    },
    log: { info: record("info"), warn: record("warn"), error: record("error") },
  });

  return {
    ...app,
    config,
    db,
    sentSms,
    logs,
    async stop() {
      await app.close();
      await db.close();
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

/** SMS doğrulamasına girmeden, adı ve az önce açılmış oturumu olan bir kullanıcı oluşturur. */
export async function createUser(app: TestApp, name: string): Promise<TestUser> {
  const phone = randomPhone();
  const token = randomToken();
  const user = await app.db.one<{ id: string }>(sql`
    insert into users (phone, display_name, terms_version, terms_accepted_at)
    values (${phone}, ${name}, 'test', now())
    returning id
  `);
  const session = await app.db.one<{ id: string }>(sql`
    insert into sessions (user_id, token_hash, device_name, platform, verified_at, expires_at)
    values (
      ${user.id}, ${sha256(token)}, 'Test cihazı', 'android', now(), now() + interval '1 day'
    )
    returning id
  `);
  return { id: user.id, phone, name, token, sessionId: session.id };
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

/** Yönetim paneli gibi yönetici anahtarıyla istek gönderen istemci. */
export function asAdmin(app: TestApp): Client {
  return createClient(app, { [ADMIN_KEY_HEADER]: app.config.adminApiKey });
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
