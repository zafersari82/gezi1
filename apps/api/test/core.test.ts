import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { afterEach, describe, expect, inject, it, vi } from "vitest";

import { ConfigError, loadConfig } from "../src/core/config";
import { compile, createDatabase, type DatabasePool, sql } from "../src/core/database";
import { migrateKeys, toKeyEnv } from "../src/core/key-management";
import { safeEqual } from "../src/core/security";

describe("sql etiketi", () => {
  it("değerleri sıralı parametrelere çevirir", () => {
    const query = compile(sql`select * from users where id = ${"u1"} and status = ${"active"}`);
    expect(query.text).toBe("select * from users where id = $1 and status = $2");
    expect(query.values).toEqual(["u1", "active"]);
  });

  it("iç içe parçaları sorguya katar ve numaralandırmayı sürdürür", () => {
    const filter = sql`and phone = ${"+905551234567"}`;
    const query = compile(sql`select 1 from users where id = ${"u1"} ${filter} limit ${5}`);
    expect(query.text).toBe("select 1 from users where id = $1 and phone = $2 limit $3");
    expect(query.values).toEqual(["u1", "+905551234567", 5]);
  });

  it("parçaları ayraçla birleştirir", () => {
    const query = compile(
      sql`update users set ${sql.join([sql`bio = ${"a"}`, sql`username = ${"b"}`], ", ")}`,
    );
    expect(query.text).toBe("update users set bio = $1, username = $2");
    expect(query.values).toEqual(["a", "b"]);
  });

  it("kullanıcı metnini asla sorgu metnine karıştırmaz", () => {
    const query = compile(sql`select ${"'; drop table users; --"}`);
    expect(query.text).toBe("select $1");
  });
});

describe("veritabanı havuzu", () => {
  const pools: DatabasePool[] = [];
  const openPool = (): DatabasePool => {
    const pool = createDatabase(inject("databaseUrl"), 1);
    pools.push(pool);
    return pool;
  };
  const backendId = async (db: Pick<DatabasePool, "one">): Promise<number> =>
    (await db.one<{ pid: number }>(sql`select pg_backend_pid() as pid`)).pid;
  /** Veritabanı yeniden başlamış gibi, verilen bağlantıyı sunucu tarafında koparır. */
  const terminate = (admin: DatabasePool, pid: number) =>
    admin.execute(sql`select pg_terminate_backend(${pid}, 5000)`);

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.close()));
  });

  it("boştaki bağlantı kopunca süreç ayakta kalır ve havuz yeniden bağlanır", async () => {
    const db = openPool();
    const admin = openPool();

    const before = await backendId(db);
    await terminate(admin, before);

    await vi.waitFor(async () => {
      expect(await backendId(db)).not.toBe(before);
    });
  });

  it("boştaki bağlantının koptuğunu dinleyiciye bildirir", async () => {
    const db = openPool();
    const admin = openPool();
    const errors: Error[] = [];
    db.onIdleError((error) => {
      errors.push(error);
    });

    await terminate(admin, await backendId(db));

    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
  });

  it("işlem sırasında bağlantı koparsa asıl hatayı bildirir ve havuz çalışmaya devam eder", async () => {
    const db = openPool();
    const admin = openPool();
    let before = 0;

    await expect(
      db.transaction(async (tx) => {
        before = await backendId(tx);
        await terminate(admin, before);
        // İstemcinin kopmayı iki sorgu arasında, bekleyen sorgu yokken fark etmesi beklenir.
        await sleep(50);
        throw new Error("asıl hata");
      }),
    ).rejects.toThrow("asıl hata");

    expect(await backendId(db)).not.toBe(before);
  });
});

describe("yapılandırma", () => {
  const key = (seed: string) => createHash("sha256").update(seed).digest("hex");
  const production = {
    NODE_ENV: "production",
    VADO_DEMO_MODE: "false",
    VADO_OTP_KEYS: `k1:${key("otp")}`,
    VADO_QR_KEYS: `k1:${key("qr")}`,
    VADO_OPENID_KEY: key("openid"),
    VADO_IDENTITY_KEYS: `k1:${key("identity")}`,
    VADO_ADMIN_API_KEY: "y".repeat(40),
    VADO_SMS_PROVIDER: "webhook",
    VADO_SMS_WEBHOOK_URL: "https://sms.example.com/gonder",
    VADO_SMS_WEBHOOK_SECRET: "z".repeat(20),
  };

  it("geliştirme ortamında ayarsız çalışır", () => {
    const config = loadConfig({});
    expect(config.env).toBe("development");
    expect(config.demoMode).toBe(true);
    expect(config.paymentMode).toBe("sandbox");
    expect(config.keys.otp.map((entry) => entry.id)).toEqual(["dev"]);
    expect(config.keys.qr.map((entry) => entry.id)).toEqual(["dev"]);
    expect(config.legacySecretPresent).toBe(false);
  });

  it("eksiksiz canlı ortam ayarını kabul eder", () => {
    const config = loadConfig(production);
    expect(config.demoMode).toBe(false);
    expect(config.keys.qr.map((entry) => entry.id)).toEqual(["k1"]);
  });

  it.each([
    ["demo modu açık", { VADO_DEMO_MODE: "true" }],
    ["doğrulama kodu anahtarı yok", { VADO_OTP_KEYS: "" }],
    ["QR anahtarı yok", { VADO_QR_KEYS: "" }],
    ["mini uygulama kimliği anahtarı yok", { VADO_OPENID_KEY: "" }],
    ["anahtar kısa", { VADO_QR_KEYS: `k1:${key("qr").slice(0, 32)}` }],
    ["yönetici anahtarı kısa", { VADO_ADMIN_API_KEY: "kisa" }],
    ["SMS sağlayıcısı yok", { VADO_SMS_PROVIDER: "log" }],
    ["mini uygulama geliştirme kipi açık", { VADO_MINIAPP_DEV_MODE: "true" }],
    ["alt alan adı şablonu şifresiz", { VADO_APPS_ORIGIN: "http://{app}.mini.ornek.com" }],
  ])("canlı ortamda başlamayı reddeder: %s", (_label, override) => {
    expect(() => loadConfig({ ...production, ...override })).toThrow(ConfigError);
  });

  it("geliştirme kipi geliştirmede açık, canlıda kapalıdır", () => {
    expect(loadConfig({}).miniAppDevMode).toBe(true);
    expect(loadConfig({ VADO_MINIAPP_DEV_MODE: "false" }).miniAppDevMode).toBe(false);
    expect(loadConfig(production).miniAppDevMode).toBe(false);
    expect(() => loadConfig({ ...production, VADO_MINIAPP_DEV_MODE: "true" })).toThrow(
      /VADO_MINIAPP_DEV_MODE=false olmalıdır/,
    );
  });

  it("paket ayarlarının varsayılanlarını ve sınırlarını uygular", () => {
    const config = loadConfig({});
    expect(config.packageMaxBytes).toBe(5 * 1024 * 1024);
    expect(config.appsOrigin).toBeNull();
    expect(loadConfig({ VADO_PACKAGE_MAX_MB: "20" }).packageMaxBytes).toBe(20 * 1024 * 1024);
    expect(() => loadConfig({ VADO_PACKAGE_MAX_MB: "51" })).toThrow(ConfigError);
    expect(() => loadConfig({ VADO_PACKAGE_MAX_MB: "0" })).toThrow(ConfigError);
  });

  it("alt alan adı şablonunu doğrular: {app} bulunmalı, API o alan adının altında olmamalı", () => {
    const accepted = loadConfig({
      ...production,
      VADO_APPS_ORIGIN: "https://{app}.mini.ornek.com",
    });
    expect(accepted.appsOrigin).toBe("https://{app}.mini.ornek.com");
    expect(loadConfig({ VADO_APPS_ORIGIN: "" }).appsOrigin).toBeNull();

    expect(() => loadConfig({ VADO_APPS_ORIGIN: "https://mini.ornek.com" })).toThrow(/\{app\}/);
    expect(() => loadConfig({ VADO_APPS_ORIGIN: "https://{app}.mini.ornek.com/yol" })).toThrow(
      ConfigError,
    );
    expect(() =>
      loadConfig({
        VADO_PUBLIC_URL: "https://api.mini.ornek.com",
        VADO_APPS_ORIGIN: "https://{app}.mini.ornek.com",
      }),
    ).toThrow(/altında olamaz/);
  });

  it("geçişten sonra eski ana anahtarın hâlâ tanımlı olduğunu bildirir", () => {
    const appSecret = "x".repeat(40);
    const migrated = toKeyEnv(migrateKeys(appSecret, "2030-01-01"));
    const config = loadConfig({ ...production, ...migrated, VADO_APP_SECRET: appSecret });
    expect(config.legacySecretPresent).toBe(true);
    expect(loadConfig({ ...production, ...migrated }).legacySecretPresent).toBe(false);
  });

  it("canlı ortamda yalnızca eski ana anahtarla başlamaz ve geçiş yolunu gösterir", () => {
    const upgraded = {
      ...production,
      VADO_OTP_KEYS: "",
      VADO_QR_KEYS: "",
      VADO_OPENID_KEY: "",
      VADO_APP_SECRET: "x".repeat(40),
    };
    expect(() => loadConfig(upgraded)).toThrow(/keys migrate/);
  });
});

describe("güvenli karşılaştırma", () => {
  it("farklı uzunluktaki metinleri hata vermeden karşılaştırır", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("abc", "abc")).toBe(true);
  });
});
